from __future__ import annotations

import importlib.util
import shlex
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


def workflow_steps() -> list[dict]:
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    return [step for job in workflow["jobs"].values() for step in job.get("steps", [])]


def shell_commands(command: str) -> list[list[str]]:
    lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|")
    lexer.whitespace_split = True
    commands: list[list[str]] = [[]]
    for token in lexer:
        if token in {";", "&&", "||", "|"}:
            if commands[-1]:
                commands.append([])
            continue
        commands[-1].append(token)
    return [segment for segment in commands if segment]


def workflow_referenced_paths() -> set[str]:
    paths = {str(WORKFLOW.relative_to(ROOT)).replace("\\", "/")}
    for step in workflow_steps():
        uses = step.get("uses")
        if isinstance(uses, str) and uses.startswith("./"):
            paths.add(uses[2:])
        run = step.get("run")
        if not isinstance(run, str):
            continue
        for command in shell_commands(run):
            executable = command[0].removeprefix("./")
            if executable.startswith("scripts/"):
                paths.add(executable)
            if executable == "make":
                paths.add("Makefile")
    return paths


def make_dry_run(target: str, *variables: str) -> str:
    proc = subprocess.run(
        ["make", "-n", *variables, target],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return proc.stdout


def package_lock_guard_roots() -> set[Path]:
    proc = subprocess.run(
        ["git", "ls-files", "--", "*pnpm-lock.yaml"],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return {ROOT, *((ROOT / path).parent for path in proc.stdout.splitlines())}


def test_ci_invoked_scripts_are_tracked_executable() -> None:
    for path in CI_DIRECT_EXECUTABLES:
        mode = git_mode(path)
        assert mode == "100755", (
            f"{path} must be tracked as 100755 because CI or git hooks invoke it "
            f"directly; got {mode}. Run: git update-index --chmod=+x {path}"
        )


def test_workflow_references_existing_paths() -> None:
    for path in workflow_referenced_paths():
        assert (ROOT / path).exists(), f"GitHub Actions expects {path} to exist"


def test_workflow_direct_script_runs_are_executable() -> None:
    scripts = {
        command[0].removeprefix("./")
        for step in workflow_steps()
        if isinstance(step.get("run"), str)
        for command in shell_commands(step["run"])
        if command[0].removeprefix("./").startswith("scripts/")
    }
    for path in scripts:
        mode = git_mode(path)
        assert mode == "100755", (
            f"Workflow runs {path} directly, so it must be tracked executable; "
            f"got {mode}. Either chmod it in git or invoke it via bash/python."
        )


def test_workflow_provisions_zsh_for_shell_runtime_contract() -> None:
    steps = {step.get("name"): step for step in workflow_steps()}

    linux_install = steps["Install dependencies (Linux)"]
    assert "zsh" in shlex.split(linux_install["run"])

    windows_install = steps["Install zsh (Windows)"]
    assert windows_install["if"] == "runner.os == 'Windows'"
    assert windows_install["uses"] == "msys2/setup-msys2@v2.32.0"
    assert "zsh" in windows_install["with"]["install"].split()

    windows_export = steps["Export zsh executable (Windows)"]
    assert windows_export["if"] == "runner.os == 'Windows'"
    assert "ZSH_EXECUTABLE=" in windows_export["run"]
    assert "msys2-location" in windows_export["run"]

    verify = steps["Verify zsh dependency"]
    assert verify["run"] == '"${ZSH_EXECUTABLE:-zsh}" --version'


def test_make_quality_targets_have_distinct_nonduplicated_scopes() -> None:
    changed = make_dry_run("check-changed", "FILES=scripts/quality-check")
    fast = make_dry_run("check-fast")
    full = make_dry_run("check")

    assert changed.count("scripts/quality-check scripts/quality-check") == 1
    assert "uv run pytest" not in changed
    assert "uv run ruff check" not in changed

    assert fast.count("uv run ruff check") == 1
    assert fast.count("shellcheck --severity=warning") == 1
    assert "uv run pytest" not in fast
    assert "pnpm run typecheck" not in fast

    assert full.count("uv run ruff check") == 1
    assert full.count("shellcheck --severity=warning") == 1
    assert full.count("uv run pytest test/") == 1
    assert full.count("cd pi && pnpm run typecheck") == 1
    assert full.count("cd pi && pnpm test") == 1


def test_no_npm_package_lock() -> None:
    unexpected = [
        root / "package-lock.json"
        for root in package_lock_guard_roots()
        if (root / "package-lock.json").exists()
    ]
    assert not unexpected, f"Use each package root's owned lockfile; remove: {unexpected}"


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
