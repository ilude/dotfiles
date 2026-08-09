from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BASHRC = ROOT / "home" / ".bashrc"
ZSH_PROMPT = ROOT / "zsh" / "rc.d" / "05-prompt.zsh"
OUTPUT_MARKER = "__PROMPT_TEST__"
IS_WSL = Path("/proc/sys/fs/binfmt_misc/WSLInterop").is_file()


def _find_bash() -> str | None:
    if os.name == "nt":
        candidates = [
            Path(os.environ.get("PROGRAMFILES", "")) / "Git" / "bin" / "bash.exe",
            Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Git" / "bin" / "bash.exe",
        ]
        for candidate in candidates:
            if candidate.is_file():
                return str(candidate)
        return None
    return shutil.which("bash")


BASH = _find_bash()


def _shell_path(path: Path, shell: str) -> str:
    if os.name != "nt":
        return path.as_posix()
    command_flag = "-dfc" if Path(shell).name.lower().startswith("zsh") else "-c"
    result = subprocess.run(
        [shell, command_flag, '/usr/bin/cygpath -u "$1"', "shell", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _shell_env(home: Path, shell: str) -> dict[str, str]:
    env = {
        **os.environ,
        "HOME": _shell_path(home, shell),
        "USERPROFILE": str(home),
    }
    env.pop("ZDOTDIR", None)
    return env


def _run_bash_prompt(home: Path, cwd: Path) -> str:
    assert BASH is not None
    command = f'source "$1"; cd -- "$2"; __set_prompt; printf "{OUTPUT_MARKER}%s\\n" "$PS1"'
    result = subprocess.run(
        [
            BASH,
            "--noprofile",
            "--norc",
            "-ic",
            command,
            "prompt-test",
            _shell_path(BASHRC, BASH),
            _shell_path(cwd, BASH),
        ],
        cwd=ROOT,
        env=_shell_env(home, BASH),
        check=True,
        capture_output=True,
        text=True,
    )
    prompts = [
        line.removeprefix(OUTPUT_MARKER)
        for line in result.stdout.splitlines()
        if line.startswith(OUTPUT_MARKER)
    ]
    assert len(prompts) == 1, result.stdout + result.stderr
    return prompts[0]


def _run_bash_prompt_for_pwd(home: Path, pwd: str, user: str) -> str:
    assert BASH is not None
    command = (
        f'source "$1"; PWD="$2"; USER="$3"; __set_prompt; printf "{OUTPUT_MARKER}%s\\n" "$PS1"'
    )
    result = subprocess.run(
        [
            BASH,
            "--noprofile",
            "--norc",
            "-ic",
            command,
            "prompt-test",
            _shell_path(BASHRC, BASH),
            pwd,
            user,
        ],
        cwd=home,
        env=_shell_env(home, BASH),
        check=True,
        capture_output=True,
        text=True,
    )
    prompt = result.stdout.split(OUTPUT_MARKER, 1)
    assert len(prompt) == 2, result.stdout + result.stderr
    return prompt[1].splitlines()[0]


def _init_branch(repo: Path, home: Path, branch: str) -> None:
    env = {**os.environ, "HOME": str(home), "USERPROFILE": str(home)}
    subprocess.run(["git", "init"], cwd=repo, env=env, check=True, capture_output=True)
    subprocess.run(
        ["git", "symbolic-ref", "HEAD", f"refs/heads/{branch}"],
        cwd=repo,
        env=env,
        check=True,
        capture_output=True,
    )


@pytest.mark.skipif(BASH is None or IS_WSL, reason="non-WSL bash required")
def test_bash_prompt_normalizes_isolated_home_paths(tmp_path: Path) -> None:
    home = tmp_path / "Mike Smith"
    nested = home / "work" / "client projects" / "web app"
    nested.mkdir(parents=True)

    assert _run_bash_prompt(home, home) == r"\[\e[32m\]~\[\e[0m\]> "
    assert _run_bash_prompt(home, nested) == (
        r"\[\e[32m\]~/work/client projects/web app\[\e[0m\]> "
    )


@pytest.mark.skipif(BASH is None, reason="bash not found")
def test_bash_prompt_keeps_paths_outside_home(tmp_path: Path) -> None:
    home = tmp_path / "home"
    outside = tmp_path / "my project"
    home.mkdir()
    outside.mkdir()

    prompt = _run_bash_prompt(home, outside)

    assert prompt == rf"\[\e[32m\]{_shell_path(outside, BASH)}\[\e[0m\]> "


@pytest.mark.skipif(BASH is None or not IS_WSL, reason="WSL bash required")
def test_bash_prompt_normalizes_windows_home_case_insensitively_on_wsl(
    tmp_path: Path,
) -> None:
    home = tmp_path / "isolated-home"
    home.mkdir()

    windows_prompt = _run_bash_prompt_for_pwd(
        home,
        "/mnt/c/USERS/Mike Smith/projects",
        "Mike Smith",
    )
    linux_prompt = _run_bash_prompt_for_pwd(
        home,
        "/home/testuser/projects",
        "Mike Smith",
    )

    assert windows_prompt == r"\[\e[32m\]~/projects\[\e[0m\]> "
    assert linux_prompt == r"\[\e[32m\]/home/testuser/projects\[\e[0m\]> "


@pytest.mark.skipif(BASH is None, reason="bash not found")
def test_bash_prompt_reports_the_current_git_branch(tmp_path: Path) -> None:
    home = tmp_path / "home"
    repo = home / "repo"
    repo.mkdir(parents=True)
    _init_branch(repo, home, "prompt-test")

    prompt = _run_bash_prompt(home, repo)

    path = _shell_path(repo, BASH) if IS_WSL else "~/repo"
    assert prompt == (
        rf"\[\e[32m\]{path}\[\e[0m\]"
        r"\[\e[33m\][\[\e[36m\]prompt-test\[\e[33m\]]\[\e[0m\]> "
    )


@pytest.mark.zsh
@pytest.mark.skipif(IS_WSL, reason="ZDOTDIR normalization is a non-WSL contract")
def test_zsh_prompt_uses_zdotdir_for_path_normalization(tmp_path: Path) -> None:
    zsh = os.environ.get("ZSH_EXECUTABLE") or shutil.which("zsh")
    assert zsh, "zsh is required to validate shell configuration"
    home = tmp_path / "home with space"
    nested = home / "projects" / "web app"
    nested.mkdir(parents=True)
    command = f'cd -- "$1"; source "$2"; printf "{OUTPUT_MARKER}%s\\n" "$(__prompt_path)"'
    env = _shell_env(home, zsh)
    env["HOME"] = _shell_path(tmp_path / "different-home", zsh)
    env["ZDOTDIR"] = _shell_path(home, zsh)

    result = subprocess.run(
        [
            zsh,
            "-dfc",
            command,
            "prompt-test",
            _shell_path(nested, zsh),
            _shell_path(ZSH_PROMPT, zsh),
        ],
        cwd=ROOT,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout == f"{OUTPUT_MARKER}~/projects/web app\n"


@pytest.mark.zsh
def test_zsh_prompt_reports_the_current_git_branch(tmp_path: Path) -> None:
    zsh = os.environ.get("ZSH_EXECUTABLE") or shutil.which("zsh")
    assert zsh, "zsh is required to validate shell configuration"
    home = tmp_path / "home"
    repo = home / "repo"
    repo.mkdir(parents=True)
    _init_branch(repo, home, "prompt-test")
    command = f'cd -- "$1"; source "$2"; printf "{OUTPUT_MARKER}%s\\n" "$(__git_prompt)"'

    result = subprocess.run(
        [
            zsh,
            "-dfc",
            command,
            "prompt-test",
            _shell_path(repo, zsh),
            _shell_path(ZSH_PROMPT, zsh),
        ],
        cwd=ROOT,
        env=_shell_env(home, zsh),
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout == (f"{OUTPUT_MARKER}%F{{yellow}}[%F{{cyan}}prompt-test%F{{yellow}}]%f\n")
