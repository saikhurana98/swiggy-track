# Swiggy API Notes

> Reverse-engineered behaviour as of 2026-05-02. Update when something breaks or you re-verify against live traffic.

## Bot protection

Swiggy fronts its origin with **AWS WAF Bot Control** behind CloudFront. Any HTTP request to the HTML site (`https://www.swiggy.com/`) that doesn't execute the JS challenge gets:

```
HTTP/2 202
server: CloudFront
content-length: 0
x-amzn-waf-action: challenge
```

This is a silent challenge — the body is empty, no error JSON, just 2xx. Naive code that checks `res.ok` (or `2xx`) treats it as success and proceeds with no cookies. The original Hono server-side proxy fell into exactly this trap and returned "OTP sent" to the user even though no SMS was ever dispatched.

`/dapi/*` paths are **not** WAF-challenged once you have a valid `_session_tid` cookie. Server-side `aiohttp` requests with the cookie work fine. So the integration runs server-side; only the cookie-acquisition step needs a real browser.

### Defeating the challenge in our extractor

`apps/cookie-extractor/src/browser.ts`:

- `chromium.launchPersistentContext(profileDir, { channel: 'chrome', ignoreDefaultArgs: ['--enable-automation'] })`
- `args: ['--disable-blink-features=AutomationControlled', '--no-default-browser-check', '--no-first-run']`
- `addInitScript("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")`

Without `channel: 'chrome'`, bundled Chromium gets 403 even with the other flags. With them, real Chrome passes the WAF on its own.

## Login flow

Real browser captures (Playwright network panel):

1. `POST /dapi/auth/signin-with-check`
   - body `{"mobile": "...", "password": "", "_csrf": "<token-from-cookie>"}`
   - response `{"statusCode":2,"statusMessage":"done successfully","data":{"verified":false,"registered":true,"passwordEnabled":true,"active":true},"tid":"<uuid>","sid":"<id>","csrfToken":null}`
2. `POST /dapi/auth/sms-otp`
   - body `{"mobile": "...", "_csrf": "..."}`
   - response `{"statusCode":0,"statusMessage":"done successfully","data":[],...}`
3. User types OTP (real SMS delivery)
4. `POST /dapi/auth/otp-verify` (not captured during testing)
   - on success, server sets HttpOnly cookies on `.swiggy.com`

Required headers on every dapi POST: `__fetch_req__: true`, `platform: dweb`, `user-id: 0`, `content-type: application/json`. Real Chrome adds `sec-ch-ua-*` automatically.

## Auth cookies

After successful OTP verify, the relevant cookies on `.swiggy.com`:

| Name | HttpOnly | Auth-bearing | Notes |
| ---- | -------- | ------------ | ----- |
| `_session_tid` | yes | **yes** | Long opaque token (~2 KB hex). The only cookie the integration sends. |
| `_is_logged_in` | no | no | `1` after auth. Useful as a polling tripwire in the extractor. |
| `userLocation` | no | no | URL-encoded JSON, contains lat/lng/address. Sent to Swiggy in the cookie header to satisfy delivery-zone gating on some endpoints. |
| `_csrf` | yes | no (per-request, refreshed) | Required only for write endpoints (sms-otp / verify). Read-only API works without it. |
| `aws-waf-token` | no | no (challenge token) | Set by WAF JS; not needed for `/dapi/*` server-side. |

`tid` and `sid` show up in the JSON envelope of every dapi response but **never as Set-Cookie**. Earlier versions of the schema treated them as required cookies — that was wrong. They're optional in the schema now (kept for forward-compat in case Swiggy changes its mind).

## Order-list response

`GET /dapi/order/all?order_id=&offset=0&limit=N`

```jsonc
{
  "statusCode": 0,
  "data": {
    "total_orders": 999,
    "customer_care_number": "...",
    "orders": [
      {
        "order_id": 236618626369648,
        "order_status": "Delivered",          // free-form string, normalised in api.py
        "order_status_message": null,         // sometimes set, sometimes null
        "order_time": "2026-05-01 20:53:46",  // local naive timestamp, no tz
        "sla_time": "59",                     // sometimes minutes-as-string, sometimes ISO; defensive parse
        "delivered_time_in_seconds": null,
        "order_total": 321.0,                 // rupees, not paise
        "order_items": [{ "name": "...", "quantity": 1, "total": 210.0 }],
        "restaurant_name": "Planet Diet",
        "restaurant_id": "198373",
        "delivery_address": { "address": "...", "address_line1": "..." },
        "delivery_boy": { "name": "Pardeep", "mobile": null, "trackingLat": null, "trackingLng": null }
      }
    ]
  },
  "tid": "<uuid>",
  "sid": "<id>",
  "deviceId": "<uuid>",
  "csrfToken": null
}
```

Active order = first element where `order_status` not in {`Delivered`, `Cancelled`, `Completed`, ...}. The terminal set lives in `custom_components/swiggy/models.py::TERMINAL_STATUSES`.

### Status normalisation

`api.py::_RAW_STATUS_MAP` covers the variants seen so far: `Placed`, `Confirmed`, `Preparing`, `Ready`, `PickedUp`, `OnTheWay`, `Arriving`, `Delivered`, `Cancelled`, plus underscored / lowercased / DE_-prefixed variants. Unknown values normalise to `OrderStatus.UNKNOWN`. When you see `unknown` showing up as a sensor state, find the raw value (visible in `binary_sensor.swiggy_current_order_status` attributes as `raw_status`) and add it to the map.

### Field-name resilience

Swiggy is inconsistent: same object sometimes uses `restaurant_name`, sometimes `restaurantName`, sometimes nests it under `restaurant.name`. `api.py::_restaurant_fields`, `_parse_partner`, `_parse_items`, `_delivery_address` each try multiple keys. When you find a new variant, extend those helpers; don't change the schema.

### `sla_time` quirk

Sometimes a value like `"59"` (minutes), sometimes a real ISO datetime, sometimes `null`. `_to_iso` validates by attempting `datetime.fromisoformat()` first and returns `None` on parse failure, so a non-ISO `sla_time` no longer crashes the parser.

## Verify-me list (re-test after Swiggy changes)

These were guesses or fragile inferences. If something breaks, check these first:

- WAF `/dapi/*` exemption may be tightened. If server-side requests start returning 202 / 403, the integration would need to ferry the WAF cookie too, which would in turn require Playwright in HA. Impractical — at that point the integration becomes browser-only and unfit for HACS.
- `_session_tid` rotation cadence is unknown. Re-run the cookie-extractor when probe / HA returns 401. Persistent profile means no SMS unless Swiggy invalidated the session entirely.
- `order_status` enum values may grow / change wording over time.
- `order_total` is rupees today. If Swiggy switches to paise, `_coerce_paise` will overshoot by 100×. Detection: any total over ~10 lakh.
- The auto-click selector for "Sign In" in the extractor is brittle (`xpath=//*[normalize-space(text())='Sign In']`). Falls back to manual click; safe to leave as-is.
- The "click Sign In via xpath" timeout suggests the modal animation moves the element. Lower priority — manual click works.

## Files not to commit, ever

- `~/.cache/swiggy-cookie-extractor/profile/` — Chrome profile dir, contains the live session. `.gitignore` doesn't cover this because it's outside the repo, but never copy it into the workspace.
- Any `cookies.json` written by the extractor. Output directly to `/tmp` and `shred -u` afterwards.
- Any pcap / HAR / network log of authenticated requests.
