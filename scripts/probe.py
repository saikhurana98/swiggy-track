#!/usr/bin/env python3
"""Probe SwiggyApiClient with extracted cookies. No HA required.

Usage:
  uv run scripts/probe.py path/to/cookies.json
  uv run scripts/probe.py -                # read JSON from stdin
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Final

import aiohttp
from custom_components.swiggy.api import SwiggyApiClient, SwiggyApiError, SwiggyAuthError
from custom_components.swiggy.models import SwiggyAuthCookies

EXPECTED_ARGS: Final = 2


def _load_cookies(arg: str) -> SwiggyAuthCookies:
    raw = sys.stdin.read() if arg == "-" else Path(arg).read_text(encoding="utf-8")
    data = json.loads(raw)
    return SwiggyAuthCookies.model_validate(data)


def _redact(c: SwiggyAuthCookies) -> dict[str, str]:
    return {
        "_session_tid": c.session_tid[:6] + "…",
        "tid": c.tid[:6] + "…",
        "sid": c.sid[:6] + "…",
        "phone": "•••• " + c.phone_last4,
    }


async def _run(arg: str) -> int:
    cookies = _load_cookies(arg)
    print(json.dumps(_redact(cookies), indent=2), file=sys.stderr)

    async with aiohttp.ClientSession() as session:
        client = SwiggyApiClient(session, cookies)
        try:
            response = await client.async_get_active_order()
        except SwiggyAuthError as err:
            print(f"AUTH FAILED: {err}", file=sys.stderr)
            return 1
        except SwiggyApiError as err:
            print(f"API ERROR: {err}", file=sys.stderr)
            return 1

    out = response.model_dump(mode="json", by_alias=True)
    print(json.dumps(out, indent=2, default=str))
    return 0


def main() -> int:
    if len(sys.argv) != EXPECTED_ARGS:
        print(__doc__, file=sys.stderr)
        return 2
    return asyncio.run(_run(sys.argv[1]))


if __name__ == "__main__":
    raise SystemExit(main())
