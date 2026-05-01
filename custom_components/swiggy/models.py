"""Pydantic models mirroring shared-types TS schemas."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003  (pydantic resolves annotations at runtime)
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class OrderStatus(StrEnum):
    PLACED = "placed"
    CONFIRMED = "confirmed"
    PREPARING = "preparing"
    READY_FOR_PICKUP = "ready_for_pickup"
    PICKED_UP = "picked_up"
    ON_THE_WAY = "on_the_way"
    ARRIVING = "arriving"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"


TERMINAL_STATUSES: frozenset[OrderStatus] = frozenset(
    {OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.UNKNOWN},
)


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


PhoneLast4 = Annotated[str, StringConstraints(pattern=r"^\d{4}$")]


class SwiggyAuthCookies(_StrictModel):
    session_tid: str = Field(..., alias="_session_tid", min_length=1)
    tid: str | None = Field(default=None, min_length=1)
    sid: str | None = Field(default=None, min_length=1)
    user_location: str | None = Field(default=None, alias="userLocation")
    captured_at: datetime = Field(..., alias="capturedAt")
    phone_last4: PhoneLast4 = Field(..., alias="phoneLast4")


class SwiggyOrderItem(_StrictModel):
    name: str
    quantity: int = Field(..., ge=0)
    price_paise: int = Field(..., alias="pricePaise", ge=0)


class DeliveryPartner(_StrictModel):
    name: str
    phone: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class SwiggyOrder(_StrictModel):
    order_id: str = Field(..., alias="orderId", min_length=1)
    status: OrderStatus
    raw_status: str = Field(..., alias="rawStatus")
    restaurant_name: str = Field(..., alias="restaurantName")
    restaurant_id: str | None = Field(default=None, alias="restaurantId")
    items: list[SwiggyOrderItem]
    total_paise: int = Field(..., alias="totalPaise", ge=0)
    placed_at: datetime = Field(..., alias="placedAt")
    estimated_delivery_at: datetime | None = Field(..., alias="estimatedDeliveryAt")
    delivered_at: datetime | None = Field(..., alias="deliveredAt")
    delivery_partner: DeliveryPartner | None = Field(..., alias="deliveryPartner")
    delivery_address: str | None = Field(default=None, alias="deliveryAddress")


class ActiveOrderResponse(_StrictModel):
    active_order: SwiggyOrder | None = Field(..., alias="activeOrder")
    last_delivered: SwiggyOrder | None = Field(..., alias="lastDelivered")
    fetched_at: datetime = Field(..., alias="fetchedAt")
