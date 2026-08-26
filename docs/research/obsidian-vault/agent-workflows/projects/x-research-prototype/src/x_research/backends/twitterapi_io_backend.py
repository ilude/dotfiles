"""twitterapi.io provider backend."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from x_research.config import TwitterApiIoConfig
from x_research.models import XUser
from x_research.protocol import (
    Page,
    ProviderAuthError,
    ProviderQuotaError,
    ProviderRateLimitError,
    ProviderTemporaryError,
)

SOURCE = "twitterapi-io"
MAX_RETRIES = 1
RETRY_DELAY_SECONDS = 0.01


class TwitterApiIoBackend:
    """Async read-only client for twitterapi.io follow-list endpoints."""

    def __init__(self, config: TwitterApiIoConfig, client: httpx.AsyncClient | None = None) -> None:
        self.config = config
        self.client = client or httpx.AsyncClient(base_url=config.base_url.rstrip("/"))
        self._owns_client = client is None

    async def __aenter__(self) -> TwitterApiIoBackend:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        if self._owns_client:
            await self.client.aclose()

    async def user_by_handle(self, handle: str) -> XUser:
        data = await self._get("/twitter/user/info", {"userName": handle.lstrip("@")})
        return _map_user(_first_payload(data))

    async def following(
        self, handle: str, *, cursor: str | None = None, limit: int | None = None
    ) -> Page[XUser]:
        return await self._follow_page("followings", handle, cursor=cursor, limit=limit)

    async def followers(
        self, handle: str, *, cursor: str | None = None, limit: int | None = None
    ) -> Page[XUser]:
        return await self._follow_page("followers", handle, cursor=cursor, limit=limit)

    async def _follow_page(
        self, endpoint: str, handle: str, *, cursor: str | None, limit: int | None
    ) -> Page[XUser]:
        params: dict[str, str | int] = {"userName": handle.lstrip("@")}
        if cursor:
            params["cursor"] = cursor
        if limit is not None:
            params["pageSize"] = limit
        data = await self._get(f"/twitter/user/{endpoint}", params)
        users = (
            data.get("users")
            or data.get("followings")
            or data.get("followers")
            or data.get("data")
            or data.get("items")
            or []
        )
        next_cursor = data.get("next_cursor") or data.get("nextCursor")
        return Page[XUser](
            items=[_map_user(item) for item in users],
            next_cursor=next_cursor,
            is_terminal=not bool(next_cursor),
            complete=not bool(next_cursor),
            source=SOURCE,
            warnings=list(data.get("warnings") or []),
        )

    async def _get(self, path: str, params: dict[str, str | int]) -> dict[str, Any]:
        headers = {"X-API-Key": self.config.api_key}
        last_status = 0
        for attempt in range(MAX_RETRIES + 1):
            response = await self.client.get(path, params=params, headers=headers)
            last_status = response.status_code
            if response.status_code in {429, 500, 502, 503, 504} and attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY_SECONDS)
                continue
            if response.status_code in {401, 403}:
                raise ProviderAuthError("twitterapi.io authentication failed: <redacted>")
            if response.status_code == 402:
                raise ProviderQuotaError("twitterapi.io quota exhausted")
            if response.status_code == 429:
                raise ProviderRateLimitError("twitterapi.io rate limit exceeded")
            if response.status_code >= 500:
                raise ProviderTemporaryError(f"twitterapi.io temporary failure: {last_status}")
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ProviderTemporaryError("twitterapi.io returned invalid payload")
            return payload
        raise ProviderTemporaryError(f"twitterapi.io request failed: {last_status}")


def _first_payload(data: dict[str, Any]) -> dict[str, Any]:
    payload = data.get("data") or data.get("user") or data
    if isinstance(payload, list):
        return dict(payload[0]) if payload else {}
    return dict(payload)


def _map_user(data: dict[str, Any]) -> XUser:
    user_id = data.get("id") or data.get("rest_id") or data.get("userId") or data.get("id_str")
    handle = (
        data.get("userName")
        or data.get("username")
        or data.get("screen_name")
        or data.get("handle")
    )
    if user_id is None or handle is None:
        raise ProviderTemporaryError("twitterapi.io user payload missing id or handle")
    return XUser(
        id=str(user_id),
        handle=str(handle),
        name=data.get("name"),
        bio=data.get("description") or data.get("bio"),
        url=data.get("url"),
        followers_count=data.get("followers") or data.get("followers_count"),
        following_count=data.get("following") or data.get("friends_count"),
    )
