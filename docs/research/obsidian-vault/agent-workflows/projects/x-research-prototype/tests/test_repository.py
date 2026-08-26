from pathlib import Path

from x_research.db import connect
from x_research.models import FollowDirection, XUser
from x_research.repository import XRepository


def _repo(tmp_path: Path) -> XRepository:
    return XRepository(connect(tmp_path / "x.sqlite"))


def test_init_creates_tables(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    row = repo.conn.execute("SELECT name FROM sqlite_master WHERE name='profiles'").fetchone()
    assert row is not None


def test_idempotent_duplicate_upserts(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    observer = XUser(id="1", handle="me")
    subject = XUser(id="2", handle="a")
    for _ in range(2):
        repo.record_follow_snapshot(
            observer,
            [subject],
            direction=FollowDirection.FOLLOWING,
            provider="fixture",
            complete=False,
        )
    assert repo.conn.execute("SELECT count(*) c FROM follow_edges").fetchone()["c"] == 1


def test_snapshot_completeness(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    me = XUser(id="1", handle="me")
    a = XUser(id="2", handle="a")
    repo.record_follow_snapshot(
        me, [a], direction=FollowDirection.FOLLOWING, provider="f", complete=True
    )
    repo.record_follow_snapshot(
        me, [], direction=FollowDirection.FOLLOWING, provider="f", complete=False
    )
    assert repo.is_following("me", "a") is True
    repo.record_follow_snapshot(
        me, [], direction=FollowDirection.FOLLOWING, provider="f", complete=True
    )
    assert repo.is_following("me", "a") is False
    ended = repo.conn.execute(
        "SELECT count(*) c FROM follow_events WHERE event='ended'"
    ).fetchone()["c"]
    assert ended == 1


def test_migration(tmp_path: Path) -> None:
    conn = connect(tmp_path / "old.sqlite")
    assert conn.execute("SELECT version FROM schema_migrations").fetchone()["version"] == 1
