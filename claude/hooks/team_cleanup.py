#!/usr/bin/env python
import json
import os
import shutil
import sys
import time
from pathlib import Path


def remove_old_dirs(base_dir: Path, max_age_secs: int = 86400) -> None:
    if not base_dir.is_dir():
        return
    cutoff = time.time() - max_age_secs
    for item in base_dir.iterdir():
        if item.is_dir() and item.stat().st_mtime < cutoff:
            shutil.rmtree(item, ignore_errors=True)


def remove_old_files(base_dir: Path, pattern: str = "*.json", max_age_secs: int = 86400) -> None:
    if not base_dir.is_dir():
        return
    cutoff = time.time() - max_age_secs
    for item in base_dir.glob(pattern):
        if item.is_file() and item.stat().st_mtime < cutoff:
            try:
                item.unlink()
            except OSError:
                pass


def main() -> None:
    try:
        json.load(sys.stdin)
    except Exception:
        pass

    home = Path(os.path.expanduser("~"))
    claude = home / ".claude"

    remove_old_dirs(claude / "teams")
    remove_old_dirs(claude / "tasks")
    remove_old_files(claude / "damage-control-sessions")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
