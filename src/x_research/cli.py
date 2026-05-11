"""Command-line interface for the local X research pipeline."""

from __future__ import annotations

import argparse
import asyncio
from collections.abc import Sequence
from pathlib import Path

from .backends.twitterapi_io_backend import TwitterApiIoBackend
from .config import load_config, require_twitterapi_io
from .db import connect
from .models import FollowDirection
from .protocol import XResearchError
from .repository import XRepository

RATE_LIMIT_DELAY_SECONDS = 5.1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="x-research")
    parser.add_argument("--db-path", type=Path, default=None)
    parser.add_argument("--config", type=Path, default=None)
    sub = parser.add_subparsers(dest="command", required=True)

    sync = sub.add_parser("sync")
    sync_sub = sync.add_subparsers(dest="direction", required=True)
    for direction in ("following", "followers"):
        p = sync_sub.add_parser(direction)
        p.add_argument("handle")
        p.add_argument("--source", choices=["twitterapi-io"], default="twitterapi-io")
        p.add_argument(
            "--max-pages",
            type=int,
            default=1,
            help="Maximum live provider pages to fetch; default 1 to cap metered API spend.",
        )

    check = sub.add_parser("check-following")
    check.add_argument("handles", nargs="+")
    check.add_argument("--observer", default="me")

    graph = sub.add_parser("graph")
    graph_sub = graph.add_subparsers(dest="graph_command", required=True)
    graph_sub.add_parser("summary")
    graph_sub.add_parser("mutuals")
    graph_sub.add_parser("non-mutual-following")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = load_config(args.config)
    db_path = args.db_path or config.database.path
    if args.command == "sync":
        return asyncio.run(_sync(args, db_path, config))
    with connect(db_path) as conn:
        repo = XRepository(conn)
        if args.command == "check-following":
            for handle in args.handles:
                status = (
                    "following" if repo.is_following(args.observer, handle) else "not-following"
                )
                print(f"{handle.lstrip('@').lower()}\t{status}")
            return 0
        if args.command == "graph":
            if args.graph_command == "summary":
                summary = repo.graph_summary()
                print(f"profiles\t{summary['profiles']}")
                print(f"active_edges\t{summary['active_edges']}")
            else:
                # MVP smoke command; detailed set algebra can build on repository queries later.
                print("no-results")
            return 0
    return 2


async def _sync(args: argparse.Namespace, db_path: Path, config: object) -> int:
    if args.max_pages < 1:
        raise SystemExit("--max-pages must be at least 1")
    provider_config = require_twitterapi_io(config)  # type: ignore[arg-type]
    async with TwitterApiIoBackend(provider_config) as client:
        observer = await client.user_by_handle(args.handle)
        # twitterapi.io free tier allows one request every 5 seconds; avoid turning
        # the required user lookup + paginated follow-list requests into live 429s.
        await asyncio.sleep(RATE_LIMIT_DELAY_SECONDS)
        items = []
        cursor = None
        page_count = 0
        page_complete = False
        provider_source = args.source
        expected_total = (
            observer.following_count
            if args.direction == "following"
            else observer.followers_count
        )
        seen_cursors: set[str] = set()
        seen_page_fingerprints: set[tuple[str, ...]] = set()
        warnings: list[str] = []
        direction = (
            FollowDirection.FOLLOWING
            if args.direction == "following"
            else FollowDirection.FOLLOWERS
        )
        sync_error = None
        while True:
            try:
                if args.direction == "following":
                    page = await client.following(args.handle, cursor=cursor)
                else:
                    page = await client.followers(args.handle, cursor=cursor)
            except XResearchError as exc:
                sync_error = exc
                break
            page_count += 1
            provider_source = page.source
            fingerprint = _page_fingerprint(page.items)
            if fingerprint in seen_page_fingerprints:
                warnings.append("repeated page contents; stopping before another live call")
                break
            seen_page_fingerprints.add(fingerprint)
            items.extend(page.items)
            cursor = page.next_cursor
            page_complete = page.complete
            if expected_total is not None and len(items) >= expected_total:
                page_complete = True
                cursor = None
                warnings.append("expected total reached; stopping despite pagination metadata")
                break
            if not cursor:
                break
            if cursor in seen_cursors:
                warnings.append("repeated cursor; stopping before another live call")
                cursor = None
                break
            seen_cursors.add(cursor)
            if not page.items:
                warnings.append("empty page with next cursor; stopping before another live call")
                break
            if page_count >= args.max_pages:
                warnings.append("max pages reached; stopping before another live call")
                break
            await asyncio.sleep(RATE_LIMIT_DELAY_SECONDS)
    with connect(db_path) as conn:
        result = XRepository(conn).record_follow_snapshot(
            observer,
            items,
            direction=direction,
            provider=provider_source,
            complete=page_complete and sync_error is None,
            page_count=page_count,
            next_cursor=cursor,
        )
    print(
        f"snapshot\t{result.snapshot_id}\titems\t{result.item_count}\tcomplete\t{result.complete}"
    )
    for warning in warnings:
        print(f"warning\t{warning}")
    if sync_error is not None:
        print(f"partial\t{type(sync_error).__name__}\t{sync_error}")
    return 0 if result.complete else 1


def _page_fingerprint(items: Sequence[object]) -> tuple[str, ...]:
    ids = [getattr(item, "id", repr(item)) for item in items]
    return tuple(sorted(str(item_id) for item_id in ids))


if __name__ == "__main__":
    raise SystemExit(main())
