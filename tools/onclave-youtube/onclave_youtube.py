"""Console command for Onclave YouTube operations."""

import argparse
from typing import Callable, Optional

from channel_videos import main as channel_main
from check_job import main as job_main
from find_content import main as find_main
from get_content import main as content_main
from ingest_video import main as ingest_main
from list_videos import main as list_main
from post_annotation import main as annotate_main
from reindex_embeddings import main as reindex_embeddings_main
from reprocess import main as reprocess_main
from search import main as search_main

Command = Callable[[Optional[list[str]]], None]

COMMANDS: dict[str, Command] = {
    "ingest": ingest_main,
    "channel": channel_main,
    "list": list_main,
    "search": search_main,
    "content": content_main,
    "find": find_main,
    "job": job_main,
    "reprocess": reprocess_main,
    "reindex-embeddings": reindex_embeddings_main,
    "annotate": annotate_main,
}


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Run Onclave YouTube operations")
    parser.add_argument("command", choices=sorted(COMMANDS), help="Operation to run")
    parser.add_argument("arguments", nargs=argparse.REMAINDER, help="Arguments for the operation")
    args = parser.parse_args(argv)
    COMMANDS[args.command](args.arguments)


if __name__ == "__main__":
    main()
