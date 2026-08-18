#!/usr/bin/env python
"""Rebuild semantic embeddings from transcripts stored by Onclave."""

import argparse
import queue
import sys
import threading
from typing import Optional

import httpx
from onclave_client import OnclaveClient


def _list_content_ids() -> list[str]:
    content_ids: list[str] = []
    offset = 0
    with OnclaveClient(timeout=30.0) as client:
        while True:
            response = client.get(
                f"/content?content_type=youtube&limit=100&offset={offset}&exclude_tags="
            )
            if response.status_code != 200:
                raise RuntimeError(f"API content listing returned {response.status_code}")
            body = response.json()
            page = body.get("items", [])
            content_ids.extend(item["id"] for item in page if isinstance(item.get("id"), str))
            offset += len(page)
            if not page or offset >= body.get("total", 0):
                break
    return content_ids


def _reindex_one(client: OnclaveClient, content_id: str) -> tuple[int, str]:
    response = client.post(f"/content/{content_id}/reindex-embeddings")
    if response.status_code != 200:
        raise RuntimeError(
            f"content {content_id} embedding reindex returned {response.status_code}"
        )
    body = response.json()
    chunk_count = body.get("chunk_count")
    model = body.get("model")
    if body.get("status") != "completed" or not isinstance(chunk_count, int):
        raise RuntimeError(f"content {content_id} returned an invalid reindex response")
    if not isinstance(model, str) or not model:
        raise RuntimeError(f"content {content_id} returned no embedding model")
    return chunk_count, model


def _reindex_all(content_ids: list[str], concurrency: int) -> tuple[int, int, set[str]]:
    work: queue.Queue[str] = queue.Queue()
    for content_id in content_ids:
        work.put(content_id)
    stop = threading.Event()
    lock = threading.Lock()
    errors: list[Exception] = []
    completed = 0
    chunk_count = 0
    models: set[str] = set()

    def worker() -> None:
        nonlocal completed, chunk_count
        with OnclaveClient(timeout=180.0) as client:
            while not stop.is_set():
                try:
                    content_id = work.get_nowait()
                except queue.Empty:
                    return
                try:
                    chunks, model = _reindex_one(client, content_id)
                    with lock:
                        completed += 1
                        chunk_count += chunks
                        models.add(model)
                        if completed % 25 == 0 or completed == len(content_ids):
                            print(f"Completed {completed}/{len(content_ids)} videos")
                except Exception as error:
                    with lock:
                        if not errors:
                            errors.append(error)
                    stop.set()
                finally:
                    work.task_done()

    threads = [
        threading.Thread(target=worker) for _ in range(min(concurrency, max(len(content_ids), 1)))
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    if errors:
        raise errors[0]
    return completed, chunk_count, models


def run(args: argparse.Namespace) -> None:
    if args.all == (args.content_id is not None):
        raise RuntimeError("provide one content_id or --all")
    if args.content_id is not None:
        with OnclaveClient(timeout=180.0) as client:
            chunks, model = _reindex_one(client, args.content_id)
        print(f"Content ID: {args.content_id}")
        print(f"Chunks: {chunks}")
        print(f"Model: {model}")
        return

    content_ids = _list_content_ids()
    print(f"Reindexing {len(content_ids)} stored YouTube transcripts")
    completed, chunks, models = _reindex_all(content_ids, args.concurrency)
    print(f"Reindexed videos: {completed}")
    print(f"Chunks: {chunks}")
    print(f"Models: {', '.join(sorted(models))}")


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(
        description="Rebuild semantic embeddings from transcripts stored by Onclave"
    )
    parser.add_argument("content_id", nargs="?", help="Content ID to reindex")
    parser.add_argument("--all", action="store_true", help="Reindex all stored YouTube content")
    parser.add_argument("--concurrency", type=int, default=4, choices=range(1, 17))
    try:
        run(parser.parse_args(argv))
    except (RuntimeError, httpx.RequestError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
