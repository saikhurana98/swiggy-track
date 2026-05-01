"""Swiggy API client."""

from __future__ import annotations

from datetime import UTC, datetime
from http import HTTPStatus
from typing import Any, Final
from urllib.parse import quote

import aiohttp

from .const import SWIGGY_BASE_URL, SWIGGY_ORDERS_PATH
from .models import (
    TERMINAL_STATUSES,
    ActiveOrderResponse,
    DeliveryPartner,
    OrderStatus,
    SwiggyAuthCookies,
    SwiggyOrder,
    SwiggyOrderItem,
)


class SwiggyApiError(Exception):
    """Generic Swiggy API failure."""


class SwiggyAuthError(SwiggyApiError):
    """Authentication failed (cookies invalid/expired)."""


_RAW_STATUS_MAP: Final[dict[str, OrderStatus]] = {
    "placed": OrderStatus.PLACED,
    "orderplaced": OrderStatus.PLACED,
    "order_placed": OrderStatus.PLACED,
    "confirmed": OrderStatus.CONFIRMED,
    "order_confirmed": OrderStatus.CONFIRMED,
    "orderconfirmed": OrderStatus.CONFIRMED,
    "accepted": OrderStatus.CONFIRMED,
    "preparing": OrderStatus.PREPARING,
    "food_being_prepared": OrderStatus.PREPARING,
    "being_prepared": OrderStatus.PREPARING,
    "ready_for_pickup": OrderStatus.READY_FOR_PICKUP,
    "ready": OrderStatus.READY_FOR_PICKUP,
    "food_ready": OrderStatus.READY_FOR_PICKUP,
    "picked_up": OrderStatus.PICKED_UP,
    "pickedup": OrderStatus.PICKED_UP,
    "de_picked_up": OrderStatus.PICKED_UP,
    "de_assigned": OrderStatus.PICKED_UP,
    "on_the_way": OrderStatus.ON_THE_WAY,
    "ontheway": OrderStatus.ON_THE_WAY,
    "out_for_delivery": OrderStatus.ON_THE_WAY,
    "arriving": OrderStatus.ARRIVING,
    "arrived": OrderStatus.ARRIVING,
    "nearby": OrderStatus.ARRIVING,
    "delivered": OrderStatus.DELIVERED,
    "order_delivered": OrderStatus.DELIVERED,
    "completed": OrderStatus.DELIVERED,
    "cancelled": OrderStatus.CANCELLED,
    "canceled": OrderStatus.CANCELLED,
    "order_cancelled": OrderStatus.CANCELLED,
}


def _normalise_status(raw: str | None) -> OrderStatus:
    if not raw:
        return OrderStatus.UNKNOWN
    key = raw.strip().lower().replace(" ", "_").replace("-", "_")
    return _RAW_STATUS_MAP.get(key, OrderStatus.UNKNOWN)


def _to_iso(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=UTC).isoformat()
    if isinstance(value, str):
        try:
            datetime.fromisoformat(value.replace(" ", "T") if " " in value else value)
        except ValueError:
            return None
        return value.replace(" ", "T") if " " in value else value
    return None


def _parse_partner(raw: dict[str, Any] | None) -> DeliveryPartner | None:
    if not raw:
        return None
    name = raw.get("name") or raw.get("delivery_boy_name")
    if not name:
        return None
    phone = raw.get("mobile") or raw.get("phone")
    lat = raw.get("trackingLat") or raw.get("lat")
    lng = raw.get("trackingLng") or raw.get("lng") or raw.get("lon")
    return DeliveryPartner(
        name=str(name),
        phone=str(phone) if phone else None,
        latitude=float(lat) if lat is not None and lat != "" else None,
        longitude=float(lng) if lng is not None and lng != "" else None,
    )


def _parse_items(raw_items: list[dict[str, Any]] | None) -> list[SwiggyOrderItem]:
    if not raw_items:
        return []
    out: list[SwiggyOrderItem] = []
    for it in raw_items:
        name = it.get("name") or it.get("item_name") or "Item"
        qty = int(it.get("quantity") or it.get("qty") or 0)
        price_rupees = it.get("total") or it.get("price") or it.get("base_price") or 0
        try:
            price_paise = round(float(price_rupees) * 100)
        except (TypeError, ValueError):
            price_paise = 0
        out.append(SwiggyOrderItem(name=str(name), quantity=qty, price_paise=price_paise))
    return out


def _coerce_paise(rupees: Any) -> int:
    try:
        return round(float(rupees) * 100)
    except (TypeError, ValueError):
        return 0


def _restaurant_fields(raw: dict[str, Any]) -> tuple[str, str | None]:
    name: str | None = raw.get("restaurant_name") or raw.get("restaurantName")
    rid: Any = raw.get("restaurant_id") or raw.get("restaurantId")
    nested = raw.get("restaurant")
    if isinstance(nested, dict):
        if not name:
            nested_name = nested.get("name")
            if isinstance(nested_name, str):
                name = nested_name
        if not rid:
            rid = nested.get("id")
    return name or "Unknown", str(rid) if rid else None


