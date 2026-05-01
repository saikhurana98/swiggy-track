"""Config flow for Swiggy."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pydantic import ValidationError

from .api import SwiggyApiClient, SwiggyApiError, SwiggyAuthError
from .const import CONF_COOKIES, CONF_PHONE_LAST4, DOMAIN
from .models import SwiggyAuthCookies

if TYPE_CHECKING:
    from collections.abc import Mapping

_LOGGER = logging.getLogger(__name__)

STEP_USER_SCHEMA = vol.Schema({vol.Required("cookies_json"): str})


def _parse_cookies(raw: str) -> SwiggyAuthCookies:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as err:
        raise ValueError("invalid_json") from err
    if not isinstance(data, dict):
        raise TypeError("invalid_json")
    return SwiggyAuthCookies.model_validate(data)


def _build_unique_id(cookies: SwiggyAuthCookies) -> str:
    discriminator = (cookies.tid or cookies.session_tid)[:8]
    return f"{cookies.phone_last4}-{discriminator}"


class SwiggyConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._pending_reauth_entry_id: str | None = None

    async def _validate(
        self,
        raw: str,
    ) -> tuple[SwiggyAuthCookies | None, dict[str, str]]:
        errors: dict[str, str] = {}
        try:
            cookies = _parse_cookies(raw)
        except ValidationError:
            errors["base"] = "invalid_cookies"
            return None, errors
        except (ValueError, TypeError):
            errors["base"] = "invalid_json"
            return None, errors

        session = async_get_clientsession(self.hass)
        client = SwiggyApiClient(session, cookies)
        try:
            await client.async_get_active_order()
        except SwiggyAuthError:
            errors["base"] = "invalid_auth"
            return None, errors
        except SwiggyApiError:
            errors["base"] = "cannot_connect"
            return None, errors
        return cookies, errors

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            cookies, errors = await self._validate(user_input["cookies_json"])
            if cookies is not None:
                await self.async_set_unique_id(_build_unique_id(cookies))
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=f"Swiggy (•••• {cookies.phone_last4})",
                    data={
                        CONF_COOKIES: cookies.model_dump(by_alias=True, mode="json"),
                        CONF_PHONE_LAST4: cookies.phone_last4,
                    },
                )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_SCHEMA,
            errors=errors,
        )

    async def async_step_reauth(
        self,
        entry_data: Mapping[str, Any],  # noqa: ARG002
    ) -> ConfigFlowResult:
        self._pending_reauth_entry_id = self.context["entry_id"]
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            cookies, errors = await self._validate(user_input["cookies_json"])
            if cookies is not None:
                entry_id = self._pending_reauth_entry_id
                if entry_id is None:
                    return self.async_abort(reason="reauth_failed")
                entry = self.hass.config_entries.async_get_entry(entry_id)
                if entry is None:
                    return self.async_abort(reason="reauth_failed")
                self.hass.config_entries.async_update_entry(
                    entry,
                    data={
                        CONF_COOKIES: cookies.model_dump(by_alias=True, mode="json"),
                        CONF_PHONE_LAST4: cookies.phone_last4,
                    },
                )
                await self.hass.config_entries.async_reload(entry.entry_id)
                return self.async_abort(reason="reauth_successful")

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=STEP_USER_SCHEMA,
            errors=errors,
        )
