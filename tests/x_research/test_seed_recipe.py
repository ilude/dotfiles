from pathlib import Path

from x_research.cli import main
from x_research.db import connect
from x_research.models import FollowDirection, XUser
from x_research.repository import XRepository


def test_seed_recipe(tmp_path: Path, capsys) -> None:
    db = tmp_path / "x.sqlite"
    with connect(db) as conn:
        repo = XRepository(conn)
        repo.record_follow_snapshot(
            XUser(id="1", handle="me"),
            [XUser(id="2", handle="alice")],
            direction=FollowDirection.FOLLOWING,
            provider="fixture",
            complete=True,
        )
        repo.record_follow_snapshot(
            XUser(id="1", handle="me"),
            [XUser(id="2", handle="alice")],
            direction=FollowDirection.FOLLOWING,
            provider="fixture",
            complete=True,
        )
    assert main(["--db-path", str(db), "check-following", "alice", "bob"]) == 0
    output = capsys.readouterr().out
    assert output.count("following") == 2


def test_idempotent(tmp_path: Path) -> None:
    db = tmp_path / "x.sqlite"
    with connect(db) as conn:
        repo = XRepository(conn)
        me = XUser(id="1", handle="me")
        repo.record_follow_snapshot(
            me, [], direction=FollowDirection.FOLLOWING, provider="f", complete=True
        )
        repo.record_follow_snapshot(
            me, [], direction=FollowDirection.FOLLOWING, provider="f", complete=True
        )
        assert repo.conn.execute("SELECT count(*) c FROM follow_edges").fetchone()["c"] == 0


def test_candidate_counts(tmp_path: Path, capsys) -> None:
    db = tmp_path / "x.sqlite"
    with connect(db) as conn:
        XRepository(conn).record_follow_snapshot(
            XUser(id="1", handle="me"),
            [XUser(id="2", handle="alice")],
            direction=FollowDirection.FOLLOWING,
            provider="fixture",
            complete=True,
        )
    main(["--db-path", str(db), "check-following", "alice", "bob"])
    out = capsys.readouterr().out
    assert out.count("\tfollowing") == 1
    assert out.count("\tnot-following") == 1
