import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page, Request } from 'playwright';
import { SwiggyAuthCookiesSchema } from '@swiggy-track/shared-types';
import type { SwiggyAuthCookies } from '@swiggy-track/shared-types';
import type { BrowserCookie } from './types.js';

const SWIGGY_HOME = 'https://www.swiggy.com/';
const SMS_OTP_PATH = '/dapi/auth/sms-otp';

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

  const missing: string[] = [];
  if (sessionTid === undefined) missing.push('_session_tid');
  if (tid === undefined) missing.push('tid');
  if (sid === undefined) missing.push('sid');
  if (missing.length > 0) {
    throw new Error(`Missing required cookies on .swiggy.com: ${missing.join(', ')}`);
  }

  const built: Record<string, string> = {
    _session_tid: sessionTid?.value ?? '',
    tid: tid?.value ?? '',
    sid: sid?.value ?? '',
    capturedAt: new Date().toISOString(),
    phoneLast4: input.phoneLast4,
  };
  if (userLocation !== undefined) {
    built['userLocation'] = tryDecode(userLocation.value);
  }

  return SwiggyAuthCookiesSchema.parse(built);
}

export interface LaunchedBrowser {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function launchChromium(): Promise<LaunchedBrowser> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  return { browser, context, page };
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
