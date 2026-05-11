from pathlib import Path

from x_research.models import FollowDirection, XUser

from x_research.cli import main
from x_research.db import connect
from x_research.repository import XRepository


def _seed(path: Path) -> None:
    with connect(path) as conn:
        XRepository(conn).record_follow_snapshot(
            XUser(id="1", handle="me"),
            [XUser(id="2", handle="a")],
            direction=FollowDirection.FOLLOWING,
            provider="fixture",
            complete=True,
        )


def test_check_following(tmp_path: Path, capsys) -> None:
    db = tmp_path / "x.sqlite"
    _seed(db)
    assert main(["--db-path", str(db), "check-following", "@a", "@b"]) == 0
    out = capsys.readouterr().out
    assert "a\tfollowing" in out
    assert "b\tnot-following" in out


def test_graph(tmp_path: Path, capsys) -> None:
    db = tmp_path / "x.sqlite"
    _seed(db)
    assert main(["--db-path", str(db), "graph", "summary"]) == 0
    assert "profiles\t2" in capsys.readouterr().out
