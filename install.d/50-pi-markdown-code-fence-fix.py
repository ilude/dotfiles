#!/usr/bin/env python3
# install.d:
#   reason: Temporary local patch for Pi TUI Markdown fenced-code rendering.
#   remove_when: Upstream pi-tui stops rendering fenced-code delimiter lines.
#   safe_to_skip: true
#   idempotent: true
"""Apply the local Pi TUI Markdown fenced-code rendering fix.

Pi's TUI Markdown renderer currently renders fenced-code delimiters (```)
as visible code-block border lines. This local patch makes the renderer output
only the code content. The script is intentionally idempotent and narrow: it
only edits pi-tui/dist/components/markdown.js files found in the active pnpm
global install/store.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ACTIVE_SCOPE = "@earendil-works"
LEGACY_SCOPE = "@mariozechner"
PACKAGE_NAME = "pi-tui"
PATCH_MARKER = "Rendering them as codeBlockBorder leaks literal ``` lines into Pi output."
BACKUP_SUFFIX = ".bak-dotfiles-markdown-fence"

# Assemble the JS template literal so the Markdown fence is visually unambiguous.
OPENING_PUSH_EXACT = (
    "                lines.push(this.theme.codeBlockBorder(`"
    + "```"
    + "${token.lang || \"\"}`));"
)
OPENING_PUSH_ESCAPED = (
    "                lines.push(this.theme.codeBlockBorder(`"
    + r"\`\`\`"
    + "${token.lang || \"\"}`));"
)
CLOSING_PUSH_EXACT = "                lines.push(this.theme.codeBlockBorder(\"```\"));"
OPENING_COMMENT = (
    "                // Fenced code block delimiters are Markdown syntax, not rendered content.\n"
    "                // Rendering them as codeBlockBorder leaks literal ``` lines into Pi output."
)


def run(args: list[str]) -> str | None:
    try:
        completed = subprocess.run(args, check=True, capture_output=True, text=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    return completed.stdout.strip()


def pnpm_global_root() -> Path | None:
    output = run(["pnpm", "root", "-g"])
    if not output:
        return None
    return Path(output.splitlines()[-1]).expanduser()


def add_package_paths(root: Path, scope: str, found: list[Path], seen: set[Path]) -> None:
    direct_path = root / scope / PACKAGE_NAME / "dist" / "components" / "markdown.js"
    add_candidate(direct_path, found, seen)

    store_root = root.parent / ".pnpm"
    if not store_root.exists():
        return

    encoded_scope = scope.removeprefix("@").replace("/", "+")
    for package_dir in store_root.glob(f"@{encoded_scope}+{PACKAGE_NAME}@*"):
        add_candidate(
            package_dir
            / "node_modules"
            / scope
            / PACKAGE_NAME
            / "dist"
            / "components"
            / "markdown.js",
            found,
            seen,
        )


def add_candidate(path: Path, found: list[Path], seen: set[Path]) -> None:
    if not path.is_file():
        return
    resolved = path.resolve()
    if resolved in seen:
        return
    seen.add(resolved)
    found.append(resolved)


def candidate_paths(include_legacy: bool) -> list[Path]:
    node_modules_roots: list[Path] = []

    pnpm_root = pnpm_global_root()
    if pnpm_root:
        node_modules_roots.append(pnpm_root)

    global_bases: list[Path] = []
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        global_bases.append(Path(local_appdata) / "pnpm" / "global")

    home = Path.home()
    global_bases.extend([
        home / ".local" / "share" / "pnpm" / "global",
        home / "Library" / "pnpm" / "global",
    ])

    for base in global_bases:
        if not base.exists():
            continue
        for version_dir in base.iterdir():
            if version_dir.is_dir():
                node_modules_roots.append(version_dir / "node_modules")

    found: list[Path] = []
    seen: set[Path] = set()
    scopes = [ACTIVE_SCOPE, LEGACY_SCOPE] if include_legacy else [ACTIVE_SCOPE]

    for root in node_modules_roots:
        for scope in scopes:
            add_package_paths(root, scope, found, seen)

    return sorted(found)


def patch_text(text: str) -> tuple[str, bool]:
    opening_patterns = (OPENING_PUSH_EXACT, OPENING_PUSH_ESCAPED)
    if PATCH_MARKER in text and CLOSING_PUSH_EXACT not in text and not any(
        pattern in text for pattern in opening_patterns
    ):
        return text, False

    changed = False
    for opening_push in opening_patterns:
        if opening_push in text:
            text = text.replace(opening_push, OPENING_COMMENT, 2)
            changed = True
    if CLOSING_PUSH_EXACT in text:
        text = text.replace(CLOSING_PUSH_EXACT + "\n", "", 2)
        changed = True
    return text, changed


def patch_file(path: Path, dry_run: bool) -> str:
    original = path.read_text(encoding="utf-8")
    patched, changed = patch_text(original)

    if not changed:
        if PATCH_MARKER in original and CLOSING_PUSH_EXACT not in original:
            return f"already patched: {path}"
        return f"pattern not found: {path}"

    if dry_run:
        return f"would patch: {path}"

    backup = path.with_name(path.name + BACKUP_SUFFIX)
    if not backup.exists():
        shutil.copy2(path, backup)
    path.write_text(patched, encoding="utf-8", newline="\n")
    return f"patched: {path}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report changes without writing")
    parser.add_argument(
        "--include-legacy-scope",
        action="store_true",
        help="also patch deprecated @mariozechner/pi-tui installs during migration",
    )
    args = parser.parse_args()

    paths = candidate_paths(include_legacy=args.include_legacy_scope)
    if not paths:
        print("No pnpm-global @earendil-works/pi-tui markdown.js files found.", file=sys.stderr)
        return 1

    statuses = [patch_file(path, args.dry_run) for path in paths]
    for status in statuses:
        print(status)

    failures = [s for s in statuses if s.startswith("pattern not found")]
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