def _delivery_address(raw: dict[str, Any]) -> str | None:
    direct = raw.get("delivery_address_text") or raw.get("deliveryAddress")
    if isinstance(direct, str) and direct:
        return direct
    nested = raw.get("delivery_address")
    if isinstance(nested, dict):
        line1 = nested.get("address_line1") or nested.get("addressLine1")
        if isinstance(line1, str) and line1:
            return line1
    return None


def _parse_order(raw: dict[str, Any]) -> SwiggyOrder:
    raw_status = raw.get("order_status") or raw.get("status") or raw.get("orderStatus") or ""
    status = _normalise_status(str(raw_status))

    placed_iso = _to_iso(raw.get("order_time") or raw.get("placedAt") or raw.get("placed_at"))
    if placed_iso is None:
        placed_iso = datetime.now(tz=UTC).isoformat()

    eta_iso = _to_iso(
        raw.get("sla_time") or raw.get("estimatedDeliveryAt") or raw.get("eta_at"),
    )
    delivered_iso = _to_iso(
        raw.get("delivered_time_in_seconds") or raw.get("deliveredAt") or raw.get("delivered_at"),
    )

    if "totalPaise" in raw:
        total_paise = int(raw["totalPaise"])
    else:
        total_paise = _coerce_paise(
            raw.get("order_total") or raw.get("net_total") or 0,
        )

    restaurant_name, restaurant_id = _restaurant_fields(raw)

    return SwiggyOrder(
        order_id=str(raw.get("order_id") or raw.get("orderId") or ""),
        status=status,
        raw_status=str(raw_status),
        restaurant_name=restaurant_name,
        restaurant_id=restaurant_id,
        items=_parse_items(raw.get("order_items") or raw.get("items")),
        total_paise=total_paise,
        placed_at=datetime.fromisoformat(placed_iso),
        estimated_delivery_at=datetime.fromisoformat(eta_iso) if eta_iso else None,
        delivered_at=datetime.fromisoformat(delivered_iso) if delivered_iso else None,
        delivery_partner=_parse_partner(raw.get("delivery_boy") or raw.get("deliveryPartner")),
        delivery_address=_delivery_address(raw),
    )


class SwiggyApiClient:
    def __init__(self, session: aiohttp.ClientSession, cookies: SwiggyAuthCookies) -> None:
        self._session = session
        self._cookies = cookies

    def update_cookies(self, cookies: SwiggyAuthCookies) -> None:
        self._cookies = cookies

    def _cookie_header(self) -> str:
        parts = [f"_session_tid={self._cookies.session_tid}"]
        if self._cookies.tid:
            parts.append(f"tid={self._cookies.tid}")
        if self._cookies.sid:
            parts.append(f"sid={self._cookies.sid}")
        if self._cookies.user_location:
            parts.append(f"userLocation={quote(self._cookies.user_location, safe='')}")
        return "; ".join(parts)

    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
            ),
            "Referer": "https://www.swiggy.com/my-account/orders",
            "Cookie": self._cookie_header(),
        }

    async def _request_orders(self, limit: int) -> dict[str, Any]:
        url = f"{SWIGGY_BASE_URL}{SWIGGY_ORDERS_PATH}"
        params = {"order_id": "", "offset": "0", "limit": str(limit)}
        try:
            async with self._session.get(
                url,
                params=params,
                headers=self._headers(),
            ) as resp:
                if resp.status in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN):
                    raise SwiggyAuthError(f"auth failed: HTTP {resp.status}")
                if resp.status >= HTTPStatus.BAD_REQUEST:
                    text = await resp.text()
                    raise SwiggyApiError(f"HTTP {resp.status}: {text[:200]}")
                payload: dict[str, Any] = await resp.json(content_type=None)
        except aiohttp.ClientError as err:
            raise SwiggyApiError(f"network error: {err}") from err

        status_code = payload.get("statusCode")
        if status_code in (1, 401, 403):
            raise SwiggyAuthError(f"swiggy statusCode {status_code}")
        return payload

    async def async_get_order_history(self, limit: int = 10) -> list[SwiggyOrder]:
        payload = await self._request_orders(limit)
        data = payload.get("data") or {}
        raw_orders = data.get("orders") or []
        return [_parse_order(o) for o in raw_orders if isinstance(o, dict)]

    async def async_get_active_order(self) -> ActiveOrderResponse:
        orders = await self.async_get_order_history(limit=10)
        active: SwiggyOrder | None = None
        last_delivered: SwiggyOrder | None = None
        for o in orders:
            if active is None and o.status not in TERMINAL_STATUSES:
                active = o
            if last_delivered is None and o.status == OrderStatus.DELIVERED:
                last_delivered = o
            if active and last_delivered:
                break
        return ActiveOrderResponse(
            active_order=active,
            last_delivered=last_delivered,
            fetched_at=datetime.now(tz=UTC),
        )
