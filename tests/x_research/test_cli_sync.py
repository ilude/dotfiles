from pathlib import Path

from x_research import cli
from x_research.models import XUser
from x_research.protocol import Page, ProviderQuotaError


class FakeBackend:
    def __init__(self, _config) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc) -> None:
        pass

    async def user_by_handle(self, handle: str) -> XUser:
        return XUser(id="1", handle=handle)

    async def following(self, _handle: str, *, cursor: str | None = None) -> Page[XUser]:
        assert cursor is None
        return Page(items=[XUser(id="2", handle="a")], source="fixture", complete=True)

    async def followers(self, _handle: str, *, cursor: str | None = None) -> Page[XUser]:
        assert cursor is None
        return Page(items=[XUser(id="3", handle="b")], source="fixture", complete=True)


def _patch_cli(monkeypatch, backend: type[FakeBackend]) -> None:
    monkeypatch.setattr(cli, "TwitterApiIoBackend", backend)
    monkeypatch.setattr(cli, "RATE_LIMIT_DELAY_SECONDS", 0)
    monkeypatch.setattr(cli, "require_twitterapi_io", lambda _config: object())


def test_cli_sync_writes_temp_db(monkeypatch, tmp_path: Path) -> None:
    _patch_cli(monkeypatch, FakeBackend)
    db = tmp_path / "nested" / "x.sqlite"
    assert cli.main(["--db-path", str(db), "sync", "following", "me"]) == 0
    assert db.exists()


def test_db_path_windows_shape(monkeypatch, tmp_path: Path) -> None:
    _patch_cli(monkeypatch, FakeBackend)
    db = tmp_path / "dir with spaces" / "x.sqlite"
    assert cli.main(["--db-path", str(db), "sync", "followers", "me"]) == 0


def test_partial(monkeypatch, tmp_path: Path) -> None:
    class PartialBackend(FakeBackend):
        async def following(self, _handle: str, *, cursor: str | None = None) -> Page[XUser]:
            if cursor is None:
                return Page(items=[], source="fixture", complete=False, next_cursor="next")
            return Page(items=[], source="fixture", complete=False)

    _patch_cli(monkeypatch, PartialBackend)
    code = cli.main(["--db-path", str(tmp_path / "x.sqlite"), "sync", "following", "me"])
    assert code == 1


def test_paginated_sync_records_all_items(monkeypatch, tmp_path: Path) -> None:
    class PaginatedBackend(FakeBackend):
        async def following(self, _handle: str, *, cursor: str | None = None) -> Page[XUser]:
            if cursor is None:
                return Page(
                    items=[XUser(id="2", handle="a")],
                    source="fixture",
                    complete=False,
                    next_cursor="next",
                )
            assert cursor == "next"
            return Page(items=[XUser(id="3", handle="b")], source="fixture", complete=True)

    _patch_cli(monkeypatch, PaginatedBackend)
    db = tmp_path / "x.sqlite"

    assert (
        cli.main(["--db-path", str(db), "sync", "following", "me", "--max-pages", "2"])
        == 0
    )
    assert cli.main(["--db-path", str(db), "check-following", "@a", "@b", "--observer", "me"]) == 0


def test_paginated_sync_preserves_partial_items_on_provider_error(
    monkeypatch, tmp_path: Path
) -> None:
    class QuotaBackend(FakeBackend):
        async def following(self, _handle: str, *, cursor: str | None = None) -> Page[XUser]:
            if cursor is None:
                return Page(
                    items=[XUser(id="2", handle="a")],
                    source="fixture",
                    complete=False,
                    next_cursor="next",
                )
            raise ProviderQuotaError("quota exhausted")

    _patch_cli(monkeypatch, QuotaBackend)
    db = tmp_path / "x.sqlite"

    assert (
        cli.main(["--db-path", str(db), "sync", "following", "me", "--max-pages", "2"])
        == 1
    )
    assert cli.main(["--db-path", str(db), "check-following", "@a", "--observer", "me"]) == 0


def test_sync_stops_when_expected_total_reached(monkeypatch, tmp_path: Path) -> None:
    class ExpectedTotalBackend(FakeBackend):
        async def user_by_handle(self, handle: str) -> XUser:
            return XUser(id="1", handle=handle, following_count=1)

        async def following(self, _handle: str, *, cursor: str | None = None) -> Page[XUser]:
            assert cursor is None
            return Page(
                items=[XUser(id="2", handle="a")],
                source="fixture",
                complete=False,
                next_cursor="unexpected",
            )

    _patch_cli(monkeypatch, ExpectedTotalBackend)
    assert (
        cli.main(["--db-path", str(tmp_path / "x.sqlite"), "sync", "following", "me"])
        == 0
    )


def test_sync_stops_on_repeated_page_contents(monkeypatch, tmp_path: Path) -> None:
    class RepeatedPageBackend(FakeBackend):
        async def following(self, _handle: str, *, cursor: str | None = None) -> Page[XUser]:
            return Page(
                items=[XUser(id="2", handle="a")],
                source="fixture",
                complete=False,
                next_cursor="next-2" if cursor is None else "next-3",
            )

    _patch_cli(monkeypatch, RepeatedPageBackend)
    assert (
        cli.main(
            [
                "--db-path",
                str(tmp_path / "x.sqlite"),
                "sync",
                "following",
                "me",
                "--max-pages",
                "3",
            ]
        )
        == 1
    )


def test_sync_stops_on_empty_cursor_page(monkeypatch, tmp_path: Path) -> None:
    class EmptyCursorBackend(FakeBackend):
        async def following(self, _handle: str, *, cursor: str | None = None) -> Page[XUser]:
            return Page(items=[], source="fixture", complete=False, next_cursor="next")

    _patch_cli(monkeypatch, EmptyCursorBackend)
    assert (
        cli.main(
            [
                "--db-path",
                str(tmp_path / "x.sqlite"),
                "sync",
                "following",
                "me",
                "--max-pages",
                "3",
            ]
        )
        == 1
    )
