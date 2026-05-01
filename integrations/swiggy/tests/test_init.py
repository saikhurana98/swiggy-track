"""Tests for setup/unload of the Swiggy integration."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from custom_components.swiggy.const import (
    CONF_COOKIES,
    CONF_PHONE_LAST4,
    DOMAIN,
    SERVICE_REFRESH,
)
from homeassistant.config_entries import ConfigEntryState
from pytest_homeassistant_custom_component.common import MockConfigEntry

if TYPE_CHECKING:
    from aioresponses import aioresponses

ORDERS_URL = "https://www.swiggy.com/dapi/order/all?limit=10&offset=0&order_id="


async def test_setup_and_unload(
    hass: Any,
    mock_config_entry: MockConfigEntry,
    no_active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=200, payload=no_active_order_payload, repeat=True)
    mock_config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_config_entry.entry_id)
    await hass.async_block_till_done()

    assert mock_config_entry.state is ConfigEntryState.LOADED
    assert mock_config_entry.entry_id in hass.data[DOMAIN]
    assert hass.services.has_service(DOMAIN, SERVICE_REFRESH)

    assert await hass.config_entries.async_unload(mock_config_entry.entry_id)
    await hass.async_block_till_done()
    assert mock_config_entry.state is ConfigEntryState.NOT_LOADED
    assert mock_config_entry.entry_id not in hass.data.get(DOMAIN, {})
    assert not hass.services.has_service(DOMAIN, SERVICE_REFRESH)


async def test_setup_with_invalid_stored_cookies(
    hass: Any,
    no_active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    bad = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_COOKIES: {"phoneLast4": "12"}, CONF_PHONE_LAST4: "12"},
        unique_id="bad",
    )
    bad.add_to_hass(hass)
    mock_aiohttp.get(ORDERS_URL, status=200, payload=no_active_order_payload, repeat=True)
    assert not await hass.config_entries.async_setup(bad.entry_id)
    await hass.async_block_till_done()
    assert bad.state in (
        ConfigEntryState.SETUP_ERROR,
        ConfigEntryState.SETUP_RETRY,
    )


async def test_setup_with_missing_cookies_dict(hass: Any) -> None:
    bad = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_PHONE_LAST4: "1234"},
        unique_id="bad2",
    )
    bad.add_to_hass(hass)
    assert not await hass.config_entries.async_setup(bad.entry_id)
    await hass.async_block_till_done()


async def test_refresh_service_triggers_update(
    hass: Any,
    mock_config_entry: MockConfigEntry,
    no_active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=200, payload=no_active_order_payload, repeat=True)
    mock_config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_config_entry.entry_id)
    await hass.async_block_till_done()

    await hass.services.async_call(DOMAIN, SERVICE_REFRESH, blocking=True)
    await hass.async_block_till_done()
    coordinator = hass.data[DOMAIN][mock_config_entry.entry_id]
    assert coordinator.data is not None
