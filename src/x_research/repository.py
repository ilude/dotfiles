"""Repository operations for local X research storage."""

from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime

from .models import FollowDirection, FollowSnapshotResult, XUser


def now_iso() -> str:
    """Return an ISO UTC timestamp."""
    return datetime.now(UTC).isoformat()


class XRepository:
    """SQLite-backed repository for profiles and follow graph snapshots."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    def upsert_profile(self, user: XUser) -> None:
        ts = now_iso()
        raw_json = json.dumps(user.raw_json, sort_keys=True) if user.raw_json is not None else None
        self.conn.execute(
            """
            INSERT INTO profiles(id, handle, name, bio, url, followers_count,
              following_count, raw_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              handle=excluded.handle, name=excluded.name, bio=excluded.bio,
              url=excluded.url, followers_count=excluded.followers_count,
              following_count=excluded.following_count, raw_json=excluded.raw_json,
              updated_at=excluded.updated_at
            """,
            (
                user.id,
                user.handle,
                user.name,
                user.bio,
                user.url,
                user.followers_count,
                user.following_count,
                raw_json,
                ts,
            ),
        )

    def record_follow_snapshot(
        self,
        observer: XUser,
        subjects: Iterable[XUser],
        *,
        direction: FollowDirection,
        provider: str,
        complete: bool,
        page_count: int = 1,
        next_cursor: str | None = None,
    ) -> FollowSnapshotResult:
        ts = now_iso()
        snapshot_id = uuid.uuid4().hex
        subject_list = list(subjects)
        self.upsert_profile(observer)
        for subject in subject_list:
            self.upsert_profile(subject)
        self.conn.execute(
            """
            INSERT INTO follow_snapshots(id, observer_id, direction, provider, complete,
              item_count, page_count, next_cursor, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot_id,
                observer.id,
                direction.value,
                provider,
                int(complete),
                len(subject_list),
                page_count,
                next_cursor,
                ts,
            ),
        )
        started_count = self._upsert_edges(observer.id, subject_list, direction, snapshot_id, ts)
        ended_count = 0
        if complete:
            ended_count = self._end_missing_edges(
                observer.id, subject_list, direction, snapshot_id, ts
            )
        self.conn.commit()
        return FollowSnapshotResult(
            snapshot_id=snapshot_id,
            item_count=len(subject_list),
            started_count=started_count,
            ended_count=ended_count,
            complete=complete,
        )

    def _upsert_edges(
        self,
        observer_id: str,
        subjects: list[XUser],
        direction: FollowDirection,
        snapshot_id: str,
        ts: str,
    ) -> int:
        started_count = 0
        for subject in subjects:
            existing = self.conn.execute(
                """
                SELECT is_active FROM follow_edges
                WHERE observer_id=? AND subject_id=? AND direction=?
                """,
                (observer_id, subject.id, direction.value),
            ).fetchone()
            if existing is None or existing["is_active"] == 0:
                started_count += 1
                self.conn.execute(
                    """
                    INSERT OR IGNORE INTO follow_events(
                      id, observer_id, subject_id, direction, event, event_at, snapshot_id)
                    VALUES (?, ?, ?, ?, 'started', ?, ?)
                    """,
                    (uuid.uuid4().hex, observer_id, subject.id, direction.value, ts, snapshot_id),
                )
            self.conn.execute(
                """
                INSERT INTO follow_edges(observer_id, subject_id, direction, is_active,
                  first_seen_at, last_seen_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?, ?)
                ON CONFLICT(observer_id, subject_id, direction) DO UPDATE SET
                  is_active=1, last_seen_at=excluded.last_seen_at,
                  updated_at=excluded.updated_at
                """,
                (observer_id, subject.id, direction.value, ts, ts, ts),
            )
        return started_count

    def _end_missing_edges(
        self,
        observer_id: str,
        subjects: list[XUser],
        direction: FollowDirection,
        snapshot_id: str,
        ts: str,
    ) -> int:
        subject_ids = {subject.id for subject in subjects}
        active_rows = self.conn.execute(
            """
            SELECT subject_id FROM follow_edges
            WHERE observer_id=? AND direction=? AND is_active=1
            """,
            (observer_id, direction.value),
        ).fetchall()
        ended = 0
        for row in active_rows:
            subject_id = row["subject_id"]
            if subject_id in subject_ids:
                continue
            ended += 1
            self.conn.execute(
                """
                UPDATE follow_edges SET is_active=0, updated_at=?
                WHERE observer_id=? AND subject_id=? AND direction=?
                """,
                (ts, observer_id, subject_id, direction.value),
            )
            self.conn.execute(
                """
                INSERT OR IGNORE INTO follow_events(
                  id, observer_id, subject_id, direction, event, event_at, snapshot_id)
                VALUES (?, ?, ?, ?, 'ended', ?, ?)
                """,
                (uuid.uuid4().hex, observer_id, subject_id, direction.value, ts, snapshot_id),
            )
        return ended

    def is_following(self, observer_handle: str, subject_handle: str) -> bool:
        row = self.conn.execute(
            """
            SELECT 1 FROM follow_edges e
            JOIN profiles o ON o.id=e.observer_id
            JOIN profiles s ON s.id=e.subject_id
            WHERE o.handle=? AND s.handle=? AND e.direction='following' AND e.is_active=1
            """,
            (observer_handle.lstrip("@").lower(), subject_handle.lstrip("@").lower()),
        ).fetchone()
        return row is not None

    def active_following_handles(self, observer_handle: str) -> list[str]:
        rows = self.conn.execute(
            """
            SELECT s.handle FROM follow_edges e
            JOIN profiles o ON o.id=e.observer_id
            JOIN profiles s ON s.id=e.subject_id
            WHERE o.handle=? AND e.direction='following' AND e.is_active=1
            ORDER BY s.handle
            """,
            (observer_handle.lstrip("@").lower(),),
        ).fetchall()
        return [row["handle"] for row in rows]

    def graph_summary(self) -> dict[str, int]:
        profiles = self.conn.execute("SELECT count(*) AS c FROM profiles").fetchone()["c"]
        active_edges = self.conn.execute(
            "SELECT count(*) AS c FROM follow_edges WHERE is_active=1"
        ).fetchone()["c"]
        return {"profiles": profiles, "active_edges": active_edges}
