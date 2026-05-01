# Swiggy Order Tracker for Home Assistant

[![CI](https://github.com/Sai-Khurana/swiggy-track/actions/workflows/ci.yml/badge.svg)](https://github.com/Sai-Khurana/swiggy-track/actions/workflows/ci.yml)
[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)

Track your live Swiggy order from Home Assistant. Status, ETA, restaurant, delivery partner, and more — surfaced as sensors you can plug into automations and dashboards.

> **Unofficial.** Swiggy publishes no public API. This integration uses reverse-engineered endpoints captured from the Swiggy web app and may break without notice.

---

## What's in this monorepo

| Path                          | What                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `integrations/swiggy/`        | Home Assistant custom integration (Python). Installed via HACS.                            |
| `apps/cookie-extractor/`      | Local TS + HTML mini-app to do OTP login and extract Swiggy session cookies for HA config. |
| `packages/shared-types/`      | Source-of-truth zod schemas for cookies + order payloads.                                  |

---

## Install

### 1. Add via HACS

1. HACS → Integrations → ⋮ → Custom repositories
2. Add `https://github.com/Sai-Khurana/swiggy-track`, category **Integration**
3. Install **Swiggy Order Tracker**, restart Home Assistant.

### 2. Get your Swiggy cookies

```bash
git clone https://github.com/Sai-Khurana/swiggy-track
cd swiggy-track
pnpm install
pnpm --filter cookie-extractor dev
# open http://127.0.0.1:8765
```

Enter your phone, OTP, copy the cookie JSON.

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
cd integrations/swiggy && uv sync  # Python integration
pnpm test                          # all TS tests
cd integrations/swiggy && uv run pytest
```

Conventional Commits enforced via commitlint + husky. See `commitlint.config.js` for allowed scopes.

---

## Security notice

Swiggy session cookies grant full account access including the ability to place orders against your saved payment methods. The cookie-extractor binds to `127.0.0.1` only and never persists cookies to disk. Do not commit cookie values, do not log them, do not paste them into shared chats.

## License

MIT — see [LICENSE](./LICENSE).
