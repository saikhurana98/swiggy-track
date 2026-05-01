"""Tests for sensor and binary sensor entities."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from custom_components.swiggy.const import DOMAIN

if TYPE_CHECKING:
    from aioresponses import aioresponses
    from pytest_homeassistant_custom_component.common import MockConfigEntry

ORDERS_URL = "https://www.swiggy.com/dapi/order/all?limit=10&offset=0&order_id="


def _set_eta_minutes(payload: dict[str, Any], minutes: int) -> dict[str, Any]:
    eta = (datetime.now(tz=UTC) + timedelta(minutes=minutes)).isoformat()
    payload["data"]["orders"][0]["sla_time"] = eta
    return payload


async def _setup(
    hass: Any,
    mock_config_entry: MockConfigEntry,
    payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=200, payload=payload, repeat=True)
    mock_config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_config_entry.entry_id)
    await hass.async_block_till_done()


async def test_sensors_with_active_order(
    hass: Any,
    mock_config_entry: MockConfigEntry,
    active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    _set_eta_minutes(active_order_payload, 30)
    await _setup(hass, mock_config_entry, active_order_payload, mock_aiohttp)

    state = hass.states.get("sensor.swiggy_current_order_status")
    assert state is not None
    assert state.state == "on_the_way"
    assert state.attributes["raw_status"] == "On the way"
    assert state.attributes["restaurant_id"] == "rest-42"

    eta_state = hass.states.get("sensor.swiggy_current_order_eta_minutes")
    assert eta_state is not None
    assert int(eta_state.state) > 0
    assert int(eta_state.state) <= 30

    rest = hass.states.get("sensor.swiggy_current_order_restaurant")
    assert rest is not None
    assert rest.state == "Burger Palace"

    total = hass.states.get("sensor.swiggy_current_order_total")
    assert total is not None
    assert float(total.state) == 498.0

    partner = hass.states.get("sensor.swiggy_delivery_partner_name")
    assert partner is not None
    assert partner.state == "Ravi K"
    assert partner.attributes["phone"] == "9999999999"
    assert partner.attributes["lat"] == 28.6139

    last = hass.states.get("sensor.swiggy_last_order_id")
    assert last is not None
    assert last.state == "987654321"

    active = hass.states.get("binary_sensor.swiggy_order_active")
    assert active is not None
    assert active.state == "on"


async def test_sensors_without_active_order(
    hass: Any,
    mock_config_entry: MockConfigEntry,
    no_active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    await _setup(hass, mock_config_entry, no_active_order_payload, mock_aiohttp)

    state = hass.states.get("sensor.swiggy_current_order_status")
    assert state is not None
    assert state.state in ("unknown", "unavailable")

    eta_state = hass.states.get("sensor.swiggy_current_order_eta_minutes")
    assert eta_state is not None
    assert eta_state.state in ("unknown", "unavailable")

    last = hass.states.get("sensor.swiggy_last_order_id")
    assert last is not None
    assert last.state == "111"

    active = hass.states.get("binary_sensor.swiggy_order_active")
    assert active is not None
    assert active.state == "off"


async def test_eta_clamps_to_zero_for_past_eta(
    hass: Any,
    mock_config_entry: MockConfigEntry,
    active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    _set_eta_minutes(active_order_payload, -15)
    await _setup(hass, mock_config_entry, active_order_payload, mock_aiohttp)
    eta_state = hass.states.get("sensor.swiggy_current_order_eta_minutes")
    assert eta_state is not None
    assert int(eta_state.state) == 0


async def test_unique_ids(
    hass: Any,
    mock_config_entry: MockConfigEntry,
    no_active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    await _setup(hass, mock_config_entry, no_active_order_payload, mock_aiohttp)
    registry = hass.data["entity_registry"]
    entries = [e for e in registry.entities.values() if e.platform == DOMAIN]
    assert len(entries) == 7
    unique_ids = {e.unique_id for e in entries}
    assert f"{mock_config_entry.entry_id}_current_order_status" in unique_ids
    assert f"{mock_config_entry.entry_id}_order_active" in unique_ids
