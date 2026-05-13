from __future__ import annotations

import importlib.util
import re
import subprocess
from pathlib import Path
from types import ModuleType

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "test.yml"
PATH_NORMALIZATION_HOOK = (
    ROOT / "claude" / "hooks" / "path-normalization" / "path-normalization-hook.py"
)

CI_DIRECT_EXECUTABLES = (
    "scripts/ci-bootstrap",
    "scripts/git-hooks/pre-commit-dolos",
    "scripts/install-dolos-hook",
)

REQUIRED_WORKFLOW_PATHS = (
    ".github/workflows/test.yml",
    "Makefile",
    "scripts/ci-bootstrap",
)

SCRIPT_RUN_RE = re.compile(r"(?:^|&&|;)\s*(scripts/[\w./-]+)(?:\s|$)")


def git_mode(path: str) -> str:
    proc = subprocess.run(
        ["git", "ls-files", "-s", "--", path],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    assert proc.stdout.strip(), f"{path} is not tracked by git"
    return proc.stdout.split()[0]


def load_path_hook() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "path_normalization_hook", PATH_NORMALIZATION_HOOK
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def workflow_run_commands() -> list[str]:
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    commands: list[str] = []
    for job in workflow["jobs"].values():
        for step in job.get("steps", []):
            run = step.get("run")
            if isinstance(run, str):
                commands.append(run)
    return commands


def test_ci_invoked_scripts_are_tracked_executable() -> None:
    for path in CI_DIRECT_EXECUTABLES:
        mode = git_mode(path)
        assert mode == "100755", (
            f"{path} must be tracked as 100755 because CI or git hooks invoke it "
            f"directly; got {mode}. Run: git update-index --chmod=+x {path}"
        )


def test_workflow_references_existing_paths() -> None:
    for path in REQUIRED_WORKFLOW_PATHS:
        assert (ROOT / path).exists(), f"GitHub Actions expects {path} to exist"


def test_workflow_direct_script_runs_are_executable() -> None:
    for command in workflow_run_commands():
        for match in SCRIPT_RUN_RE.finditer(command):
            path = match.group(1)
            if not (ROOT / path).exists():
                continue
            mode = git_mode(path)
            assert mode == "100755", (
                f"Workflow runs {path} directly, so it must be tracked executable; "
                f"got {mode}. Either chmod it in git or invoke it via bash/python."
            )


def test_no_npm_package_lock() -> None:
    assert not (ROOT / "package-lock.json").exists(), (
        "Use bun or pnpm per repo policy; do not commit package-lock.json"
    )


def test_path_hook_treats_windows_drive_as_absolute_on_any_host() -> None:
    hook = load_path_hook()
    assert hook.is_absolute("C:/Users/me/project/file.py")
    assert hook.is_absolute(r"C:\Users\me\project\file.py")


def test_path_hook_treats_msys_wsl_cygwin_paths_as_absolute_on_any_host() -> None:
    hook = load_path_hook()
    assert hook.is_absolute("/c/Users/me/project/file.py")
    assert hook.is_absolute("/mnt/c/Users/me/project/file.py")
    assert hook.is_absolute("/cygdrive/c/Users/me/project/file.py")


def test_path_hook_compares_windows_paths_without_unix_resolving_them() -> None:
    hook = load_path_hook()
    child = Path("C:/Projects/example/src/file.py")
    parent = Path("C:/Projects/example")
    assert hook.is_within(child, parent)
    assert hook._relative_to_string(child, parent) == "src/file.py"


def test_path_hook_tmp_paths_are_not_blanket_allowed_when_project_or_home_is_mocked(
    monkeypatch,
) -> None:
    hook = load_path_hook()
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", "/tmp/project")
    assert hook._handle_unix_system("Edit", "/tmp/project/src/file.py") is None

    monkeypatch.delenv("CLAUDE_PROJECT_DIR")
    monkeypatch.setenv("USERPROFILE", "/tmp/home")
    assert hook._handle_unix_system("Edit", "/tmp/home/.claude/logs/session.log") is None
