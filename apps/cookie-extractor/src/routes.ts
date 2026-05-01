import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  PhoneNumberSchema,
  OtpCodeSchema,
  SwiggyAuthCookiesSchema,
  type SwiggyAuthCookies,
} from '@swiggy-track/shared-types';
import { createJar, extractAuthCookies } from './cookie-jar.js';
import { SessionStore } from './session-store.js';
import { SwiggyClient, SwiggyClientError } from './swiggy-client.js';
import { donePage, maskPhone, otpPage, phonePage } from './templates.js';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, type PendingLogin } from './types.js';

const PhoneRequestSchema = z.object({ phone: PhoneNumberSchema }).strict();
const OtpRequestSchema = z.object({ otp: OtpCodeSchema }).strict();

export interface CreateAppOptions {
  fetchImpl?: typeof fetch;
  sessionTtlMs?: number;
}

export interface CreatedApp {
  app: Hono;
  sessions: SessionStore<PendingLogin>;
}

export function createApp(options: CreateAppOptions = {}): CreatedApp {
  const sessions = new SessionStore<PendingLogin>(options.sessionTtlMs ?? SESSION_TTL_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  const app = new Hono();

  app.get('/api/healthz', (c) => c.json({ status: 'ok' }));

  app.get('/', (c) => c.html(phonePage()));

  app.post('/api/otp/request', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
    }
    const parsed = PhoneRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json({ ok: false, error: issue?.message ?? 'Invalid phone' }, 400);
    }
    const phone = parsed.data.phone;
    const jar = createJar();
    const client = new SwiggyClient(jar, fetchImpl);
    try {
      await client.seedSession();
      await client.requestOtp(phone);
    } catch (err) {
      const message = err instanceof SwiggyClientError ? err.message : 'Upstream Swiggy error';
      return c.json({ ok: false, error: message }, 502);
    }
    const id = sessions.create({ phone, jar });
    setCookie(c, SESSION_COOKIE_NAME, id, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: Math.floor((options.sessionTtlMs ?? SESSION_TTL_MS) / 1000),
    });
    return c.json({ ok: true });
  });

  app.get('/otp', (c) => {
    const sid = getCookie(c, SESSION_COOKIE_NAME);
    const session = sid ? sessions.get(sid) : undefined;
    if (!session) {
      return c.redirect('/', 302);
    }
    return c.html(otpPage(maskPhone(session.phone)));
  });

  app.post('/api/otp/verify', async (c) => {
    const sid = getCookie(c, SESSION_COOKIE_NAME);
    const session = sid ? sessions.get(sid) : undefined;
    if (!sid || !session) {
      return c.json({ ok: false, error: 'No active OTP session. Start over.' }, 400);
    }
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
    }
    const parsed = OtpRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json({ ok: false, error: issue?.message ?? 'Invalid OTP' }, 400);
    }
    const client = new SwiggyClient(session.jar, fetchImpl);
    try {
      await client.verifyOtp(session.phone, parsed.data.otp);
      await client.confirmSession();
    } catch (err) {
      const message = err instanceof SwiggyClientError ? err.message : 'Upstream Swiggy error';
      return c.json({ ok: false, error: message }, 502);
    }
    let extracted;
    try {
      extracted = await extractAuthCookies(session.jar);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to extract cookies';
      return c.json({ ok: false, error: message }, 502);
    }
    const cookiesPayload: SwiggyAuthCookies = SwiggyAuthCookiesSchema.parse({
      _session_tid: extracted._session_tid,
      tid: extracted.tid,
      sid: extracted.sid,
      ...(extracted.userLocation !== undefined ? { userLocation: extracted.userLocation } : {}),
      capturedAt: new Date().toISOString(),
      phoneLast4: session.phone.slice(-4),
    });
    sessions.delete(sid);
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
    return c.json({ ok: true, cookies: cookiesPayload });
  });

  app.get('/done', (c) => c.html(donePage()));

  return { app, sessions };
}
