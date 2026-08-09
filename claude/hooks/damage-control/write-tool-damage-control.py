# /// script
# requires-python = ">=3.8"
# dependencies = ["pyyaml"]
# ///
"""
Claude Code Write Tool Damage Control
======================================

Blocks writes to protected files via PreToolUse hook on Write tool.
Loads zeroAccessPaths and readOnlyPaths from patterns.yaml.

Exit codes:
  0 = Allow write
  2 = Block write (stderr fed back to Claude)
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Any

hook_dir = str(Path(__file__).parent)
if hook_dir not in sys.path:
    sys.path.insert(0, hook_dir)
core = importlib.import_module("file_operation_damage_control")

get_log_path = core.get_log_path
log_decision = core.log_decision
spawn_log_rotation = core.spawn_log_rotation
is_glob_pattern = core.is_glob_pattern
_match_glob_path = core._match_glob_path
_match_exact_path = core._match_exact_path
match_path = core.match_path
get_config_path = core.get_config_path
load_config = core.load_config
detect_context = core.detect_context
_check_zero_access = core._check_zero_access
_path_matches_content_scan = core._path_matches_content_scan
_scan_content_for_injections = core._scan_content_for_injections
_check_write_confirm = core._check_write_confirm
check_path = core.check_path


def _check_content_injection(
    file_path: str,
    content: str,
    config: dict[str, Any],
    context: str | None,
) -> None:
    """Apply content injection protection with Write hook semantics."""
    core.check_content_injection(
        "Write",
        file_path,
        content,
        config,
        context,
        log_decision,
        spawn_log_rotation,
    )


def main() -> None:
    core.run_file_operation_hook(
        "Write",
        "content",
        "write",
        load_config,
        log_decision,
        spawn_log_rotation,
    )


if __name__ == "__main__":
    main()
