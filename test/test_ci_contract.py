from __future__ import annotations

import importlib.util
import os
import shlex
import shutil
import subprocess
from pathlib import Path
from types import ModuleType

import pytest
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


def package_lock_guard_roots() -> set[Path]:
    proc = subprocess.run(
        ["git", "ls-files", "--", "*pnpm-lock.yaml"],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return {ROOT, *((ROOT / path).parent for path in proc.stdout.splitlines())}


@pytest.mark.parametrize(
    ("resolver_status", "install_status", "expected_version"),
    [(0, 0, "9.8.7"), (1, 0, "latest"), (0, 1, "9.8.7")],
)
def test_pi_ci_installs_runtime_before_bounded_default_stage(
    tmp_path: Path, resolver_status: int, install_status: int, expected_version: str
) -> None:
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    job = workflow["jobs"]["pi-default"]
    assert job["env"]["HOME"] == "${{ runner.temp }}/pi-ci-home"
    assert job["env"]["USERPROFILE"] == job["env"]["HOME"]
    # Execute actual workflow commands. Only resolver/package-manager, downstream
    # stage and verification boundaries are fakes, not install orchestration.
    # A missing bootstrap must fail even if a Pi executable is already on PATH.
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    fakes = {
        "uv": 'if [[ "$*" == "run python scripts/get_latest_agent_version.py pi" ]]; then\n'
        '  printf "resolver %s\\n" "$*" >> "$EVENTS"\n'
        '  printf "9.8.7\\n"\n  exit "$RESOLVER_STATUS"\n'
        'fi\nprintf "verify %s\\n" "$*" >> "$EVENTS"\n',
        "pnpm": 'printf "pnpm %s\\n" "$*" >> "$EVENTS"\n'
        'if [ "$INSTALL_STATUS" != 0 ]; then exit "$INSTALL_STATUS"; fi\n'
        'touch "$RUNTIME_INSTALLED"\n',
        "pi": 'printf "pi %s\\n" "$*" >> "$EVENTS"\n',
    }
    for name, body in fakes.items():
        executable = bin_dir / name
        executable.write_bytes(("#!/usr/bin/env bash\n" + body).encode("utf-8"))
        executable.chmod(0o755)
    (scripts / "pi-default-setup").write_bytes(
        b'set -e\ntest -f "$RUNTIME_INSTALLED"\n'
        b'profile="$USERPROFILE"; home="$HOME"\n'
        b"if command -v cygpath >/dev/null 2>&1; then\n"
        b'profile=$(cygpath -m "$profile"); home=$(cygpath -m "$home"); fi\n'
        b'test "$profile" = "$home"\n'
        b'test "$npm_config_global_dir" = "$home/pnpm/global"\n'
        b'printf "stage\\n" >> "$EVENTS"\n'
    )
    home = tmp_path / "home"
    env_file = tmp_path / "github-env"
    path_file = tmp_path / "github-path"
    events = tmp_path / "events"
    env = {
        **os.environ,
        "HOME": home.as_posix(),
        "USERPROFILE": home.as_posix(),
        "GITHUB_ENV": env_file.as_posix(),
        "GITHUB_PATH": path_file.as_posix(),
        "EVENTS": events.as_posix(),
        "RUNTIME_INSTALLED": (tmp_path / "installed").as_posix(),
        "RESOLVER_STATUS": str(resolver_status),
        "INSTALL_STATUS": str(install_status),
        "FAKE_BIN": bin_dir.as_posix(),
    }
    bash = shutil.which("bash")
    if os.name == "nt":
        git_bash = Path(os.environ.get("PROGRAMFILES", "C:/Program Files")) / "Git/bin/bash.exe"
        if git_bash.exists():
            bash = str(git_bash)
    assert bash is not None, "CI runtime bootstrap contract requires bash"
    results = []
    for step in job["steps"]:
        if step.get("shell") != "bash" or "run" not in step:
            continue
        proc = subprocess.run(
            [
                bash,
                "-e",
                "-c",
                'bin="$FAKE_BIN"; if command -v cygpath >/dev/null 2>&1; then '
                'bin=$(cygpath -u "$bin"); fi; export PATH="$bin:$PATH"\n' + step["run"],
            ],
            cwd=tmp_path,
            env=env,
            text=True,
            capture_output=True,
        )
        results.append(proc)
        if proc.returncode:
            break
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                key, value = line.split("=", 1)
                env[key] = value
    log = events.read_text(encoding="utf-8").splitlines() if events.exists() else []
    assert log[:2] == [
        "resolver run python scripts/get_latest_agent_version.py pi",
        "pnpm --config.minimumReleaseAge=720 add -g --allow-build=koffi "
        f"--allow-build=protobufjs @earendil-works/pi-coding-agent@{expected_version}",
    ], [(proc.stdout, proc.stderr) for proc in results]
    if install_status:
        assert results[-1].returncode != 0
        assert "stage" not in log
    else:
        assert all(proc.returncode == 0 for proc in results), [proc.stderr for proc in results]
        assert log[2:] == [
            "pi --version",
            "stage",
            "pnpm --dir pi/profiles/default run typecheck",
            "pnpm --dir pi/profiles/default test",
            "verify run pytest test/test_pi_profile_setup.py test/test_pi_default_link.py "
            "test/test_pi_setup_smoke.py test/test_install_unattended.py",
        ]
        assert path_file.read_text(encoding="utf-8").splitlines() == [f"{home.as_posix()}/pnpm"]
    # Offline smoke belongs to the bounded stage, not a second CI invocation.
    assert not any("pi-setup-smoke.mjs" in step.get("run", "") for step in job["steps"])


def test_windows_ci_runs_installer_maintenance_pester_suite() -> None:
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    steps = workflow["jobs"]["pi-default"]["steps"]
    assert any(
        step.get("if") == "runner.os == 'Windows'"
        and "Pester" in step.get("name", "")
        and "Install-Module Pester -RequiredVersion 4.10.1" in step.get("run", "")
        for step in steps
    )
    assert any(
        step.get("if") == "runner.os == 'Windows'"
        and "install-maintenance.tests.ps1" in step.get("run", "")
        for step in steps
    )


def test_preflight_checks_configured_shell_scripts(tmp_path: Path) -> None:
    if shutil.which("file") is None:
        pytest.skip("file is unavailable, so preflight skips CRLF detection")

    script = tmp_path / "crlf-script.sh"
    script.write_bytes(b"#!/bin/sh\r\necho test\r\n")
    proc = subprocess.run(
        ["make", "preflight", f"SHELL_SCRIPTS={script.as_posix()}"],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )

    assert proc.returncode != 0
    assert "CRLF line endings detected" in proc.stdout


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
