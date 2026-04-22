import json
import logging
import sys
import time
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from rules import classify_argv, load_rules

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_rule(directory: Path, filename: str, rule: dict) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / filename
    path.write_text(json.dumps(rule), encoding="utf-8")
    return path


_VALID_RULE_BASE = {
    "id": "x",
    "family": "test",
    "match": {"argv0": ["x"]},
}


# ---------------------------------------------------------------------------
# test_overlay_order
# ---------------------------------------------------------------------------

def test_overlay_order(tmp_path: Path) -> None:
    builtin_dir = tmp_path / "builtin"
    project_dir = tmp_path / "project"

    _write_rule(builtin_dir, "x.json", {**_VALID_RULE_BASE, "description": "builtin version"})
    _write_rule(project_dir, "x.json", {**_VALID_RULE_BASE, "description": "project version"})

    rules = load_rules(builtin_dir, user_dir=None, project_dir=project_dir)

    assert len(rules) == 1
    assert rules[0]["description"] == "project version"


# ---------------------------------------------------------------------------
# test_malformed_rule_skipped
# ---------------------------------------------------------------------------

def test_malformed_rule_skipped(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    builtin_dir = tmp_path / "builtin"
    builtin_dir.mkdir(parents=True)

    bad_path = builtin_dir / "bad.json"
    bad_path.write_text("{}", encoding="utf-8")

    good_rule = {**_VALID_RULE_BASE, "id": "good", "match": {"argv0": ["good"]}}
    _write_rule(builtin_dir, "good.json", good_rule)

    with caplog.at_level(logging.WARNING):
        rules = load_rules(builtin_dir)

    ids = [r["id"] for r in rules]
    assert "good" in ids
    assert not any(r.get("id") == "" for r in rules)

    # bad.json has no id/family/match so schema validation fails -> WARN logged
    assert any("bad.json" in record.message for record in caplog.records)
    assert any(record.levelno == logging.WARNING for record in caplog.records)


# ---------------------------------------------------------------------------
# test_collision_logged
# ---------------------------------------------------------------------------

def test_collision_logged(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    builtin_dir = tmp_path / "builtin"
    project_dir = tmp_path / "project"

    builtin_path = _write_rule(
        builtin_dir, "dup.json", {**_VALID_RULE_BASE, "id": "dup", "description": "builtin"}
    )
    project_path = _write_rule(
        project_dir, "dup.json", {**_VALID_RULE_BASE, "id": "dup", "description": "project"}
    )

    with caplog.at_level(logging.WARNING):
        rules = load_rules(builtin_dir, user_dir=None, project_dir=project_dir)

    warn_messages = [r.message for r in caplog.records if r.levelno == logging.WARNING]
    assert any("dup" in msg for msg in warn_messages), "Expected WARN about id collision"

    # Both source paths should appear in at least one warning message together
    combined = " ".join(warn_messages)
    assert str(builtin_path) in combined or "builtin" in combined
    assert str(project_path) in combined or "project" in combined

    # project version wins
    assert len([r for r in rules if r["id"] == "dup"]) == 1
    assert next(r for r in rules if r["id"] == "dup")["description"] == "project"


# ---------------------------------------------------------------------------
# test_classify_argv_match
# ---------------------------------------------------------------------------

def test_classify_argv_match(tmp_path: Path) -> None:
    builtin_dir = tmp_path / "builtin"
    rule = {
        "id": "git/status",
        "family": "git",
        "match": {
            "argv0": ["git"],
            "argvIncludes": [["status"]],
        },
    }
    _write_rule(builtin_dir, "status.json", rule)

    rules = load_rules(builtin_dir)

    rule_id, confidence = classify_argv(["git", "status", "--short"], rules)
    assert rule_id == "git/status"
    assert confidence == 1.0


# ---------------------------------------------------------------------------
# test_classify_argv_no_match
# ---------------------------------------------------------------------------

def test_classify_argv_no_match(tmp_path: Path) -> None:
    builtin_dir = tmp_path / "builtin"
    rule = {
        "id": "git/status",
        "family": "git",
        "match": {
            "argv0": ["git"],
            "argvIncludes": [["status"]],
        },
    }
    _write_rule(builtin_dir, "status.json", rule)

    rules = load_rules(builtin_dir)

    rule_id, confidence = classify_argv(["unknown-tool"], rules)
    assert rule_id is None
    assert confidence == 0.0


# ---------------------------------------------------------------------------
# test_classify_argv_skips_rules_without_argv0
# ---------------------------------------------------------------------------

def test_classify_argv_skips_rules_without_argv0() -> None:
    # Rule with only toolNames -- no argv0 -- must never match via classify_argv.
    no_argv0_rule = {
        "id": "build/esbuild",
        "family": "build",
        "match": {"toolNames": ["esbuild"]},
    }
    argv0_rule = {
        "id": "git/status",
        "family": "git",
        "match": {"argv0": ["git"], "argvIncludes": [["status"]]},
    }

    rules = [no_argv0_rule, argv0_rule]

    # argv that matches neither rule -- no_argv0_rule must not fall through as wildcard
    rule_id, confidence = classify_argv(["esbuild", "src/index.ts"], rules)
    assert rule_id is None
    assert confidence == 0.0

    # argv that matches the real argv0 rule
    rule_id, confidence = classify_argv(["git", "status"], rules)
    assert rule_id == "git/status"
    assert confidence == 1.0


# ---------------------------------------------------------------------------
# test_classify_argv_git_subcommands_real_builtins
# ---------------------------------------------------------------------------

_BUILTIN_DIR = Path(__file__).parent.parent / "rules" / "builtin"


def test_classify_argv_git_subcommands_real_builtins() -> None:
    rules = load_rules(_BUILTIN_DIR, user_dir=None, project_dir=None)

    # git status must match its own rule, not be intercepted by gitSubcommands rules
    rule_id, confidence = classify_argv(["git", "status"], rules)
    assert rule_id == "git/status", f"Expected git/status, got {rule_id!r}"
    assert confidence == 1.0

    # git ls-files must match the gitSubcommands rule
    rule_id, confidence = classify_argv(["git", "ls-files"], rules)
    assert rule_id == "filesystem/git-ls-files", f"Expected filesystem/git-ls-files, got {rule_id!r}"
    assert confidence == 1.0


# ---------------------------------------------------------------------------
# lazy-load tests
# ---------------------------------------------------------------------------

def test_lazy_load_opens_only_matched_argv0(tmp_path: Path) -> None:
    """load_rules with argv0='git' should open only the git subset + index, not all 107 files."""
    open_calls: list[str] = []
    real_open = open

    def counting_open(path, *args, **kwargs):
        open_calls.append(str(path))
        return real_open(path, *args, **kwargs)

    with patch("builtins.open", side_effect=counting_open):
        rules = load_rules(_BUILTIN_DIR, user_dir=None, project_dir=None, argv0="git")

    # Only files opened for json reads (excludes schema, index itself)
    rule_opens = [p for p in open_calls if p.endswith(".json") and "_index" not in p and "rule.schema" not in p]
    # 11 git rules in the index -- allow a small margin for any extras
    assert len(rule_opens) <= 15, f"Expected <=15 rule file opens, got {len(rule_opens)}: {rule_opens}"
    # Verify classification still works on the narrowed set
    rule_id, _ = classify_argv(["git", "status"], rules)
    assert rule_id == "git/status"


def test_full_load_when_no_argv0() -> None:
    """load_rules with no argv0 loads all builtin rules (batch/eval path)."""
    rules = load_rules(_BUILTIN_DIR, user_dir=None, project_dir=None, argv0=None)
    # There are 107 rule files; all argv0-tagged ones plus non-argv0 rules are loaded
    assert len(rules) >= 100, f"Expected >=100 rules in full load, got {len(rules)}"


def test_stale_index_falls_back(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    """When a rule file is newer than _index.json, loader warns and falls back to full scan."""
    import shutil

    # Copy builtin dir into tmp so we can manipulate mtimes safely
    builtin_copy = tmp_path / "builtin"
    shutil.copytree(str(_BUILTIN_DIR), str(builtin_copy))

    index_path = builtin_copy / "_index.json"
    assert index_path.exists()

    # Touch a rule file to make it newer than the index
    status_json = builtin_copy / "git" / "status.json"
    future_time = time.time() + 10
    import os
    os.utime(str(status_json), (future_time, future_time))

    with caplog.at_level(logging.WARNING):
        loaded_rules = load_rules(builtin_copy, user_dir=None, project_dir=None, argv0="git")

    warn_messages = [r.message for r in caplog.records if r.levelno == logging.WARNING]
    assert any("stale" in m or "missing" in m for m in warn_messages), (
        f"Expected stale-index WARN, got: {warn_messages}"
    )
    # Full scan fallback must still return a correct rule set
    rule_id, _ = classify_argv(["git", "status"], loaded_rules)
    assert rule_id == "git/status"


def test_classify_argv_still_correct_after_lazy() -> None:
    """Lazy path (argv0='git') must produce same classification results as full load."""
    lazy_rules = load_rules(_BUILTIN_DIR, user_dir=None, project_dir=None, argv0="git")

    rule_id, confidence = classify_argv(["git", "status"], lazy_rules)
    assert rule_id == "git/status"
    assert confidence == 1.0

    rule_id, confidence = classify_argv(["git", "ls-files"], lazy_rules)
    assert rule_id == "filesystem/git-ls-files"
    assert confidence == 1.0
