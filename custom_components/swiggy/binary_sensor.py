"""Binary sensor platform for Swiggy."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import SwiggyDataUpdateCoordinator
from .models import TERMINAL_STATUSES

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.entity_platform import AddEntitiesCallback


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: SwiggyDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([SwiggyOrderActiveBinarySensor(coordinator, entry.entry_id)])


class SwiggyOrderActiveBinarySensor(
    CoordinatorEntity[SwiggyDataUpdateCoordinator],
    BinarySensorEntity,
):
    _attr_has_entity_name = False
    _attr_device_class = BinarySensorDeviceClass.RUNNING

    def __init__(
        self,
        coordinator: SwiggyDataUpdateCoordinator,
        entry_id: str,
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry_id}_order_active"
        self._attr_name = "Swiggy Order Active"
        self.entity_id = "binary_sensor.swiggy_order_active"

    @property
    def is_on(self) -> bool:
        order = self.coordinator.data.active_order
        if order is None:
            return False
        return order.status not in TERMINAL_STATUSES
