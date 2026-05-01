"""Swiggy order tracker integration."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pydantic import ValidationError

from .api import SwiggyApiClient
from .const import CONF_COOKIES, DOMAIN, PLATFORMS, SERVICE_REFRESH
from .coordinator import SwiggyDataUpdateCoordinator
from .models import SwiggyAuthCookies

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant, ServiceCall

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    raw_cookies = entry.data.get(CONF_COOKIES)
    if not isinstance(raw_cookies, dict):
        raise ConfigEntryNotReady("missing cookies in entry data")
    try:
        cookies = SwiggyAuthCookies.model_validate(raw_cookies)
    except ValidationError as err:
        raise ConfigEntryNotReady(f"invalid stored cookies: {err}") from err

    session = async_get_clientsession(hass)
    client = SwiggyApiClient(session, cookies)
    coordinator = SwiggyDataUpdateCoordinator(hass, client)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    async def _handle_refresh(_call: ServiceCall) -> None:
        await coordinator.async_request_refresh()

    if not hass.services.has_service(DOMAIN, SERVICE_REFRESH):
        hass.services.async_register(DOMAIN, SERVICE_REFRESH, _handle_refresh)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        domain_data = hass.data.get(DOMAIN, {})
        domain_data.pop(entry.entry_id, None)
        if not domain_data and hass.services.has_service(DOMAIN, SERVICE_REFRESH):
            hass.services.async_remove(DOMAIN, SERVICE_REFRESH)
    return unloaded
