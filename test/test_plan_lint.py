from __future__ import annotations

import importlib.machinery
import importlib.util
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "pi" / "scripts" / "plan-lint"


def load_plan_lint() -> ModuleType:
    loader = importlib.machinery.SourceFileLoader("plan_lint", str(SCRIPT))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[loader.name] = module
    loader.exec_module(module)
    return module


@pytest.fixture
def plan_lint() -> ModuleType:
    return load_plan_lint()


@pytest.fixture
def git_repo(tmp_path: Path) -> tuple[Path, str]:
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "config", "user.name", "Plan Test"], check=True)
    subprocess.run(
        ["git", "-C", str(tmp_path), "config", "user.email", "plan-test@example.invalid"],
        check=True,
    )
    marker = tmp_path / "marker.txt"
    marker.write_text("fixture\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(tmp_path), "add", "marker.txt"], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "commit", "-q", "-m", "test: fixture"], check=True)
    commit = subprocess.run(
        ["git", "-C", str(tmp_path), "rev-parse", "--short=12", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    return tmp_path, commit


def write_plan(repo: Path, text: str) -> Path:
    path = repo / ".specs" / "fixture" / "plan.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def plan_text(task: str, classification: str = "in progress", blocker: str = "none") -> str:
    return (
        "# Fixture\n\n## Execution status\n\n### Task checklist\n\n"
        f"{task}\n\n### State\n\n"
        f"- **Classification:** {classification}\n"
        f"- **Current blocker:** {blocker}\n"
    )


def codes(violations: list[object]) -> set[str]:
    return {violation.code for violation in violations}


def test_clean_plan_passes_with_existing_commit(
    plan_lint: ModuleType, git_repo: tuple[Path, str]
) -> None:
    repo, commit = git_repo
    path = write_plan(repo, plan_text(f"- [x] T1: fixture - done: `{commit}`"))

    violations, report_state = plan_lint.lint_plan(path, repo)

    assert violations == []
    assert report_state == "CHECKPOINT"


@pytest.mark.parametrize(
    ("task", "expected"),
    [
        ("- [x] T1: fixture - done", "checked-task-commit"),
        ("- [x] T1: fixture - done: `deadbee`", "checked-task-commit"),
        ("- [ ] T1: fixture - in-progress:", "in-progress-next-step"),
    ],
)
def test_task_violations_are_named(
    plan_lint: ModuleType,
    git_repo: tuple[Path, str],
    task: str,
    expected: str,
) -> None:
    repo, _commit = git_repo
    path = write_plan(repo, plan_text(task))

    violations, _report_state = plan_lint.lint_plan(path, repo)

    assert expected in codes(violations)


def test_state_mismatch_catches_blocked_none_and_completed_unchecked(
    plan_lint: ModuleType, git_repo: tuple[Path, str]
) -> None:
    repo, _commit = git_repo
    blocked = write_plan(repo, plan_text("- [ ] T1: fixture - pending", "blocked", "none"))
    blocked_violations, _ = plan_lint.lint_plan(blocked, repo)
    completed = write_plan(repo, plan_text("- [ ] T1: fixture - pending", "complete", "none"))
    completed_violations, _ = plan_lint.lint_plan(completed, repo)

    assert "state-checklist-mismatch" in codes(blocked_violations)
    assert "state-checklist-mismatch" in codes(completed_violations)


def test_report_claim_must_match_plan_state(
    plan_lint: ModuleType, git_repo: tuple[Path, str]
) -> None:
    repo, _commit = git_repo
    path = write_plan(repo, plan_text("- [ ] T1: fixture - pending"))
    report = repo / "report.md"
    report.write_text(
        "COMPLETE: incorrectly complete\n\nFINAL STATUS: COMPLETE -- archived.\n",
        encoding="utf-8",
    )

    violations, report_state = plan_lint.lint_plan(path, repo, report)

    assert report_state == "CHECKPOINT"
    assert "report-state" in codes(violations)


def test_cli_passes_clean_plan_and_reports_canonical_state(git_repo: tuple[Path, str]) -> None:
    repo, commit = git_repo
    path = write_plan(repo, plan_text(f"- [x] T1: fixture - done: `{commit}`"))

    result = subprocess.run(
        ["python", str(SCRIPT), str(path), "--repo", str(repo)],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0
    assert "PLAN_LINT_OK" in result.stdout
    assert "report_state=CHECKPOINT" in result.stdout


def test_archived_phase2_exposes_the_known_close_commit_debt() -> None:
    phase2 = ROOT / ".specs" / "archive" / "rationalization-phase2" / "plan.md"

    result = subprocess.run(
        ["python", str(SCRIPT), str(phase2), "--repo", str(ROOT)],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 1
    assert "checked-task-commit" in result.stdout
    assert "T14 is checked without done: <commit>" in result.stdout
