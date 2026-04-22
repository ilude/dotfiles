"""
Build the argv0 index for the builtin rules directory.

Scans pi/tool-reduction/rules/builtin/, reads each rule's match.argv0 array,
and writes pi/tool-reduction/rules/builtin/_index.json with the schema:

  {"argv0_to_files": {"git": ["git/branch.json", ...], "pnpm": [...], ...}}

Paths in the index are relative to the builtin/ directory.
Rules with no match.argv0 are skipped (they are not argv-matchable).

Idempotent: running twice produces identical output.

Usage:
    python pi/tool-reduction/build_index.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_HERE = Path(__file__).parent
_BUILTIN_DIR = _HERE / "rules" / "builtin"
_INDEX_PATH = _BUILTIN_DIR / "_index.json"
_SKIP_NAMES = {"_index.json"}


def build_index(builtin_dir: Path) -> dict[str, list[str]]:
    """Return argv0 -> sorted list of relative rule file paths."""
    argv0_to_files: dict[str, list[str]] = {}

    for json_path in sorted(builtin_dir.rglob("*.json")):
        if json_path.name in _SKIP_NAMES:
            continue
        try:
            with open(json_path, encoding="utf-8") as f:
                rule = json.load(f)
        except Exception as exc:
            print(f"WARNING: skipping {json_path}: {exc}", file=sys.stderr)
            continue

        argv0_list: list[str] = rule.get("match", {}).get("argv0", [])
        if not argv0_list:
            continue

        rel = json_path.relative_to(builtin_dir).as_posix()
        for argv0 in argv0_list:
            argv0_to_files.setdefault(argv0, [])
            if rel not in argv0_to_files[argv0]:
                argv0_to_files[argv0].append(rel)

    # Sort values for deterministic output
    for key in argv0_to_files:
        argv0_to_files[key].sort()

    return argv0_to_files


def main() -> None:
    argv0_to_files = build_index(_BUILTIN_DIR)
    index = {"argv0_to_files": argv0_to_files}
    content = json.dumps(index, indent=2, sort_keys=True) + "\n"
    _INDEX_PATH.write_text(content, encoding="utf-8")
    total_rules = sum(len(v) for v in argv0_to_files.values())
    print(f"Written {_INDEX_PATH} ({len(argv0_to_files)} argv0 keys, {total_rules} rule refs)")


if __name__ == "__main__":
    main()
