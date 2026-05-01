# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `docs/ARCHITECTURE.md` — high-level design + monorepo + data flow + components
- `docs/SWIGGY_API_NOTES.md` — reverse-engineering notes (WAF, login flow, cookies, order schema, verify-me list)

## [0.2.1] — 2026-05-02

### Fixed

- Auth uses `_session_tid` only. `tid` and `sid` are per-request transactional IDs in the dapi response envelope, not Set-Cookie values. Both are now optional in `SwiggyAuthCookiesSchema` and `SwiggyAuthCookies` (pydantic).
- HA `api.py` skips `tid`/`sid` cookie parts when absent; URL-encodes `userLocation`; sends a Chrome-shaped `User-Agent` and a `Referer`.
- HA `_to_iso` validates ISO before returning, so non-datetime strings like `sla_time="59"` no longer crash `_parse_order`.
- Extractor `--phone-last4` flag skips the interactive prompt when the phone wasn't captured on the wire (persistent profile = no fresh OTP request to sniff).

### Verified

- End-to-end live: extractor → cookies.json → probe.py → real Swiggy order list parsed correctly.

## [0.2.0] — 2026-05-02

### Changed

- **BREAKING.** Replaced the Hono server-side OTP proxy with a Playwright-driven Chromium launcher. Server-side fetches to `https://www.swiggy.com/` are blocked by AWS WAF JS challenge (`x-amzn-waf-action: challenge`, `HTTP 202` + empty body). The original flow silently 'succeeded' without sending any SMS. Real Chrome solves the challenge automatically.
- Cookie-extractor now uses `chromium.launchPersistentContext()` against a real Chrome channel with stealth flags (`ignoreDefaultArgs: ['--enable-automation']`, `--disable-blink-features=AutomationControlled`, `navigator.webdriver` override). Persistent profile means subsequent runs reuse the session — no SMS unless Swiggy invalidates `_session_tid`.

## [0.1.1] — 2026-05-02

### Changed

- Hoisted Python integration to repo root (`custom_components/swiggy/`, `tests/`, `pyproject.toml`, `uv.lock`) for HACS source-tree compliance. Removed the `integrations/` directory.

## [0.1.0] — 2026-05-02

### Added

- Initial public release.
- HA custom integration `swiggy` exposing 6 sensors + 1 binary sensor.
- TS cookie-extractor mini-app (then Hono-based; replaced in 0.2.0).
- `packages/shared-types` zod schemas for cookies + order.
- CI: TypeScript + Python + Hassfest + HACS validate + commitlint.
- Tag-driven release workflow that zips `custom_components/swiggy/` into `swiggy.zip` and attaches to the GitHub Release for HACS consumption.
- Husky + commitlint conventional commits, lint-staged, dependabot for npm + pip + github-actions.
