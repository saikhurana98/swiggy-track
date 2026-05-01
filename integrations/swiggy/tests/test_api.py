"""Tests for the Swiggy API client."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import aiohttp
import pytest
from custom_components.swiggy.api import (
    SwiggyApiClient,
    SwiggyApiError,
    SwiggyAuthError,
    _normalise_status,
)
from custom_components.swiggy.const import SWIGGY_BASE_URL, SWIGGY_ORDERS_PATH
from custom_components.swiggy.models import OrderStatus, SwiggyAuthCookies

if TYPE_CHECKING:
    from aioresponses import aioresponses

ORDERS_URL = f"{SWIGGY_BASE_URL}{SWIGGY_ORDERS_PATH}?limit=10&offset=0&order_id="


@pytest.fixture
def cookies(cookies_dict: dict[str, Any]) -> SwiggyAuthCookies:
    return SwiggyAuthCookies.model_validate(cookies_dict)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Placed", OrderStatus.PLACED),
        ("OrderPlaced", OrderStatus.PLACED),
        ("Confirmed", OrderStatus.CONFIRMED),
        ("Food being prepared", OrderStatus.PREPARING),
        ("Ready", OrderStatus.READY_FOR_PICKUP),
        ("DE_PICKED_UP", OrderStatus.PICKED_UP),
        ("On the way", OrderStatus.ON_THE_WAY),
        ("Out for delivery", OrderStatus.ON_THE_WAY),
        ("Arrived", OrderStatus.ARRIVING),
        ("Delivered", OrderStatus.DELIVERED),
        ("Cancelled", OrderStatus.CANCELLED),
        ("totally-bogus", OrderStatus.UNKNOWN),
        ("", OrderStatus.UNKNOWN),
        (None, OrderStatus.UNKNOWN),
    ],
)
def test_normalise_status(raw: str | None, expected: OrderStatus) -> None:
    assert _normalise_status(raw) is expected


async def test_get_order_history_parses_active_payload(
    cookies: SwiggyAuthCookies,
    active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=200, payload=active_order_payload)
    async with aiohttp.ClientSession() as session:
        client = SwiggyApiClient(session, cookies)
        orders = await client.async_get_order_history(limit=10)
    assert len(orders) == 2
    assert orders[0].order_id == "987654321"
    assert orders[0].status is OrderStatus.ON_THE_WAY
    assert orders[0].restaurant_name == "Burger Palace"
    assert orders[0].total_paise == 49800
    assert orders[0].delivery_partner is not None
    assert orders[0].delivery_partner.name == "Ravi K"
    assert orders[0].delivery_address == "Plot 7, Sector 21"


async def test_get_active_order_picks_first_non_terminal(
    cookies: SwiggyAuthCookies,
    active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=200, payload=active_order_payload)
    async with aiohttp.ClientSession() as session:
        client = SwiggyApiClient(session, cookies)
        resp = await client.async_get_active_order()
    assert resp.active_order is not None
    assert resp.active_order.order_id == "987654321"
    assert resp.last_delivered is not None
    assert resp.last_delivered.order_id == "987654000"


async def test_get_active_order_returns_none_when_only_delivered(
    cookies: SwiggyAuthCookies,
    no_active_order_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=200, payload=no_active_order_payload)
    async with aiohttp.ClientSession() as session:
        client = SwiggyApiClient(session, cookies)
        resp = await client.async_get_active_order()
    assert resp.active_order is None
    assert resp.last_delivered is not None
    assert resp.last_delivered.order_id == "111"


async def test_auth_error_on_401(
    cookies: SwiggyAuthCookies,
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=401)
    async with aiohttp.ClientSession() as session:
        client = SwiggyApiClient(session, cookies)
        with pytest.raises(SwiggyAuthError):
            await client.async_get_active_order()


async def test_auth_error_on_403(
    cookies: SwiggyAuthCookies,
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=403)
    async with aiohttp.ClientSession() as session:
        client = SwiggyApiClient(session, cookies)
        with pytest.raises(SwiggyAuthError):
            await client.async_get_active_order()


async def test_auth_error_on_status_code_field(
    cookies: SwiggyAuthCookies,
    auth_failure_payload: dict[str, Any],
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=200, payload=auth_failure_payload)
    async with aiohttp.ClientSession() as session:
        client = SwiggyApiClient(session, cookies)
        with pytest.raises(SwiggyAuthError):
            await client.async_get_active_order()


async def test_api_error_on_500(
    cookies: SwiggyAuthCookies,
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=500, body="boom")
    async with aiohttp.ClientSession() as session:
        client = SwiggyApiClient(session, cookies)
        with pytest.raises(SwiggyApiError):
            await client.async_get_active_order()


async def test_api_error_on_network_failure(
    cookies: SwiggyAuthCookies,
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, exception=aiohttp.ClientConnectionError("nope"))
    async with aiohttp.ClientSession() as session:
        client = SwiggyApiClient(session, cookies)
        with pytest.raises(SwiggyApiError):
            await client.async_get_active_order()


async def test_cookie_header_includes_required_keys(
    cookies: SwiggyAuthCookies,
    mock_aiohttp: aioresponses,
) -> None:
    mock_aiohttp.get(ORDERS_URL, status=200, payload={"data": {"orders": []}})
    async with aiohttp.ClientSession() as session:
        client = SwiggyApiClient(session, cookies)
        await client.async_get_order_history(limit=10)
    requests = mock_aiohttp.requests
    key = next(iter(requests.keys()))
    call = requests[key][0]
    headers = call.kwargs.get("headers") or {}
    cookie_header = headers["Cookie"]
    assert "_session_tid=stid-abc" in cookie_header
    assert "tid=tid-12345678abcd" in cookie_header
    assert "sid=sid-xyz" in cookie_header
    assert "userLocation=loc-1" in cookie_header
    await asyncio.sleep(0)


async def test_update_cookies_replaces_credentials(
    cookies: SwiggyAuthCookies,
    cookies_dict: dict[str, Any],
) -> None:
    async with aiohttp.ClientSession() as session:
        client = SwiggyApiClient(session, cookies)
        new_dict = {**cookies_dict, "tid": "tid-NEW", "userLocation": None}
        new_cookies = SwiggyAuthCookies.model_validate(new_dict)
        client.update_cookies(new_cookies)
        assert "tid=tid-NEW" in client._cookie_header()
