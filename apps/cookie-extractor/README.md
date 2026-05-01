# @swiggy-track/cookie-extractor

CLI that opens a real Chromium window so you can log in to Swiggy with phone + OTP and
captures the resulting HttpOnly session cookies. Output is a JSON object matching
`SwiggyAuthCookiesSchema` from `@swiggy-track/shared-types`, ready to paste into the
Home Assistant integration or `scripts/probe.py`.

## Why a real browser?

Swiggy's CloudFront edge enforces an AWS WAF JS challenge (`x-amzn-waf-action: challenge`).
Server-side `fetch` / `curl` get HTTP 202 with an empty body and no `aws-waf-token`
cookie, so the dapi auth endpoints are unreachable. A real Chromium executes the JS
challenge automatically; we just piggy-back on the cookies it ends up with.

## Install

```bash
pnpm install
pnpm --filter @swiggy-track/cookie-extractor exec playwright install chromium
```

## Usage

```bash
pnpm --filter @swiggy-track/cookie-extractor login
```

Options:

- `--output <file>` — also write the JSON to `<file>` with mode `0600`.
- `--timeout <seconds>` — how long to wait for login (default 600).
- `--help`, `--version`.

The browser closes automatically after success / timeout / Ctrl-C. The JSON is also
copied to your clipboard if `clipboardy` can talk to your platform clipboard.

## Output shape

```json
{
  "_session_tid": "...",
  "tid": "...",
  "sid": "...",
  "userLocation": "{\"lat\":...}",
  "capturedAt": "2026-05-01T12:00:00.000+00:00",
  "phoneLast4": "1234"
}
```

`phoneLast4` is sniffed from the `POST /dapi/auth/sms-otp` request body. If you log in
through a session that's already authenticated, the CLI will prompt for the last 4
digits via stdin.

## Security

These cookies grant full account access including the ability to place orders. Treat
them as secrets: don't commit, don't log full values, and rotate by signing out from
swiggy.com when you're done testing.
