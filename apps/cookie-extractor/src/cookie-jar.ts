import { CookieJar } from 'tough-cookie';

export interface ExtractedAuthCookies {
  _session_tid: string;
  tid: string;
  sid: string;
  userLocation?: string;
}

const SWIGGY_URL = 'https://www.swiggy.com/';
const REQUIRED_COOKIES = ['_session_tid', 'tid', 'sid'] as const;

export function createJar(): CookieJar {
  return new CookieJar();
}

export async function extractAuthCookies(jar: CookieJar): Promise<ExtractedAuthCookies> {
  const cookies = await jar.getCookies(SWIGGY_URL);
  const map = new Map<string, string>();
  for (const c of cookies) {
    map.set(c.key, c.value);
  }
  const missing = REQUIRED_COOKIES.filter((name) => !map.has(name));
  if (missing.length > 0) {
    throw new Error(`Missing required Swiggy cookies: ${missing.join(', ')}`);
  }
  const sessionTid = map.get('_session_tid');
  const tid = map.get('tid');
  const sid = map.get('sid');
  if (sessionTid === undefined || tid === undefined || sid === undefined) {
    throw new Error('Required Swiggy cookies missing after presence check');
  }
  const userLocation = map.get('userLocation');
  const result: ExtractedAuthCookies = {
    _session_tid: sessionTid,
    tid,
    sid,
  };
  if (userLocation !== undefined) {
    result.userLocation = userLocation;
  }
  return result;
}

export async function fetchWithJar(
  jar: CookieJar,
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookieHeader = await jar.getCookieString(url);
  if (cookieHeader.length > 0) {
    headers.set('cookie', cookieHeader);
  }
  const res = await fetchImpl(url, { ...init, headers });
  const setCookieValues = res.headers.getSetCookie();
  for (const sc of setCookieValues) {
    await jar.setCookie(sc, url, { ignoreError: true });
  }
  return res;
}
