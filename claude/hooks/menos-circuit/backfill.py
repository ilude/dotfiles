#!/usr/bin/env python
"""Upload locally cached YouTube transcripts to menos when it is reachable."""

from __future__ import annotations

import argparse
import json
import logging
import logging.handlers
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from lib import (
    TRANSCRIPT_LIMIT_BYTES,
    YT_ROOT,
    api_base,
    api_host,
    atomic_delete_dir,
    disabled,
    http_request,
    read_status,
    signed_headers,
    valid_video_id,
)

LOG_PATH = YT_ROOT / ".backfill.log"


def setup_logging() -> logging.Logger:
    YT_ROOT.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("menos-backfill")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.handlers.RotatingFileHandler(LOG_PATH, maxBytes=1_000_000, backupCount=3)
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(handler)
    return logger


def detach() -> int:
    args = [sys.executable, str(Path(__file__).resolve())]
    kwargs = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL, "close_fds": True}
    if os.name == "nt":
        flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        subprocess.Popen(args, creationflags=flags, **kwargs)
    else:
        subprocess.Popen(args, start_new_session=True, **kwargs)
    return 0


def acquire_lock(video_dir: Path, logger: logging.Logger) -> Path | None:
    lock = video_dir / ".backfill.lock"
    now = time.time()
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json.dumps({"pid": os.getpid(), "created_at": now}))
        logger.info("claimed %s", video_dir.name)
        return lock
    except FileExistsError:
        try:
            if now - lock.stat().st_mtime > 30 * 60:
                lock.unlink()
                return acquire_lock(video_dir, logger)
        except OSError:
            pass
        logger.info("skip %s: active lock", video_dir.name)
        return None


def load_local(video_dir: Path, logger: logging.Logger) -> tuple[str, dict | None] | None:
    marker = video_dir / ".complete"
    transcript_path = video_dir / "transcript.txt"
    try:
        complete = json.loads(marker.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("skip %s: corrupt or missing .complete", video_dir.name)
        return None
    if not complete.get("transcript"):
        logger.info("skip %s: transcript not complete", video_dir.name)
        return None
    try:
        raw = transcript_path.read_bytes()
    except OSError:
        logger.warning("skip %s: missing transcript.txt", video_dir.name)
        return None
    if not raw.strip():
        logger.warning("skip %s: empty transcript.txt", video_dir.name)
        return None
    if len(raw) > TRANSCRIPT_LIMIT_BYTES:
        logger.warning("skip %s: transcript over 5 MB", video_dir.name)
        return None
    transcript = raw.decode("utf-8")
    metadata_path = video_dir / "metadata.json"
    metadata = None
    if complete.get("metadata"):
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except Exception:
            logger.warning("skip %s: metadata marked complete but missing/malformed", video_dir.name)
            return None
    elif metadata_path.exists():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except Exception:
            logger.info("%s: ignoring malformed optional metadata", video_dir.name)
    return transcript, metadata


def signed_json(method: str, url: str, path: str, payload: dict | None, timeout: float = 30.0) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json", **signed_headers(method, path, body)}
    status, raw = http_request(method, url, body=body, headers=headers, timeout=timeout)
    try:
        data = json.loads(raw.decode("utf-8")) if raw else {}
    except json.JSONDecodeError:
        data = {"raw": raw.decode("utf-8", "replace")}
    return status, data


def poll_completed(content_id: str, logger: logging.Logger) -> bool:
    base = api_base().rstrip("/")
    path = f"/api/v1/content/{content_id}"
    delays = [0.25, 0.5, 1, 2, 4, 8, 16, 30]
    deadline = time.time() + 60
    while time.time() < deadline:
        status, data = signed_json("GET", f"{base}/content/{content_id}", path, None, timeout=10.0)
        if 200 <= status < 300 and data.get("processing_status") == "completed":
            logger.info("%s completed", content_id)
            return True
        if data.get("processing_status") in {"failed", "error"}:
            logger.warning("%s pipeline failed: %s", content_id, data.get("processing_status"))
            return False
        time.sleep(delays.pop(0) if delays else 30)
    logger.warning("%s completion polling timed out", content_id)
    return False


def upload_one(video_dir: Path, logger: logging.Logger) -> None:
    lock = acquire_lock(video_dir, logger)
    if not lock:
        return
    try:
        loaded = load_local(video_dir, logger)
        if not loaded:
            return
        transcript, metadata = loaded
        base = api_base().rstrip("/")
        path = "/api/v1/ingest"
        payload = {
            "url": f"https://youtube.com/watch?v={video_dir.name}",
            "transcript_text": transcript,
            "transcript_format": "plain",
            "metadata": metadata,
        }
        status, data = signed_json("POST", f"{base}/ingest", path, payload, timeout=180.0)
        if not (200 <= status < 300):
            logger.warning("%s upload failed: HTTP %s %s", video_dir.name, status, data)
            return
        content_id = data.get("content_id")
        if not content_id:
            logger.warning("%s upload response missing content_id: %s", video_dir.name, data)
            return
        if not poll_completed(content_id, logger):
            return
        logger.info("%s verified; deleting local cache", video_dir.name)
        try:
            lock.unlink(missing_ok=True)
        except OSError:
            pass
        atomic_delete_dir(video_dir)
    finally:
        try:
            lock.unlink(missing_ok=True)
        except OSError:
            pass


def run() -> int:
    logger = setup_logging()
    if disabled():
        logger.info("disabled via MENOS_CIRCUIT_DISABLED")
        return 0
    status = read_status()
    if status and status.get("available") is False:
        logger.info("skip: status hint unavailable")
        return 0
    deadline = time.time() + 5 * 60
    for video_dir in sorted(YT_ROOT.iterdir()) if YT_ROOT.exists() else []:
        if time.time() > deadline:
            logger.info("runtime cap reached")
            break
        if video_dir.is_dir() and valid_video_id(video_dir.name):
            try:
                upload_one(video_dir, logger)
            except Exception as exc:
                logger.exception("%s failed: %s", video_dir.name, exc)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--detach", action="store_true")
    args = parser.parse_args()
    if args.detach:
        return detach()
    return run()


if __name__ == "__main__":
    raise SystemExit(main())
