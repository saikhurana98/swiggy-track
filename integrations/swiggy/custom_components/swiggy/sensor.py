"""Sensor platform for Swiggy."""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import UnitOfTime
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import SwiggyDataUpdateCoordinator

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .models import SwiggyOrder


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: SwiggyDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [
            SwiggyCurrentOrderStatusSensor(coordinator, entry.entry_id),
            SwiggyCurrentOrderEtaSensor(coordinator, entry.entry_id),
            SwiggyCurrentOrderRestaurantSensor(coordinator, entry.entry_id),
            SwiggyCurrentOrderTotalSensor(coordinator, entry.entry_id),
            SwiggyDeliveryPartnerNameSensor(coordinator, entry.entry_id),
            SwiggyLastOrderIdSensor(coordinator, entry.entry_id),
        ],
    )


class _SwiggySensorBase(CoordinatorEntity[SwiggyDataUpdateCoordinator], SensorEntity):
    _attr_has_entity_name = False

    def __init__(
        self,
        coordinator: SwiggyDataUpdateCoordinator,
        entry_id: str,
        key: str,
    ) -> None:
        super().__init__(coordinator)
        self._entry_id = entry_id
        self._key = key
        self._attr_unique_id = f"{entry_id}_{key}"
        self._attr_name = f"Swiggy {key.replace('_', ' ').title()}"
        self.entity_id = f"sensor.swiggy_{key}"

    @property
    def _active(self) -> SwiggyOrder | None:
        return self.coordinator.data.active_order

    @property
    def _last_delivered(self) -> SwiggyOrder | None:
        return self.coordinator.data.last_delivered


class SwiggyCurrentOrderStatusSensor(_SwiggySensorBase):
    def __init__(self, coordinator: SwiggyDataUpdateCoordinator, entry_id: str) -> None:
        super().__init__(coordinator, entry_id, "current_order_status")

    @property
    def native_value(self) -> str | None:
        order = self._active
        if order is None:
            return None
        return order.status.value

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        order = self._active
        if order is None:
            return {}
        return {
            "raw_status": order.raw_status,
            "placed_at": order.placed_at.isoformat(),
            "restaurant_id": order.restaurant_id,
        }


class SwiggyCurrentOrderEtaSensor(_SwiggySensorBase):
    _attr_native_unit_of_measurement = UnitOfTime.MINUTES
    _attr_device_class = SensorDeviceClass.DURATION

    def __init__(self, coordinator: SwiggyDataUpdateCoordinator, entry_id: str) -> None:
        super().__init__(coordinator, entry_id, "current_order_eta_minutes")

    @property
    def native_value(self) -> int | None:
        order = self._active
        if order is None or order.estimated_delivery_at is None:
            return None
        eta = order.estimated_delivery_at
        if eta.tzinfo is None:
            eta = eta.replace(tzinfo=UTC)
        delta = eta - datetime.now(tz=UTC)
        minutes = math.ceil(delta.total_seconds() / 60)
        return max(minutes, 0)


class SwiggyCurrentOrderRestaurantSensor(_SwiggySensorBase):
    def __init__(self, coordinator: SwiggyDataUpdateCoordinator, entry_id: str) -> None:
        super().__init__(coordinator, entry_id, "current_order_restaurant")

    @property
    def native_value(self) -> str | None:
        order = self._active
        if order is None:
            return None
        return order.restaurant_name


class SwiggyCurrentOrderTotalSensor(_SwiggySensorBase):
    _attr_native_unit_of_measurement = "INR"
    _attr_device_class = SensorDeviceClass.MONETARY

    def __init__(self, coordinator: SwiggyDataUpdateCoordinator, entry_id: str) -> None:
        super().__init__(coordinator, entry_id, "current_order_total")

    @property
    def native_value(self) -> float | None:
        order = self._active
        if order is None:
            return None
        return round(order.total_paise / 100, 2)


class SwiggyDeliveryPartnerNameSensor(_SwiggySensorBase):
    def __init__(self, coordinator: SwiggyDataUpdateCoordinator, entry_id: str) -> None:
        super().__init__(coordinator, entry_id, "delivery_partner_name")

    @property
    def native_value(self) -> str | None:
        order = self._active
        if order is None or order.delivery_partner is None:
            return None
        return order.delivery_partner.name

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        order = self._active
        if order is None or order.delivery_partner is None:
            return {}
        partner = order.delivery_partner
        return {
            "phone": partner.phone,
            "lat": partner.latitude,
            "lng": partner.longitude,
        }


class SwiggyLastOrderIdSensor(_SwiggySensorBase):
    def __init__(self, coordinator: SwiggyDataUpdateCoordinator, entry_id: str) -> None:
        super().__init__(coordinator, entry_id, "last_order_id")

    @property
    def native_value(self) -> str | None:
        order = self._active or self._last_delivered
        if order is None:
            return None
        return order.order_id

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        order = self._active or self._last_delivered
        if order is None:
            return {}
        return {
            "status": order.status.value,
            "placed_at": order.placed_at.isoformat(),
        }
