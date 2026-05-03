from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HELPER = Path(__file__).resolve().parents[1] / "scripts" / "commit-helper"


def run(cmd: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        cmd,
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if check and result.returncode != 0:
        raise AssertionError(
            f"command failed: {cmd}\nstdout={result.stdout}\nstderr={result.stderr}"
        )
    return result


def git(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return run(["git", *args], cwd)


def helper(cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return run([sys.executable, str(HELPER), *args], cwd, check=check)


def init_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init")
    git(repo, "config", "user.email", "test@example.invalid")
    git(repo, "config", "user.name", "Test User")
    return repo


def test_ignored_staged_deletion_keeps_staged_and_is_not_safe_to_add(tmp_path: Path) -> None:
    repo = init_repo(tmp_path)
    state_dir = repo / "claude" / "state"
    state_dir.mkdir(parents=True)
    status_file = state_dir / "menos_status.json"
    status_file.write_text('{"available": true}\n', encoding="utf-8")
    git(repo, "add", "claude/state/menos_status.json")
    git(repo, "commit", "-m", "chore: seed status file")

    (repo / ".gitignore").write_text("claude/state/menos_status.json\n", encoding="utf-8")
    git(repo, "rm", "--cached", "claude/state/menos_status.json")

    result = helper(repo, "stage-plan")
    payload = json.loads(result.stdout)
    entry = next(
        item for item in payload["entries"] if item["path"] == "claude/state/menos_status.json"
    )

    assert entry["classification"] == "staged_deletion"
    assert entry["ignored"] is True
    assert entry["safe_to_git_add"] is False
    assert entry["recommended_action"] == "keep_staged"



def test_validate_message_accepts_conventional_and_rejects_plain_sentence(tmp_path: Path) -> None:
    repo = init_repo(tmp_path)

    invalid = helper(repo, "validate-message", "Ignore generated menos status", check=False)
    valid = helper(repo, "validate-message", "chore: ignore generated menos status", check=False)

    assert invalid.returncode != 0
    assert valid.returncode == 0



def test_status_json_parseable_and_paths_with_spaces_are_repo_relative(tmp_path: Path) -> None:
    repo = init_repo(tmp_path)
    file_with_spaces = repo / "docs" / "file with spaces.txt"
    file_with_spaces.parent.mkdir()
    file_with_spaces.write_text("hello\n", encoding="utf-8")

    result = helper(repo, "status-json")
    payload = json.loads(result.stdout)

    assert payload["schema_version"] == 1
    assert payload["repo_root"]
    assert payload["clean"] is False
    entry = next(item for item in payload["entries"] if item["path"] == "docs/file with spaces.txt")
    assert entry["classification"] == "untracked"
    assert entry["path"] == "docs/file with spaces.txt"



def test_stage_plan_marks_modified_tracked_file_safe_to_stage(tmp_path: Path) -> None:
    repo = init_repo(tmp_path)
    tracked = repo / "README.md"
    tracked.write_text("one\n", encoding="utf-8")
    git(repo, "add", "README.md")
    git(repo, "commit", "-m", "chore: seed readme")
    tracked.write_text("two\n", encoding="utf-8")

    payload = json.loads(helper(repo, "stage-plan").stdout)
    entry = next(item for item in payload["entries"] if item["path"] == "README.md")

    assert entry["classification"] == "modified"
    assert entry["safe_to_git_add"] is True
    assert entry["recommended_action"] == "stage"
