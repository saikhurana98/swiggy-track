import { describe, expect, it } from 'vitest';
import { createJar, extractAuthCookies, fetchWithJar } from '../src/cookie-jar.js';

describe('cookie-jar', () => {
  describe('createJar', () => {
    it('returns an empty CookieJar', async () => {
      const jar = createJar();
      const cookies = await jar.getCookies('https://www.swiggy.com/');
      expect(cookies).toEqual([]);
    });
  });

  describe('extractAuthCookies', () => {
    it('returns required cookies when all present', async () => {
      const jar = createJar();
      const url = 'https://www.swiggy.com/';
      await jar.setCookie('_session_tid=abc123; Domain=.swiggy.com; Path=/; HttpOnly', url);
      await jar.setCookie('tid=def456; Domain=.swiggy.com; Path=/; HttpOnly', url);
      await jar.setCookie('sid=ghi789; Domain=.swiggy.com; Path=/; HttpOnly', url);
      await jar.setCookie('userLocation=blr; Domain=.swiggy.com; Path=/', url);

      const result = await extractAuthCookies(jar);
      expect(result).toEqual({
        _session_tid: 'abc123',
        tid: 'def456',
        sid: 'ghi789',
        userLocation: 'blr',
      });
    });

    it('returns auth cookies without optional userLocation', async () => {
      const jar = createJar();
      const url = 'https://www.swiggy.com/';
      await jar.setCookie('_session_tid=v1; Domain=.swiggy.com; Path=/; HttpOnly', url);
      await jar.setCookie('tid=v2; Domain=.swiggy.com; Path=/; HttpOnly', url);
      await jar.setCookie('sid=v3; Domain=.swiggy.com; Path=/; HttpOnly', url);

      const result = await extractAuthCookies(jar);
      expect(result._session_tid).toBe('v1');
      expect(result.tid).toBe('v2');
      expect(result.sid).toBe('v3');
      expect(result.userLocation).toBeUndefined();
    });

    it('throws when a required auth cookie is missing', async () => {
      const jar = createJar();
      const url = 'https://www.swiggy.com/';
      await jar.setCookie('_session_tid=v1; Domain=.swiggy.com; Path=/; HttpOnly', url);
      await jar.setCookie('tid=v2; Domain=.swiggy.com; Path=/; HttpOnly', url);

      await expect(extractAuthCookies(jar)).rejects.toThrow(/sid/);
    });
  });

  describe('fetchWithJar', () => {
    it('sends Cookie header from jar and absorbs Set-Cookie from response', async () => {
      const jar = createJar();
      await jar.setCookie('seed=value1; Domain=.example.test; Path=/', 'https://www.example.test/');

      let observedCookieHeader: string | null = null;
      const fakeFetch: typeof fetch = (_input, init) => {
        const headers = new Headers(init?.headers);
        observedCookieHeader = headers.get('cookie');
        return Promise.resolve(
          new Response(null, {
            status: 200,
            headers: {
              'set-cookie': 'fresh=hot; Domain=.example.test; Path=/; HttpOnly',
            },
          }),
        );
      };

      const url = 'https://www.example.test/api';
      const res = await fetchWithJar(jar, url, { method: 'GET' }, fakeFetch);
      expect(res.status).toBe(200);
      expect(observedCookieHeader).toBe('seed=value1');

      const stored = await jar.getCookies('https://www.example.test/');
      const names = stored.map((c) => c.key).sort();
      expect(names).toEqual(['fresh', 'seed']);
    });

    it('handles multiple Set-Cookie headers', async () => {
      const jar = createJar();
      const headers = new Headers();
      headers.append('set-cookie', 'a=1; Domain=.example.test; Path=/');
      headers.append('set-cookie', 'b=2; Domain=.example.test; Path=/');
      const fakeFetch: typeof fetch = () =>
        Promise.resolve(new Response(null, { status: 200, headers }));

      await fetchWithJar(jar, 'https://www.example.test/', { method: 'GET' }, fakeFetch);
      const stored = await jar.getCookies('https://www.example.test/');
      expect(stored.map((c) => c.key).sort()).toEqual(['a', 'b']);
    });

    it('does not send a Cookie header when jar is empty for the URL', async () => {
      const jar = createJar();
      let observedCookieHeader: string | null = null;
      const fakeFetch: typeof fetch = (_input, init) => {
        const headers = new Headers(init?.headers);
        observedCookieHeader = headers.get('cookie');
        return Promise.resolve(new Response(null, { status: 200 }));
      };
      await fetchWithJar(jar, 'https://www.example.test/', { method: 'GET' }, fakeFetch);
      expect(observedCookieHeader).toBeNull();
    });
  });
});
