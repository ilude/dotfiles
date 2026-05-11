"""Provider protocol for normalized X read clients."""
from __future__ import annotations

from typing import Generic, Protocol, TypeVar

from pydantic import BaseModel, Field

from .models import XUser

T = TypeVar("T")


class XResearchError(Exception):
    """Base exception for x_research."""


class ProviderAuthError(XResearchError):
    """Provider authentication failed."""


class ProviderQuotaError(XResearchError):
    """Provider quota was exhausted."""


class ProviderRateLimitError(XResearchError):
    """Provider rate limit persisted after retries."""


class ProviderCapabilityError(XResearchError):
    """Provider does not support the requested capability."""


class ProviderTemporaryError(XResearchError):
    """Provider returned a temporary failure."""


class Page(BaseModel, Generic[T]):
    """A normalized page of provider results."""

    items: list[T]
    next_cursor: str | None = None
    is_terminal: bool = True
    complete: bool = True
    source: str
    warnings: list[str] = Field(default_factory=list)


class XClient(Protocol):
    """Async provider interface for X read operations."""

    async def user_by_handle(self, handle: str) -> XUser: ...

    async def following(
        self, handle: str, *, cursor: str | None = None, limit: int | None = None
    ) -> Page[XUser]: ...

    async def followers(
        self, handle: str, *, cursor: str | None = None, limit: int | None = None
    ) -> Page[XUser]: ...
