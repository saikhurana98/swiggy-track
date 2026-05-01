"""Tests for the Swiggy config flow."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from custom_components.swiggy.const import CONF_COOKIES, CONF_PHONE_LAST4, DOMAIN
from homeassistant.config_entries import SOURCE_REAUTH, SOURCE_USER
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

if TYPE_CHECKING:
    from aioresponses import aioresponses

ORDERS_URL = "https://www.swiggy.com/dapi/order/all?limit=10&offset=0&order_id="


async def test_user_flow_success(
    hass: Any,
    cookies_dict: dict[str, Any],
    no_active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=200, payload=no_active_order_payload)
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "user"

    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {"cookies_json": json.dumps(cookies_dict)},
    )
    assert result2["type"] == FlowResultType.CREATE_ENTRY
    assert result2["title"] == "Swiggy (•••• 1234)"
    assert result2["data"][CONF_PHONE_LAST4] == "1234"
    assert result2["data"][CONF_COOKIES]["_session_tid"] == "stid-abc"


async def test_user_flow_invalid_json(hass: Any) -> None:
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {"cookies_json": "{not json"},
    )
    assert result2["type"] == FlowResultType.FORM
    assert result2["errors"] == {"base": "invalid_json"}


async def test_user_flow_invalid_cookies_schema(
    hass: Any,
    cookies_dict: dict[str, Any],
) -> None:
    bad = {**cookies_dict, "phoneLast4": "12"}
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {"cookies_json": json.dumps(bad)},
    )
    assert result2["type"] == FlowResultType.FORM
    assert result2["errors"] == {"base": "invalid_cookies"}


async def test_user_flow_auth_error(
    hass: Any,
    cookies_dict: dict[str, Any],
    auth_failure_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=200, payload=auth_failure_payload)
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {"cookies_json": json.dumps(cookies_dict)},
    )
    assert result2["type"] == FlowResultType.FORM
    assert result2["errors"] == {"base": "invalid_auth"}


async def test_user_flow_cannot_connect(
    hass: Any,
    cookies_dict: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=500, body="boom")
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {"cookies_json": json.dumps(cookies_dict)},
    )
    assert result2["type"] == FlowResultType.FORM
    assert result2["errors"] == {"base": "cannot_connect"}


async def test_user_flow_aborts_on_duplicate(
    hass: Any,
    cookies_dict: dict[str, Any],
    no_active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    existing = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_COOKIES: cookies_dict, CONF_PHONE_LAST4: "1234"},
        unique_id="1234-tid-1234",
    )
    existing.add_to_hass(hass)
    mock_aiohttp.get(ORDERS_URL, status=200, payload=no_active_order_payload)
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {"cookies_json": json.dumps(cookies_dict)},
    )
    assert result2["type"] == FlowResultType.ABORT
    assert result2["reason"] == "already_configured"


async def test_user_flow_invalid_json_when_payload_not_object(hass: Any) -> None:
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {"cookies_json": "[]"},
    )
    assert result2["errors"] == {"base": "invalid_json"}


async def test_reauth_flow_updates_entry(
    hass: Any,
    cookies_dict: dict[str, Any],
    no_active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_COOKIES: cookies_dict, CONF_PHONE_LAST4: "1234"},
        unique_id="1234-tid-1234",
    )
    entry.add_to_hass(hass)

    mock_aiohttp.get(ORDERS_URL, status=200, payload=no_active_order_payload, repeat=True)

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_REAUTH, "entry_id": entry.entry_id},
        data=entry.data,
    )
    assert result["type"] == FlowResultType.FORM
    assert result["step_id"] == "reauth_confirm"

    new_cookies = {**cookies_dict, "tid": "tid-NEWWWWWWW"}
    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {"cookies_json": json.dumps(new_cookies)},
    )
    assert result2["type"] == FlowResultType.ABORT
    assert result2["reason"] == "reauth_successful"
    updated = hass.config_entries.async_get_entry(entry.entry_id)
    assert updated is not None
    assert updated.data[CONF_COOKIES]["tid"] == "tid-NEWWWWWWW"
