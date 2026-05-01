import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ENDPOINTS, SwiggyClient, SwiggyClientError } from '../src/swiggy-client.js';
import { createJar, extractAuthCookies } from '../src/cookie-jar.js';
import smsOtpSuccess from './fixtures/sms-otp-success.json' with { type: 'json' };
import smsOtpRateLimited from './fixtures/sms-otp-rate-limited.json' with { type: 'json' };
import otpVerifySuccess from './fixtures/otp-verify-success.json' with { type: 'json' };
import otpVerifyInvalid from './fixtures/otp-verify-invalid.json' with { type: 'json' };
import orderListSuccess from './fixtures/order-list-success.json' with { type: 'json' };
import orderListUnauth from './fixtures/order-list-unauthenticated.json' with { type: 'json' };

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe('ENDPOINTS', () => {
  it('exposes all required Swiggy endpoints in one place', () => {
    expect(ENDPOINTS.home).toBe('https://www.swiggy.com/');
    expect(ENDPOINTS.smsOtp).toBe('https://www.swiggy.com/dapi/auth/sms-otp');
    expect(ENDPOINTS.otpVerify).toBe('https://www.swiggy.com/dapi/auth/otp-verify');
    expect(ENDPOINTS.orderList).toBe(
      'https://www.swiggy.com/dapi/order/all?order_id=&offset=0&limit=1',
    );
  });
});

describe('SwiggyClient.seedSession', () => {
  it('GETs the home page and stores seed cookies', async () => {
    server.use(
      http.get('https://www.swiggy.com/', () => {
        return new HttpResponse('<html></html>', {
          status: 200,
          headers: {
            'set-cookie': '__SW=seed-sw-value; Domain=.swiggy.com; Path=/',
          },
        });
      }),
    );
    const jar = createJar();
    const client = new SwiggyClient(jar);
    await client.seedSession();
    const cookies = await jar.getCookies('https://www.swiggy.com/');
    expect(cookies.find((c) => c.key === '__SW')?.value).toBe('seed-sw-value');
  });

  it('throws on non-2xx home response', async () => {
    server.use(
      http.get('https://www.swiggy.com/', () => HttpResponse.text('boom', { status: 500 })),
    );
    const jar = createJar();
    const client = new SwiggyClient(jar);
    await expect(client.seedSession()).rejects.toBeInstanceOf(SwiggyClientError);
  });
});

describe('SwiggyClient.requestOtp', () => {
  it('POSTs JSON body with mobile and forwards cookies from jar', async () => {
    let observedBody: unknown = null;
    let observedCookieHeader: string | null = null;
    let observedContentType: string | null = null;

    server.use(
      http.post('https://www.swiggy.com/dapi/auth/sms-otp', async ({ request }) => {
        observedBody = await request.json();
        observedCookieHeader = request.headers.get('cookie');
        observedContentType = request.headers.get('content-type');
        return HttpResponse.json(smsOtpSuccess);
      }),
    );
    const jar = createJar();
    await jar.setCookie(
      '__SW=seed-sw-value; Domain=.swiggy.com; Path=/',
      'https://www.swiggy.com/',
    );

    const client = new SwiggyClient(jar);
    await client.requestOtp('9876543210');

    expect(observedBody).toEqual({ mobile: '9876543210' });
    expect(observedCookieHeader).toContain('__SW=seed-sw-value');
    expect(observedContentType).toContain('application/json');
  });

  it('throws SwiggyClientError on rate-limited response', async () => {
    server.use(
      http.post('https://www.swiggy.com/dapi/auth/sms-otp', () =>
        HttpResponse.json(smsOtpRateLimited, { status: 429 }),
      ),
    );
    const jar = createJar();
    const client = new SwiggyClient(jar);
    await expect(client.requestOtp('9876543210')).rejects.toBeInstanceOf(SwiggyClientError);
  });

  it('throws SwiggyClientError on non-zero statusCode body', async () => {
    server.use(
      http.post('https://www.swiggy.com/dapi/auth/sms-otp', () =>
        HttpResponse.json(smsOtpRateLimited, { status: 200 }),
      ),
    );
    const jar = createJar();
    const client = new SwiggyClient(jar);
    await expect(client.requestOtp('9876543210')).rejects.toThrow(/Too many OTP/);
  });
});

describe('SwiggyClient.verifyOtp', () => {
  it('captures auth cookies from Set-Cookie on success', async () => {
    server.use(
      http.post('https://www.swiggy.com/dapi/auth/otp-verify', () => {
        const headers = new Headers({ 'content-type': 'application/json' });
        headers.append(
          'set-cookie',
          '_session_tid=fixture-stid; Domain=.swiggy.com; Path=/; HttpOnly',
        );
        headers.append('set-cookie', 'tid=fixture-tid; Domain=.swiggy.com; Path=/; HttpOnly');
        headers.append('set-cookie', 'sid=fixture-sid; Domain=.swiggy.com; Path=/; HttpOnly');
        return new HttpResponse(JSON.stringify(otpVerifySuccess), { status: 200, headers });
      }),
    );
    const jar = createJar();
    const client = new SwiggyClient(jar);
    await client.verifyOtp('9876543210', '123456');
    const auth = await extractAuthCookies(jar);
    expect(auth._session_tid).toBe('fixture-stid');
    expect(auth.tid).toBe('fixture-tid');
    expect(auth.sid).toBe('fixture-sid');
  });

  it('throws on invalid OTP response', async () => {
    server.use(
      http.post('https://www.swiggy.com/dapi/auth/otp-verify', () =>
        HttpResponse.json(otpVerifyInvalid, { status: 200 }),
      ),
    );
    const jar = createJar();
    const client = new SwiggyClient(jar);
    await expect(client.verifyOtp('9876543210', '000000')).rejects.toThrow(/Invalid OTP/);
  });
});

describe('SwiggyClient.confirmSession', () => {
  it('returns true on 200 order list response', async () => {
    server.use(
      http.get('https://www.swiggy.com/dapi/order/all', () => HttpResponse.json(orderListSuccess)),
    );
    const jar = createJar();
    const client = new SwiggyClient(jar);
    const ok = await client.confirmSession();
    expect(ok).toBe(true);
  });

  it('throws on unauthenticated order list response', async () => {
    server.use(
      http.get('https://www.swiggy.com/dapi/order/all', () =>
        HttpResponse.json(orderListUnauth, { status: 401 }),
      ),
    );
    const jar = createJar();
    const client = new SwiggyClient(jar);
    await expect(client.confirmSession()).rejects.toBeInstanceOf(SwiggyClientError);
  });
});
