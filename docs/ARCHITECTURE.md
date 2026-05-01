# Architecture

> Snapshot as of v0.2.1 (2026-05-02). Update when components change.

## Monorepo layout

```
swiggy-track/
├── custom_components/swiggy/   # HA integration (Python). Loaded by HA.
├── tests/                      # pytest suite for the integration
├── scripts/
│   ├── probe.py                # CLI that hits Swiggy via the integration's API client (no HA needed)
│   └── preflight.sh            # Tag-time gate: TS + Python lint/typecheck/test/format
├── pyproject.toml              # Python project (uv-managed). Python 3.13.2+
├── apps/cookie-extractor/      # TS/Playwright CLI: opens real Chrome, captures cookies
├── packages/shared-types/      # zod source of truth for cookies + order schema
├── package.json + pnpm-workspace.yaml   # pnpm workspaces root
├── hacs.json                   # HACS metadata (zip_release: true)
└── .github/workflows/{ci,release}.yml
```

`custom_components/swiggy/` lives at repo root (not under `integrations/`) because HACS source-tree validation requires that exact path. The release workflow zips this directory into `swiggy.zip` on every `v*` tag and attaches it to the GitHub Release; HACS pulls the zip from the release asset.

## Data flow

```
┌──────────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ apps/cookie-extractor│───▶│ cookies.json     │───▶│ HA config flow   │
│ (Playwright + Chrome)│    │ (SwiggyAuthCookies) │ │ (paste, validate)│
└──────────────────────┘    └──────────────────┘    └────────┬─────────┘
                                                             │
                                                             ▼
                                              ┌──────────────────────────┐
                                              │ SwiggyDataUpdateCoordinator│
                                              │ (30s active / 600s idle) │
                                              └────────┬─────────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────────┐
                                              │ SwiggyApiClient      │
                                              │ GET /dapi/order/all  │
                                              │ Cookie: _session_tid │
                                              └────────┬─────────────┘
                                                       │
                                                       ▼
                                  ┌────────────────────────────────────────┐
                                  │ sensors + binary_sensor (HA entities)  │
                                  └────────────────────────────────────────┘
```

## Schema source of truth

`packages/shared-types/src/{cookies,order}.ts` defines zod schemas. The Python pydantic v2 mirrors live in `custom_components/swiggy/models.py`. Field name convention: snake_case in Python, camelCase / underscored on the wire (e.g. `phone_last4` ↔ `phoneLast4`, `session_tid` ↔ `_session_tid`). When the schema changes, both files must change; the Python tests cover the model round-trip.

## Auth model

The only auth-bearing cookie is `_session_tid` (HttpOnly, set by Swiggy on successful OTP verify). It's an opaque ~2 KB token. The cookie schema also accepts optional `tid`, `sid`, and `userLocation` for forward-compat: earlier reverse-engineering attempts thought `tid`/`sid` were auth cookies, but they're per-request transactional IDs in the dapi response JSON envelope, not Set-Cookie values. The probe verified that `_session_tid` alone authenticates the order-list endpoint.

## Request paths

- `GET https://www.swiggy.com/` — WAF-protected (CloudFront `x-amzn-waf-action: challenge`). Server-side fetch returns 202 + empty body. Only real browsers (with JS) get through. We do **not** hit this server-side.
- `GET https://www.swiggy.com/dapi/order/all?order_id=&offset=0&limit=N` — **not** WAF-protected when called with valid `_session_tid` cookie. Returns the full order history. Active-order detection: walk the list, first entry whose `order_status` is not in {`Delivered`, `Cancelled`, `Completed`, ...} is the active one.
- `POST https://www.swiggy.com/dapi/auth/sms-otp` — server-side fetch fails (WAF), so the integration never calls it. Login happens entirely in the user's browser via the cookie-extractor.

## Components

### `apps/cookie-extractor` (TypeScript, Playwright)

Real Chrome (`channel: 'chrome'`) is launched via `chromium.launchPersistentContext()` against `~/.cache/swiggy-cookie-extractor/profile/`. Persistent profile means after the first OTP login, subsequent runs reuse the session — no SMS is sent again until Swiggy invalidates `_session_tid`. Stealth measures (override `navigator.webdriver`, drop `--enable-automation`, add `--disable-blink-features=AutomationControlled`) defeat AWS WAF's automation fingerprint.

CLI entry: `pnpm --filter @swiggy-track/cookie-extractor login [--phone-last4 1234] [--output FILE] [--timeout SECS]`. Polls `context.cookies()` every 2 s for `_session_tid` + `_is_logged_in=1`. On capture, validates against `SwiggyAuthCookiesSchema`, writes JSON to stdout/clipboard/optional file. Browser closes on success/failure/SIGINT.

### `custom_components/swiggy` (Python, Home Assistant)

- `api.py` — `SwiggyApiClient`. Sends `Cookie: _session_tid=…; userLocation=…` (URL-encoded). Maps Swiggy's free-form `order_status` strings to a stable `OrderStatus` enum via `_RAW_STATUS_MAP`. Raises `SwiggyAuthError` on 401 / 403, `SwiggyApiError` otherwise.
- `coordinator.py` — `DataUpdateCoordinator[ActiveOrderResponse]`. Re-tunes its `update_interval` after each refresh: 30 s when an active order exists, 600 s otherwise. `SwiggyAuthError` is re-raised as `ConfigEntryAuthFailed` to trigger HA's reauth flow.
- `config_flow.py` — One-step paste-JSON flow + reauth_confirm. Validates via pydantic, probes the API once, then creates the entry. `unique_id = f"{phone_last4}-{tid_or_session_tid[:8]}"` — same login updates rather than duplicates.
- `sensor.py` / `binary_sensor.py` — six sensors (status, ETA minutes, restaurant, total, delivery partner name, last order id) and one binary sensor (`order_active`).

### `scripts/probe.py`

Same `SwiggyApiClient` as the HA integration, but standalone. Use for spot-checking cookies after extraction: `uv run scripts/probe.py /path/to/cookies.json`. Stderr gets a redacted summary; stdout gets the parsed `ActiveOrderResponse` JSON. Useful when the integration isn't responding the way you expect — narrows the question to "is this an HA issue or an API issue?".

## CI/CD

- `ci.yml` — TS (lint/typecheck/test/format), Python (ruff/mypy/pytest), Hassfest, HACS validate, commitlint (PR-only). Runs on push to main and on PRs.
- `release.yml` — Triggered by `v*` tag. Stamps version into `manifest.json`, zips `custom_components/swiggy/`, attaches as `swiggy.zip` to a GitHub Release. HACS picks up the asset automatically.
- Branch protection is *not* enforced. Add it via repo settings if multiple contributors join.

## Security model

- The cookie-extractor binds nothing to the network — Playwright launches a headed browser that you interact with. No HTTP server lives anywhere in the toolchain (the original Hono mini-app is gone, see [SWIGGY_API_NOTES.md](./SWIGGY_API_NOTES.md)).
- `_session_tid` is treated as an account-bearing secret. Don't log it (only redacted prefixes go to stderr). Don't commit it. Don't paste it into shared chats. The probe script writes captured JSON with mode 0600.
- HA stores the cookie in its config entry, encrypted with the HA secret store on disk.
