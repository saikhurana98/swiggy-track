"""Constants for the Swiggy integration."""

from __future__ import annotations

from datetime import timedelta
from typing import Final

from homeassistant.const import Platform

DOMAIN: Final = "swiggy"

PLATFORMS: Final[list[Platform]] = [Platform.BINARY_SENSOR, Platform.SENSOR]

CONF_COOKIES: Final = "cookies"
CONF_PHONE_LAST4: Final = "phone_last4"

SCAN_INTERVAL_ACTIVE: Final = timedelta(seconds=30)
SCAN_INTERVAL_IDLE: Final = timedelta(seconds=600)

SWIGGY_BASE_URL: Final = "https://www.swiggy.com"
SWIGGY_ORDERS_PATH: Final = "/dapi/order/all"

SERVICE_REFRESH: Final = "refresh"
