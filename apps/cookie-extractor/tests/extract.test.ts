import { describe, expect, it } from 'vitest';
import { extractAuthCookies, hasRequiredAuthCookies } from '../src/browser.js';
import type { BrowserCookie } from '../src/types.js';

const baseCookies: BrowserCookie[] = [
  { name: '_session_tid', value: 'session-abcdef', domain: '.swiggy.com', path: '/' },
  { name: 'tid', value: 'tid-value', domain: '.swiggy.com', path: '/' },
  { name: 'sid', value: 'sid-value', domain: '.swiggy.com', path: '/' },
  { name: '_is_logged_in', value: '1', domain: '.swiggy.com', path: '/' },
  {
    name: 'userLocation',
    value: encodeURIComponent('{"lat":12.9716,"lng":77.5946}'),
    domain: '.swiggy.com',
    path: '/',
  },
  { name: 'unrelated', value: 'noise', domain: '.example.com', path: '/' },
];

describe('hasRequiredAuthCookies', () => {
  it('returns true when _session_tid and _is_logged_in=1 both present', () => {
    expect(hasRequiredAuthCookies(baseCookies)).toBe(true);
  });

  it('returns false when _session_tid missing', () => {
    const filtered = baseCookies.filter((c) => c.name !== '_session_tid');
    expect(hasRequiredAuthCookies(filtered)).toBe(false);
  });

  it('returns false when _is_logged_in missing', () => {
    const filtered = baseCookies.filter((c) => c.name !== '_is_logged_in');
    expect(hasRequiredAuthCookies(filtered)).toBe(false);
  });

  it('returns false when _is_logged_in is not 1', () => {
    const replaced = baseCookies.map((c) =>
      c.name === '_is_logged_in' ? { ...c, value: '0' } : c,
    );
    expect(hasRequiredAuthCookies(replaced)).toBe(false);
  });

  it('only counts cookies on swiggy.com domain', () => {
    const wrong = baseCookies.map((c) =>
      c.name === '_session_tid' ? { ...c, domain: '.other.com' } : c,
    );
    expect(hasRequiredAuthCookies(wrong)).toBe(false);
  });
});

describe('extractAuthCookies', () => {
  it('builds a SwiggyAuthCookies object from the browser cookie array', () => {
    const result = extractAuthCookies(baseCookies, { phoneLast4: '4321' });
    expect(result._session_tid).toBe('session-abcdef');
    expect(result.tid).toBe('tid-value');
    expect(result.sid).toBe('sid-value');
    expect(result.phoneLast4).toBe('4321');
    expect(result.userLocation).toBe('{"lat":12.9716,"lng":77.5946}');
    expect(typeof result.capturedAt).toBe('string');
    expect(new Date(result.capturedAt).toString()).not.toBe('Invalid Date');
  });

  it('throws when one of the auth cookies is missing', () => {
    const missing = baseCookies.filter((c) => c.name !== 'tid');
    expect(() => extractAuthCookies(missing, { phoneLast4: '0000' })).toThrow(/tid/);
  });

  it('omits userLocation when cookie not set', () => {
    const noLoc = baseCookies.filter((c) => c.name !== 'userLocation');
    const result = extractAuthCookies(noLoc, { phoneLast4: '0000' });
    expect(result.userLocation).toBeUndefined();
  });

  it('passes raw userLocation through when not URL-encoded', () => {
    const raw: BrowserCookie[] = baseCookies.map((c) =>
      c.name === 'userLocation' ? { ...c, value: 'plain-text-value' } : c,
    );
    const result = extractAuthCookies(raw, { phoneLast4: '1111' });
    expect(result.userLocation).toBe('plain-text-value');
  });

  it('throws on invalid phoneLast4', () => {
    expect(() => extractAuthCookies(baseCookies, { phoneLast4: 'abcd' })).toThrow();
  });
});
