import type { CookieJar } from 'tough-cookie';

export interface PendingLogin {
  phone: string;
  jar: CookieJar;
}

export const SESSION_COOKIE_NAME = 'swiggy_session';
export const SESSION_TTL_MS = 10 * 60 * 1000;
