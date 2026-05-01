import { writeFileSync } from 'node:fs';
import type { SwiggyAuthCookies } from '@swiggy-track/shared-types';

export function redact(value: string): string {
  if (value.length <= 6) return '…';
  return `${value.slice(0, 6)}…`;
}

export interface RedactedCookies {
  _session_tid: string;
  tid: string;
  sid: string;
  userLocation?: string;
  capturedAt: string;
  phoneLast4: string;
}

export function redactCookies(cookies: SwiggyAuthCookies): RedactedCookies {
  const out: RedactedCookies = {
    _session_tid: redact(cookies._session_tid),
    tid: redact(cookies.tid),
    sid: redact(cookies.sid),
    capturedAt: cookies.capturedAt,
    phoneLast4: cookies.phoneLast4,
  };
  if (cookies.userLocation !== undefined) {
    out.userLocation = redact(cookies.userLocation);
  }
  return out;
}

export interface WriteOptions {
  file?: string | undefined;
}

export function writeJsonOutput(cookies: SwiggyAuthCookies, options: WriteOptions): void {
  if (options.file === undefined) return;
  const json = JSON.stringify(cookies, null, 2);
  writeFileSync(options.file, json, { mode: 0o600 });
}
