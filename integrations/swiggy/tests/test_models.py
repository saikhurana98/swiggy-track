"""Tests for pydantic models mirroring shared-types."""

from __future__ import annotations

from datetime import datetime

import pytest
from custom_components.swiggy.models import (
    TERMINAL_STATUSES,
    ActiveOrderResponse,
    DeliveryPartner,
    OrderStatus,
    SwiggyAuthCookies,
    SwiggyOrder,
    SwiggyOrderItem,
)
from pydantic import ValidationError


def test_order_status_enum_values():
    assert OrderStatus.PLACED.value == "placed"
    assert OrderStatus.DELIVERED.value == "delivered"
    assert OrderStatus.UNKNOWN.value == "unknown"


def test_terminal_statuses_constant():
    assert OrderStatus.DELIVERED in TERMINAL_STATUSES
    assert OrderStatus.CANCELLED in TERMINAL_STATUSES
    assert OrderStatus.UNKNOWN in TERMINAL_STATUSES
    assert OrderStatus.ON_THE_WAY not in TERMINAL_STATUSES


def test_cookies_camel_case_aliases():
    payload = {
        "_session_tid": "stid",
        "tid": "tid",
        "sid": "sid",
        "userLocation": "loc",
        "capturedAt": "2026-05-01T10:00:00+00:00",
        "phoneLast4": "1234",
    }
    cookies = SwiggyAuthCookies.model_validate(payload)
    assert cookies.session_tid == "stid"
    assert cookies.user_location == "loc"
    assert cookies.phone_last4 == "1234"
    assert isinstance(cookies.captured_at, datetime)


def test_cookies_phone_last4_must_be_4_digits():
    payload = {
        "_session_tid": "stid",
        "tid": "tid",
        "sid": "sid",
        "capturedAt": "2026-05-01T10:00:00+00:00",
        "phoneLast4": "12",
    }
    with pytest.raises(ValidationError):
        SwiggyAuthCookies.model_validate(payload)


def test_cookies_extra_forbidden():
    payload = {
        "_session_tid": "stid",
        "tid": "tid",
        "sid": "sid",
        "capturedAt": "2026-05-01T10:00:00+00:00",
        "phoneLast4": "1234",
        "rogue": "x",
    }
    with pytest.raises(ValidationError):
        SwiggyAuthCookies.model_validate(payload)


def test_cookies_round_trip_by_alias():
    payload = {
        "_session_tid": "stid",
        "tid": "tid",
        "sid": "sid",
        "capturedAt": "2026-05-01T10:00:00+00:00",
        "phoneLast4": "1234",
    }
    cookies = SwiggyAuthCookies.model_validate(payload)
    dumped = cookies.model_dump(by_alias=True, mode="json")
    assert "_session_tid" in dumped
    assert "phoneLast4" in dumped
    assert "capturedAt" in dumped


def test_swiggy_order_uses_camel_case_aliases():
    raw = {
        "orderId": "abc",
        "status": "placed",
        "rawStatus": "Placed",
        "restaurantName": "R",
        "restaurantId": "r1",
        "items": [{"name": "x", "quantity": 1, "pricePaise": 100}],
        "totalPaise": 500,
        "placedAt": "2026-05-01T10:00:00+00:00",
        "estimatedDeliveryAt": None,
        "deliveredAt": None,
        "deliveryPartner": None,
    }
    order = SwiggyOrder.model_validate(raw)
    assert order.order_id == "abc"
    assert order.status is OrderStatus.PLACED
    assert order.total_paise == 500
    assert isinstance(order.items[0], SwiggyOrderItem)


def test_delivery_partner_lat_bounds():
    with pytest.raises(ValidationError):
        DeliveryPartner.model_validate({"name": "n", "latitude": 999})


def test_active_order_response_round_trip():
    raw = {
        "activeOrder": None,
        "lastDelivered": None,
        "fetchedAt": "2026-05-01T10:00:00+00:00",
    }
    parsed = ActiveOrderResponse.model_validate(raw)
    assert parsed.active_order is None
    assert parsed.last_delivered is None
