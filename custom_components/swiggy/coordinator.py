"""Data update coordinator for Swiggy."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import SwiggyApiClient, SwiggyApiError, SwiggyAuthError
from .const import DOMAIN, SCAN_INTERVAL_ACTIVE, SCAN_INTERVAL_IDLE
from .models import TERMINAL_STATUSES, ActiveOrderResponse

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


class SwiggyDataUpdateCoordinator(DataUpdateCoordinator[ActiveOrderResponse]):
    def __init__(self, hass: HomeAssistant, client: SwiggyApiClient) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=SCAN_INTERVAL_IDLE,
        )
        self.client = client

    async def _async_update_data(self) -> ActiveOrderResponse:
        try:
            data = await self.client.async_get_active_order()
        except SwiggyAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except SwiggyApiError as err:
            raise UpdateFailed(str(err)) from err

        if data.active_order is not None and data.active_order.status not in TERMINAL_STATUSES:
            self.update_interval = SCAN_INTERVAL_ACTIVE
        else:
            self.update_interval = SCAN_INTERVAL_IDLE
        return data
