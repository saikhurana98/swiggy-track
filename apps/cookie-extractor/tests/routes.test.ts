import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { SwiggyAuthCookiesSchema } from '@swiggy-track/shared-types';
import { createApp } from '../src/routes.js';
import smsOtpSuccess from './fixtures/sms-otp-success.json' with { type: 'json' };
import smsOtpRateLimited from './fixtures/sms-otp-rate-limited.json' with { type: 'json' };
import otpVerifySuccess from './fixtures/otp-verify-success.json' with { type: 'json' };
import otpVerifyInvalid from './fixtures/otp-verify-invalid.json' with { type: 'json' };
import orderListSuccess from './fixtures/order-list-success.json' with { type: 'json' };

const mswServer = setupServer();

beforeAll(() => {
  mswServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  mswServer.resetHandlers();
});

afterAll(() => {
  mswServer.close();
});

function homeOk(): ReturnType<typeof http.get> {
  return http.get(
    'https://www.swiggy.com/',
    () =>
      new HttpResponse('<html></html>', {
        status: 200,
        headers: { 'set-cookie': '__SW=seed; Domain=.swiggy.com; Path=/' },
      }),
  );
}

function smsOtpOk(): ReturnType<typeof http.post> {
  return http.post('https://www.swiggy.com/dapi/auth/sms-otp', () =>
    HttpResponse.json(smsOtpSuccess),
  );
}

function otpVerifyOkWithCookies(): ReturnType<typeof http.post> {
  return http.post('https://www.swiggy.com/dapi/auth/otp-verify', () => {
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append('set-cookie', '_session_tid=stid-val; Domain=.swiggy.com; Path=/; HttpOnly');
    headers.append('set-cookie', 'tid=tid-val; Domain=.swiggy.com; Path=/; HttpOnly');
    headers.append('set-cookie', 'sid=sid-val; Domain=.swiggy.com; Path=/; HttpOnly');
    return new HttpResponse(JSON.stringify(otpVerifySuccess), { status: 200, headers });
  });
}

function orderListOk(): ReturnType<typeof http.get> {
  return http.get('https://www.swiggy.com/dapi/order/all', () =>
    HttpResponse.json(orderListSuccess),
  );
}

function getSessionCookie(setCookieHeader: string | null): string | undefined {
  if (!setCookieHeader) return undefined;
  const match = /swiggy_session=([^;]+)/.exec(setCookieHeader);
  return match?.[1];
}

describe('healthz', () => {
  it('returns ok', async () => {
    const { app } = createApp();
    const res = await app.request('/api/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /', () => {
  it('renders the phone entry page', async () => {
    const { app } = createApp();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('Swiggy cookie extractor');
    expect(body).toContain('id="phone"');
  });
});

describe('POST /api/otp/request', () => {
  it('rejects malformed phone numbers', async () => {
    const { app } = createApp();
    const res = await app.request('/api/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '12345' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
  });

  it('issues a session cookie on success', async () => {
    mswServer.use(homeOk(), smsOtpOk());
    const { app } = createApp();
    const res = await app.request('/api/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    const sessionId = getSessionCookie(res.headers.get('set-cookie'));
    expect(sessionId).toBeTruthy();
  });

  it('surfaces Swiggy errors to the client', async () => {
    mswServer.use(
      homeOk(),
      http.post('https://www.swiggy.com/dapi/auth/sms-otp', () =>
        HttpResponse.json(smsOtpRateLimited, { status: 429 }),
      ),
    );
    const { app } = createApp();
    const res = await app.request('/api/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Too many OTP/);
  });
});

describe('GET /otp', () => {
  it('redirects to / without a valid session', async () => {
    const { app } = createApp();
    const res = await app.request('/otp');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });

  it('renders OTP page with masked phone when session present', async () => {
    mswServer.use(homeOk(), smsOtpOk());
    const { app } = createApp();
    const reqRes = await app.request('/api/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    const setCookie = reqRes.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    const cookieHeader = setCookie!.split(';')[0]!;

    const otpRes = await app.request('/otp', {
      headers: { cookie: cookieHeader },
    });
    expect(otpRes.status).toBe(200);
    const body = await otpRes.text();
    expect(body).toContain('+91 XXXXX-XX3210');
  });
});

describe('POST /api/otp/verify', () => {
  it('rejects when no session cookie present', async () => {
    const { app } = createApp();
    const res = await app.request('/api/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ otp: '123456' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns validated cookie JSON on success', async () => {
    mswServer.use(homeOk(), smsOtpOk(), otpVerifyOkWithCookies(), orderListOk());
    const { app } = createApp();
    const reqRes = await app.request('/api/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    const cookieHeader = reqRes.headers.get('set-cookie')!.split(';')[0]!;

    const verifyRes = await app.request('/api/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({ otp: '123456' }),
    });
    expect(verifyRes.status).toBe(200);
    const body = (await verifyRes.json()) as { ok: boolean; cookies: unknown };
    expect(body.ok).toBe(true);
    const parsed = SwiggyAuthCookiesSchema.parse(body.cookies);
    expect(parsed._session_tid).toBe('stid-val');
    expect(parsed.tid).toBe('tid-val');
    expect(parsed.sid).toBe('sid-val');
    expect(parsed.phoneLast4).toBe('3210');
  });

  it('surfaces invalid OTP from Swiggy', async () => {
    mswServer.use(
      homeOk(),
      smsOtpOk(),
      http.post('https://www.swiggy.com/dapi/auth/otp-verify', () =>
        HttpResponse.json(otpVerifyInvalid, { status: 200 }),
      ),
    );
    const { app } = createApp();
    const reqRes = await app.request('/api/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    const cookieHeader = reqRes.headers.get('set-cookie')!.split(';')[0]!;

    const verifyRes = await app.request('/api/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({ otp: '000000' }),
    });
    expect(verifyRes.status).toBe(502);
    const body = (await verifyRes.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Invalid OTP/);
  });

  it('rejects malformed OTP code', async () => {
    mswServer.use(homeOk(), smsOtpOk());
    const { app } = createApp();
    const reqRes = await app.request('/api/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    const cookieHeader = reqRes.headers.get('set-cookie')!.split(';')[0]!;
    const verifyRes = await app.request('/api/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({ otp: 'abc' }),
    });
    expect(verifyRes.status).toBe(400);
  });
});

describe('GET /done', () => {
  it('renders the done page with a copy button', async () => {
    const { app } = createApp();
    const res = await app.request('/done');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Cookies captured');
    expect(body).toContain('id="copy-btn"');
    expect(body).toMatch(/secrets/i);
  });
});
