import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redact, redactCookies, writeJsonOutput } from '../src/output.js';
import type { SwiggyAuthCookies } from '@swiggy-track/shared-types';

const sampleCookies: SwiggyAuthCookies = {
  _session_tid: 'abcdef1234567890',
  tid: 'tid-value-12345678',
  sid: 'sid-value-12345678',
  userLocation: '{"lat":12.9}',
  capturedAt: '2026-05-01T12:00:00.000+00:00',
  phoneLast4: '1234',
};

describe('redact', () => {
  it('truncates long values to first 6 chars + ellipsis', () => {
    expect(redact('abcdef1234567890')).toBe('abcdef…');
  });

  it('keeps short values redacted to ellipsis only', () => {
    expect(redact('abc')).toBe('…');
  });

  it('returns ellipsis for empty string', () => {
    expect(redact('')).toBe('…');
  });
});

describe('redactCookies', () => {
  it('redacts every secret field but keeps capturedAt and phoneLast4', () => {
    const r = redactCookies(sampleCookies);
    expect(r._session_tid).toBe('abcdef…');
    expect(r.tid).toBe('tid-va…');
    expect(r.sid).toBe('sid-va…');
    expect(r.userLocation).toBe('{"lat"…');
    expect(r.capturedAt).toBe(sampleCookies.capturedAt);
    expect(r.phoneLast4).toBe('1234');
  });

  it('omits userLocation when not present', () => {
    const { userLocation: _u, ...rest } = sampleCookies;
    void _u;
    const r = redactCookies(rest);
    expect(r.userLocation).toBeUndefined();
  });
});

describe('writeJsonOutput', () => {
  it('writes parsed JSON to a file with mode 0600', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cookie-out-'));
    try {
      const file = join(dir, 'cookies.json');
      writeJsonOutput(sampleCookies, { file });
      const stat = statSync(file);
      expect(stat.mode & 0o777).toBe(0o600);
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
      expect(parsed).toEqual(sampleCookies);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not throw when file is undefined', () => {
    expect(() => {
      writeJsonOutput(sampleCookies, {});
    }).not.toThrow();
  });
});
