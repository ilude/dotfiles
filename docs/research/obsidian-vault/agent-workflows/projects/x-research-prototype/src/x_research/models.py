"""Normalized X research data models."""
from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator


class FollowDirection(StrEnum):
    """Follow edge direction."""

    FOLLOWING = "following"
    FOLLOWERS = "followers"


class XUser(BaseModel):
    """Normalized X user profile."""

    model_config = ConfigDict(extra="forbid")

    id: str
    handle: str
    name: str | None = None
    bio: str | None = None
    url: str | None = None
    followers_count: int | None = None
    following_count: int | None = None
    raw_json: dict[str, Any] | None = None

    @field_validator("handle")
    @classmethod
    def normalize_handle(cls, value: str) -> str:
        """Normalize user handles for stable local lookups."""
        handle = value.strip().lstrip("@").lower()
        if not handle:
            raise ValueError("handle must not be empty")
        return handle


class Tweet(BaseModel):
    """Normalized tweet model for deferred browser/provider parsing."""

    id: str
    author_id: str | None = None
    text: str
    created_at: str | None = None
    raw_json: dict[str, Any] | None = None


class FollowSnapshotResult(BaseModel):
    """Result returned after persisting a follow snapshot."""

    snapshot_id: str
    item_count: int
    started_count: int
    ended_count: int
    complete: bool
