/*
 * Unofficial Swiggy web endpoints used by the OTP-based login flow on
 * https://www.swiggy.com. These are not part of any public API contract and
 * may change without notice. If a request starts failing, the URLs, payload
 * shape, or required headers below are the most likely culprits.
 * Last verified: 2026-05-01.
 */

import type { CookieJar } from 'tough-cookie';
import { fetchWithJar } from './cookie-jar.js';

export const ENDPOINTS = {
  home: 'https://www.swiggy.com/',
  smsOtp: 'https://www.swiggy.com/dapi/auth/sms-otp',
  otpVerify: 'https://www.swiggy.com/dapi/auth/otp-verify',
  orderList: 'https://www.swiggy.com/dapi/order/all?order_id=&offset=0&limit=1',
} as const;

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json',
  accept: 'application/json',
  'user-agent': USER_AGENT,
  origin: 'https://www.swiggy.com',
  referer: 'https://www.swiggy.com/',
};

export class SwiggyClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'SwiggyClientError';
  }
}

interface SwiggyEnvelope {
  statusCode?: number;
  statusMessage?: string;
  data?: unknown;
}

function isEnvelope(value: unknown): value is SwiggyEnvelope {
  return typeof value === 'object' && value !== null;
}

async function readEnvelope(res: Response): Promise<SwiggyEnvelope> {
  const text = await res.text();
  if (text.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return isEnvelope(parsed) ? parsed : {};
  } catch {
    throw new SwiggyClientError(`Non-JSON response (${res.status.toString()})`, res.status, text);
  }
}

export class SwiggyClient {
  constructor(
    private readonly jar: CookieJar,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async seedSession(): Promise<void> {
    const res = await fetchWithJar(
      this.jar,
      ENDPOINTS.home,
      {
        method: 'GET',
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'user-agent': USER_AGENT,
        },
      },
      this.fetchImpl,
    );
    if (!res.ok) {
      throw new SwiggyClientError(
        `Failed to seed Swiggy session (${res.status.toString()})`,
        res.status,
      );
    }
  }

  async requestOtp(mobile: string): Promise<void> {
    const res = await fetchWithJar(
      this.jar,
      ENDPOINTS.smsOtp,
      {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ mobile }),
      },
      this.fetchImpl,
    );
    const body = await readEnvelope(res);
    if (!res.ok) {
      throw new SwiggyClientError(
        body.statusMessage ?? `OTP request failed (${res.status.toString()})`,
        res.status,
        body,
      );
    }
    if (typeof body.statusCode === 'number' && body.statusCode !== 0) {
      throw new SwiggyClientError(
        body.statusMessage ?? 'OTP request rejected by Swiggy',
        res.status,
        body,
      );
    }
  }

  async verifyOtp(mobile: string, otp: string): Promise<void> {
    const res = await fetchWithJar(
      this.jar,
      ENDPOINTS.otpVerify,
      {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ mobile, otp }),
      },
      this.fetchImpl,
    );
    const body = await readEnvelope(res);
    if (!res.ok) {
      throw new SwiggyClientError(
        body.statusMessage ?? `OTP verify failed (${res.status.toString()})`,
        res.status,
        body,
      );
    }
    if (typeof body.statusCode === 'number' && body.statusCode !== 0) {
      throw new SwiggyClientError(
        body.statusMessage ?? 'OTP verification rejected by Swiggy',
        res.status,
        body,
      );
    }
  }

  async confirmSession(): Promise<boolean> {
    const res = await fetchWithJar(
      this.jar,
      ENDPOINTS.orderList,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
          referer: 'https://www.swiggy.com/my-account/orders',
        },
      },
      this.fetchImpl,
    );
    const body = await readEnvelope(res);
    if (!res.ok) {
      throw new SwiggyClientError(
        body.statusMessage ?? `Session confirmation failed (${res.status.toString()})`,
        res.status,
        body,
      );
    }
    if (typeof body.statusCode === 'number' && body.statusCode !== 0) {
      throw new SwiggyClientError(
        body.statusMessage ?? 'Session not authenticated',
        res.status,
        body,
      );
    }
    return true;
  }
}
