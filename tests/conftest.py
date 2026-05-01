"""Test fixtures for the Swiggy integration."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest
from aioresponses import aioresponses
from custom_components.swiggy.const import CONF_COOKIES, CONF_PHONE_LAST4, DOMAIN
from pytest_homeassistant_custom_component.common import MockConfigEntry

if TYPE_CHECKING:
    from collections.abc import Generator

pytest_plugins = ["pytest_homeassistant_custom_component"]

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(
    enable_custom_integrations: Any,
) -> None:
    return None


def _load(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES_DIR / name).read_text())


@pytest.fixture
def active_order_payload() -> dict[str, Any]:
    return _load("active_order.json")


@pytest.fixture
def no_active_order_payload() -> dict[str, Any]:
    return _load("no_active_order.json")


@pytest.fixture
def auth_failure_payload() -> dict[str, Any]:
    return _load("auth_failure.json")


@pytest.fixture
def cookies_dict() -> dict[str, Any]:
    return {
        "_session_tid": "stid-abc",
        "tid": "tid-12345678abcd",
        "sid": "sid-xyz",
        "userLocation": "loc-1",
        "capturedAt": "2026-05-01T10:00:00+00:00",
        "phoneLast4": "1234",
    }


@pytest.fixture
def mock_aiohttp() -> Generator[aioresponses]:
    with aioresponses() as m:
        yield m


@pytest.fixture
def mock_config_entry(cookies_dict: dict[str, Any]) -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN,
        title="Swiggy (•••• 1234)",
        data={CONF_COOKIES: cookies_dict, CONF_PHONE_LAST4: "1234"},
        unique_id="1234-tid-1234",
        entry_id="test-entry-id",
    )
