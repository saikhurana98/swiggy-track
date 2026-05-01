import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve as joinPath } from 'node:path';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page, Request } from 'playwright';
import { SwiggyAuthCookiesSchema } from '@swiggy-track/shared-types';
import type { SwiggyAuthCookies } from '@swiggy-track/shared-types';
import type { BrowserCookie } from './types.js';

const SWIGGY_HOME = 'https://www.swiggy.com/';
const SMS_OTP_PATH = '/dapi/auth/sms-otp';
const PROFILE_DIR = joinPath(homedir(), '.cache', 'swiggy-cookie-extractor', 'profile');
const STEALTH_INIT = `Object.defineProperty(navigator,'webdriver',{get:()=>undefined});`;

function isSwiggyDomain(domain: string): boolean {
  return domain === 'swiggy.com' || domain === '.swiggy.com' || domain.endsWith('.swiggy.com');
}

function findCookie(cookies: BrowserCookie[], name: string): BrowserCookie | undefined {
  return cookies.find((c) => c.name === name && isSwiggyDomain(c.domain));
}

export function hasRequiredAuthCookies(cookies: BrowserCookie[]): boolean {
  const sessionTid = findCookie(cookies, '_session_tid');
  const isLoggedIn = findCookie(cookies, '_is_logged_in');
  return sessionTid !== undefined && isLoggedIn?.value === '1';
}

export interface ExtractInput {
  phoneLast4: string;
}

function tryDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractAuthCookies(
  cookies: BrowserCookie[],
  input: ExtractInput,
): SwiggyAuthCookies {
  const sessionTid = findCookie(cookies, '_session_tid');
  const tid = findCookie(cookies, 'tid');
  const sid = findCookie(cookies, 'sid');
  const userLocation = findCookie(cookies, 'userLocation');

  if (sessionTid === undefined) {
    throw new Error('Missing required cookie on .swiggy.com: _session_tid');
  }

  const built: Record<string, string> = {
    _session_tid: sessionTid.value,
    capturedAt: new Date().toISOString(),
    phoneLast4: input.phoneLast4,
  };
  if (tid !== undefined) built['tid'] = tid.value;
  if (sid !== undefined) built['sid'] = sid.value;
  if (userLocation !== undefined) {
    built['userLocation'] = tryDecode(userLocation.value);
  }

  return SwiggyAuthCookiesSchema.parse(built);
}

export interface LaunchedBrowser {
  browser: Browser | undefined;
  context: BrowserContext;
  page: Page;
}

export async function launchChromium(): Promise<LaunchedBrowser> {
  mkdirSync(PROFILE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--no-first-run',
    ],
  });
  await context.addInitScript(STEALTH_INIT);
  const existing = context.pages();
  const page = existing[0] ?? (await context.newPage());
  return { browser: undefined, context, page };
}

export async function gotoSwiggyHome(page: Page): Promise<void> {
  await page.goto(SWIGGY_HOME, { waitUntil: 'domcontentloaded' });
}

export async function clickSignIn(page: Page): Promise<void> {
  const locator = page.locator("xpath=//*[normalize-space(text())='Sign In']").first();
  await locator.scrollIntoViewIfNeeded({ timeout: 15_000 });
  await locator.click({ timeout: 15_000 });
}

export interface PhoneCapture {
  latest: string | undefined;
}

export function attachPhoneSniffer(page: Page): PhoneCapture {
  const capture: PhoneCapture = { latest: undefined };
  page.on('request', (req: Request) => {
    if (!req.url().endsWith(SMS_OTP_PATH)) return;
    if (req.method() !== 'POST') return;
    try {
      const body = req.postDataJSON() as unknown;
      if (body !== null && typeof body === 'object' && 'mobile' in body) {
        const mobile: unknown = (body as Record<string, unknown>)['mobile'];
        if (typeof mobile === 'string') {
          capture.latest = mobile;
        }
      }
    } catch {
      // ignore unparseable bodies
    }
  });
  return capture;
}

export async function pollForAuthCookies(
  context: BrowserContext,
  options: { timeoutMs: number; intervalMs?: number; signal?: AbortSignal },
): Promise<BrowserCookie[]> {
  const interval = options.intervalMs ?? 2000;
  const start = Date.now();
  for (;;) {
    if (options.signal?.aborted === true) {
      throw new Error('Aborted');
    }
    const cookies = (await context.cookies()) as BrowserCookie[];
    if (hasRequiredAuthCookies(cookies)) return cookies;
    if (Date.now() - start > options.timeoutMs) {
      throw new Error(`Timed out after ${String(options.timeoutMs)}ms waiting for login`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
