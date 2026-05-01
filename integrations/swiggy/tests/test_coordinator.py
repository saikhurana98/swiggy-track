"""Tests for the Swiggy data update coordinator."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from custom_components.swiggy.api import SwiggyApiClient, SwiggyApiError, SwiggyAuthError
from custom_components.swiggy.const import SCAN_INTERVAL_ACTIVE, SCAN_INTERVAL_IDLE
from custom_components.swiggy.coordinator import SwiggyDataUpdateCoordinator
from custom_components.swiggy.models import (
    ActiveOrderResponse,
    OrderStatus,
    SwiggyAuthCookies,
    SwiggyOrder,
)
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import UpdateFailed


def _build_order(status: OrderStatus) -> SwiggyOrder:
    return SwiggyOrder.model_validate(
        {
            "orderId": "1",
            "status": status.value,
            "rawStatus": status.value,
            "restaurantName": "R",
            "restaurantId": None,
            "items": [],
            "totalPaise": 100,
            "placedAt": "2026-05-01T10:00:00+00:00",
            "estimatedDeliveryAt": None,
            "deliveredAt": None,
            "deliveryPartner": None,
        },
    )


def _resp(active: SwiggyOrder | None) -> ActiveOrderResponse:
    return ActiveOrderResponse(
        active_order=active,
        last_delivered=None,
        fetched_at=__import__("datetime").datetime.now(
            tz=__import__("datetime").UTC,
        ),
    )


def _make_client(cookies_dict: dict[str, Any]) -> SwiggyApiClient:
    cookies = SwiggyAuthCookies.model_validate(cookies_dict)
    return SwiggyApiClient(session=AsyncMock(), cookies=cookies)


async def test_active_order_sets_short_interval(hass: Any, cookies_dict: dict[str, Any]) -> None:
    client = _make_client(cookies_dict)
    client.async_get_active_order = AsyncMock(  # type: ignore[method-assign]
        return_value=_resp(_build_order(OrderStatus.ON_THE_WAY)),
    )
    coordinator = SwiggyDataUpdateCoordinator(hass, client)
    await coordinator.async_refresh()
    assert coordinator.last_update_success is True
    assert coordinator.update_interval == SCAN_INTERVAL_ACTIVE


async def test_no_active_order_sets_idle_interval(hass: Any, cookies_dict: dict[str, Any]) -> None:
    client = _make_client(cookies_dict)
    client.async_get_active_order = AsyncMock(return_value=_resp(None))  # type: ignore[method-assign]
    coordinator = SwiggyDataUpdateCoordinator(hass, client)
    await coordinator.async_refresh()
    assert coordinator.update_interval == SCAN_INTERVAL_IDLE


async def test_terminal_status_treated_as_idle(hass: Any, cookies_dict: dict[str, Any]) -> None:
    client = _make_client(cookies_dict)
    client.async_get_active_order = AsyncMock(  # type: ignore[method-assign]
        return_value=_resp(_build_order(OrderStatus.DELIVERED)),
    )
    coordinator = SwiggyDataUpdateCoordinator(hass, client)
    await coordinator.async_refresh()
    assert coordinator.update_interval == SCAN_INTERVAL_IDLE


async def test_auth_error_raises_config_entry_auth_failed(
    hass: Any,
    cookies_dict: dict[str, Any],
) -> None:
    client = _make_client(cookies_dict)
    client.async_get_active_order = AsyncMock(  # type: ignore[method-assign]
        side_effect=SwiggyAuthError("nope"),
    )
    coordinator = SwiggyDataUpdateCoordinator(hass, client)
    with pytest.raises(ConfigEntryAuthFailed):
        await coordinator._async_update_data()


async def test_api_error_raises_update_failed(
    hass: Any,
    cookies_dict: dict[str, Any],
) -> None:
    client = _make_client(cookies_dict)
    client.async_get_active_order = AsyncMock(  # type: ignore[method-assign]
        side_effect=SwiggyApiError("boom"),
    )
    coordinator = SwiggyDataUpdateCoordinator(hass, client)
    with pytest.raises(UpdateFailed):
        await coordinator._async_update_data()
