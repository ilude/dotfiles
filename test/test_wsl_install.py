"""Executable contracts for the WSL installer entrypoint."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

DOTFILES = Path(__file__).parent.parent


def _wsl_install_layout(tmp_path: Path, with_dotbot: bool = False) -> Path:
    """Create the repository layout required before the installer can run Dotbot."""
    repo = tmp_path / "repo"
    install_dir = repo / "wsl"
    install_dir.mkdir(parents=True)
    installer = install_dir / "install"
    shutil.copy2(DOTFILES / "wsl" / "install", installer)
    (install_dir / "install.conf.yaml").write_text("[]\n", encoding="utf-8")

    if with_dotbot:
        dotbot = repo / "dotbot" / "bin" / "dotbot"
        dotbot.parent.mkdir(parents=True)
        dotbot.write_text("", encoding="utf-8")

    return installer


def _run_installer(
    installer: Path, tmp_path: Path, environment: dict[str, str]
) -> subprocess.CompletedProcess[str]:
    bash = shutil.which("bash")
    if bash is None:
        pytest.skip("bash is required to test the WSL installer")

    working_directory = tmp_path / "unrelated"
    working_directory.mkdir()
    return subprocess.run(
        [bash, str(installer)],
        cwd=working_directory,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )


def test_wsl_install_fails_when_its_owned_dotbot_is_missing(tmp_path: Path) -> None:
    """The entrypoint uses its own repository and requires its Dotbot submodule."""
    installer = _wsl_install_layout(tmp_path)
    environment = {**os.environ, "HOME": str(tmp_path / "home")}

    result = _run_installer(installer, tmp_path, environment)

    assert result.returncode != 0
    assert "Error: Dotbot is unavailable" in result.stdout


def test_wsl_install_fails_clearly_when_python_is_missing(tmp_path: Path) -> None:
    """Dotbot cannot run without an explicitly resolved Python interpreter."""
    installer = _wsl_install_layout(tmp_path, with_dotbot=True)
    bash_environment = tmp_path / "without-python.bash"
    bash_environment.write_text(
        """command() {
    if [[ \"$1\" == \"-v\" && ( \"$2\" == \"python3\" || \"$2\" == \"python\" ) ]]; then
        return 1
    fi
    builtin command \"$@\"
}
""",
        encoding="utf-8",
    )
    environment = {
        **os.environ,
        "BASH_ENV": str(bash_environment),
        "HOME": str(tmp_path / "home"),
    }

    result = _run_installer(installer, tmp_path, environment)

    assert result.returncode != 0
    assert "Error: Python not found" in result.stdout
