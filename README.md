# Swiggy Order Tracker for Home Assistant

[![CI](https://github.com/saikhurana98/swiggy-track/actions/workflows/ci.yml/badge.svg)](https://github.com/saikhurana98/swiggy-track/actions/workflows/ci.yml)
[![Release](https://github.com/saikhurana98/swiggy-track/actions/workflows/release.yml/badge.svg)](https://github.com/saikhurana98/swiggy-track/actions/workflows/release.yml)
[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Track your live Swiggy order from Home Assistant. Status, ETA, restaurant, delivery partner, and more — surfaced as sensors you can plug into automations and dashboards.

> **Unofficial.** Swiggy publishes no public API. This integration uses reverse-engineered endpoints captured from the Swiggy web app and may break without notice.

---

## What's in this monorepo

| Path                          | What                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `custom_components/swiggy/`   | Home Assistant custom integration (Python). Installed via HACS.                            |
| `tests/`, `scripts/probe.py`  | Pytest suite + standalone probe CLI for the integration.                                   |
| `apps/cookie-extractor/`      | Local TS + HTML mini-app to do OTP login and extract Swiggy session cookies for HA config. |
| `packages/shared-types/`      | Source-of-truth zod schemas for cookies + order payloads.                                  |

---

## Install

### 1. Add via HACS

1. HACS → Integrations → ⋮ → Custom repositories
2. Add `https://github.com/saikhurana98/swiggy-track`, category **Integration**
3. Install **Swiggy Order Tracker**, restart Home Assistant.

### 2. Get your Swiggy cookies

Swiggy fronts every request with an AWS WAF JS challenge, so headless / server-side
fetches are blocked at the edge. The cookie-extractor instead launches a real Chromium
window for you to log in normally:

```bash
git clone https://github.com/saikhurana98/swiggy-track
cd swiggy-track
pnpm install
pnpm --filter @swiggy-track/cookie-extractor exec playwright install chromium
pnpm --filter @swiggy-track/cookie-extractor login
```

A browser opens at swiggy.com — enter your phone, complete the OTP. The CLI prints the
session cookie JSON to stdout and copies it to your clipboard.

### 3. Configure HA

Settings → Devices & services → Add Integration → **Swiggy** → paste cookie JSON.

---

## Sensors exposed

- `sensor.swiggy_current_order_status`
- `sensor.swiggy_current_order_eta_minutes`
- `sensor.swiggy_current_order_restaurant`
- `sensor.swiggy_current_order_total`
- `sensor.swiggy_delivery_partner_name`
- `sensor.swiggy_last_order_id`
- `binary_sensor.swiggy_order_active`

---

## Development

```bash
pnpm install                       # JS workspaces
uv sync --all-extras --dev         # Python integration
pnpm test                          # all TS tests
uv run pytest                      # Python tests
bash scripts/preflight.sh          # full gates (run before tagging)
```

Conventional Commits enforced via commitlint + husky. See `commitlint.config.js` for allowed scopes.

---

## Security notice

Swiggy session cookies grant full account access including the ability to place orders against your saved payment methods. The cookie-extractor binds to `127.0.0.1` only and never persists cookies to disk. Do not commit cookie values, do not log them, do not paste them into shared chats.

## Documentation

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — monorepo layout, data flow, components, CI/CD, security model.
- [docs/SWIGGY_API_NOTES.md](./docs/SWIGGY_API_NOTES.md) — reverse-engineered Swiggy behaviour: WAF, login flow, auth cookies, order schema, things-to-re-verify.
- [CHANGELOG.md](./CHANGELOG.md) — per-version notes.

## License

MIT — see [LICENSE](./LICENSE).
