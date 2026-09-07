import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

DOTFILES = Path(__file__).parent.parent
BASH = shutil.which("bash")
PWSH = shutil.which("pwsh")
NODE = shutil.which("node")


def _fake_pi_bash(bin_dir: Path) -> None:
    executable = bin_dir / "pi"
    executable.write_text(
        "#!/usr/bin/env bash\n"
        "python3 -c 'import json, os, sys; "
        'print(json.dumps({"dir": os.environ.get("PI_CODING_AGENT_DIR"), '
        '"args": sys.argv[1:]}))\' "$@"\n',
        encoding="utf-8",
    )
    executable.chmod(0o755)


def _fake_pi_powershell(bin_dir: Path) -> None:
    (bin_dir / "pi.ps1").write_text(
        "[pscustomobject]@{ dir = $env:PI_CODING_AGENT_DIR; "
        "args = @($args) } | ConvertTo-Json -Compress\n"
        "exit 0\n",
        encoding="utf-8",
    )


def _recovery_launcher_repository(tmp_path: Path, launcher_name: str) -> Path:
    repository = tmp_path / "launcher repository"
    scripts = repository / "scripts"
    default_profile = repository / "pi" / "profiles" / "default"
    legacy_profile = repository / "pi" / "profiles" / "legacy"
    scripts.mkdir(parents=True)
    default_profile.mkdir(parents=True)
    legacy_profile.mkdir(parents=True)
    launcher = scripts / launcher_name
    shutil.copy2(DOTFILES / "scripts" / launcher_name, launcher)
    shutil.copy2(
        DOTFILES / "scripts" / "pi-damage-control-preflight.mjs",
        scripts / "pi-damage-control-preflight.mjs",
    )
    shutil.copy2(
        DOTFILES / "scripts" / "pi-damage-control-recovery.js",
        scripts / "pi-damage-control-recovery.js",
    )
    if launcher_name == "pp":
        launcher.chmod(0o755)
    return repository


def _write_valid_bootstrap(repository: Path) -> Path:
    bootstrap = (
        repository / "pi" / "profiles" / "default" / "extensions" / "damage-control" / "index.js"
    )
    bootstrap.parent.mkdir(parents=True, exist_ok=True)
    bootstrap.write_text("export default function damageControl() {}\n", encoding="utf-8")
    return bootstrap


@pytest.mark.skipif(BASH is None, reason="bash not found")
def test_pp_uses_default_bash_profile(tmp_path: Path) -> None:
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_bash(bin_dir)

    result = subprocess.run(
        [BASH, str(DOTFILES / "scripts" / "pp")],
        env={**os.environ, "HOME": str(home), "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert Path(json.loads(result.stdout)["dir"]) == DOTFILES / "pi" / "profiles" / "default"


@pytest.mark.skipif(BASH is None, reason="bash not found")
@pytest.mark.parametrize("option", ["-p", "--profile"])
def test_pp_selects_bash_profile_and_forwards_arguments(tmp_path: Path, option: str) -> None:
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_bash(bin_dir)

    result = subprocess.run(
        [BASH, str(DOTFILES / "scripts" / "pp"), option, "clean", "--model", "example"],
        env={**os.environ, "HOME": str(home), "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert Path(payload["dir"]) == home / ".pi" / "profiles" / "clean"
    assert payload["args"] == ["--model", "example"]
    assert (home / ".pi" / "profiles" / "clean").is_dir()


@pytest.mark.skipif(BASH is None, reason="bash not found")
def test_pp_passes_pi_short_print_option_after_separator(tmp_path: Path) -> None:
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_bash(bin_dir)

    result = subprocess.run(
        [BASH, str(DOTFILES / "scripts" / "pp"), "--profile=clean", "--", "-p", "hello"],
        env={**os.environ, "HOME": str(home), "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["args"] == ["-p", "hello"]


@pytest.mark.skipif(PWSH is None, reason="PowerShell not found")
def test_pp_selects_powershell_profile_and_forwards_arguments(tmp_path: Path) -> None:
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_powershell(bin_dir)

    result = subprocess.run(
        [
            PWSH,
            "-NoProfile",
            "-File",
            str(DOTFILES / "scripts" / "pp.ps1"),
            "--profile",
            "legacy",
            "--model",
            "example",
        ],
        env={
            **os.environ,
            "USERPROFILE": str(home),
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        },
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert Path(payload["dir"]) == DOTFILES / "pi" / "profiles" / "legacy"
    assert payload["args"] == ["--model", "example"]


@pytest.mark.skipif(NODE is None, reason="node not found")
def test_damage_control_preflight_checks_existence_and_javascript_syntax(
    tmp_path: Path,
) -> None:
    preflight = DOTFILES / "scripts" / "pi-damage-control-preflight.mjs"
    valid = tmp_path / "path with spaces" / "index.js"
    valid.parent.mkdir()
    valid.write_text("export default function fixture() {}\n", encoding="utf-8")

    result = subprocess.run([NODE, str(preflight), str(valid)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert result.stdout == ""

    valid.write_text("export default {\n", encoding="utf-8")
    malformed = subprocess.run([NODE, str(preflight), str(valid)], capture_output=True, text=True)
    assert malformed.returncode == 1
    assert "invalid JavaScript syntax" in malformed.stderr

    missing = subprocess.run(
        [NODE, str(preflight), str(tmp_path / "missing.js")],
        capture_output=True,
        text=True,
    )
    assert missing.returncode == 1
    assert "bootstrap is unavailable" in missing.stderr


@pytest.mark.skipif(BASH is None or NODE is None, reason="bash or node not found")
def test_recovery_launcher_fixture_keeps_normal_default_launch_unchanged(
    tmp_path: Path,
) -> None:
    repository = _recovery_launcher_repository(tmp_path, "pp")
    _write_valid_bootstrap(repository)
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_bash(bin_dir)

    result = subprocess.run(
        [
            BASH,
            str(repository / "scripts" / "pp"),
            "--resume",
            "session-123",
            "--model",
            "example",
        ],
        env={
            **os.environ,
            "HOME": str(home),
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        },
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["args"] == [
        "--session",
        "session-123",
        "--model",
        "example",
    ]
    assert result.stderr == ""


@pytest.mark.skipif(BASH is None or NODE is None, reason="bash or node not found")
def test_recovery_launcher_fixture_preserves_arbitrary_profiles_and_passthrough(
    tmp_path: Path,
) -> None:
    repository = _recovery_launcher_repository(tmp_path, "pp")
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_bash(bin_dir)

    result = subprocess.run(
        [
            BASH,
            str(repository / "scripts" / "pp"),
            "--profile=clean",
            "--",
            "-p",
            "hello",
        ],
        env={
            **os.environ,
            "HOME": str(home),
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        },
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert Path(payload["dir"]) == home / ".pi" / "profiles" / "clean"
    assert payload["args"] == ["-p", "hello"]
    assert result.stderr == ""


@pytest.mark.skipif(BASH is None or NODE is None, reason="bash or node not found")
@pytest.mark.parametrize("bootstrap_state", ["missing", "malformed"])
def test_recovery_launcher_fixture_fails_to_tools_and_extensions_disabled_mode(
    tmp_path: Path, bootstrap_state: str
) -> None:
    repository = _recovery_launcher_repository(tmp_path, "pp")
    if bootstrap_state == "malformed":
        _write_valid_bootstrap(repository).write_text("export default {\n", encoding="utf-8")
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_bash(bin_dir)

    result = subprocess.run(
        [
            BASH,
            str(repository / "scripts" / "pp"),
            "--session=repair-session",
            "--tools",
            "bash,write",
            "--extension=untrusted.js",
            "--model",
            "example",
        ],
        env={
            **os.environ,
            "HOME": str(home),
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        },
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["args"] == [
        "--no-tools",
        "--no-extensions",
        "--session",
        "repair-session",
        "--model",
        "example",
    ]
    assert "tools-disabled, extensions-disabled repair mode" in result.stderr
    assert "recovery is never selected automatically" in result.stderr


@pytest.mark.skipif(BASH is None or NODE is None, reason="bash or node not found")
def test_recovery_launcher_fixture_requires_explicit_default_recovery_before_separator(
    tmp_path: Path,
) -> None:
    repository = _recovery_launcher_repository(tmp_path, "pp")
    _write_valid_bootstrap(repository)
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_bash(bin_dir)
    environment = {
        **os.environ,
        "HOME": str(home),
        "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
    }

    recovery = subprocess.run(
        [
            BASH,
            str(repository / "scripts" / "pp"),
            "--dc-recovery",
            "--resume",
            "session-456",
            "-e",
            "untrusted.js",
            "--tools",
            "read,write",
            "--model",
            "example",
        ],
        env=environment,
        capture_output=True,
        text=True,
    )
    assert recovery.returncode == 0, recovery.stderr
    recovery_args = json.loads(recovery.stdout)["args"]
    assert recovery_args[:2] == ["--no-extensions", "--extension"]
    assert Path(recovery_args[2]) == (repository / "scripts" / "pi-damage-control-recovery.js")
    assert recovery_args[3:] == [
        "--session",
        "session-456",
        "--tools",
        "read,write",
        "--model",
        "example",
    ]

    after_separator = subprocess.run(
        [BASH, str(repository / "scripts" / "pp"), "--", "--dc-recovery"],
        env=environment,
        capture_output=True,
        text=True,
    )
    assert after_separator.returncode == 0, after_separator.stderr
    assert json.loads(after_separator.stdout)["args"] == ["--dc-recovery"]

    wrong_profile = subprocess.run(
        [
            BASH,
            str(repository / "scripts" / "pp"),
            "--profile",
            "legacy",
            "--dc-recovery",
        ],
        env=environment,
        capture_output=True,
        text=True,
    )
    assert wrong_profile.returncode == 2
    assert "only for the default profile" in wrong_profile.stderr


@pytest.mark.skipif(BASH is None or NODE is None, reason="bash or node not found")
def test_recovery_launcher_fixture_never_bypasses_a_malformed_recovery_helper(
    tmp_path: Path,
) -> None:
    repository = _recovery_launcher_repository(tmp_path, "pp")
    _write_valid_bootstrap(repository)
    (repository / "scripts" / "pi-damage-control-recovery.js").write_text(
        "export default {\n", encoding="utf-8"
    )
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_bash(bin_dir)

    result = subprocess.run(
        [
            BASH,
            str(repository / "scripts" / "pp"),
            "--dc-recovery",
            "--tools=write",
            "--extension",
            "bypass.js",
            "--session",
            "repair-session",
        ],
        env={
            **os.environ,
            "HOME": str(home),
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        },
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["args"] == [
        "--no-tools",
        "--no-extensions",
        "--session",
        "repair-session",
    ]
    assert "recovery helper is unavailable" in result.stderr


@pytest.mark.skipif(PWSH is None or NODE is None, reason="PowerShell or node not found")
def test_recovery_powershell_launcher_fixture_is_fail_closed(tmp_path: Path) -> None:
    repository = _recovery_launcher_repository(tmp_path, "pp.ps1")
    _write_valid_bootstrap(repository)
    home = tmp_path / "home"
    bin_dir = tmp_path / "bin"
    home.mkdir()
    bin_dir.mkdir()
    _fake_pi_powershell(bin_dir)
    environment = {
        **os.environ,
        "USERPROFILE": str(home),
        "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
    }

    recovery = subprocess.run(
        [
            PWSH,
            "-NoProfile",
            "-File",
            str(repository / "scripts" / "pp.ps1"),
            "--dc-recovery",
            "--extension",
            "bypass.js",
            "--session",
            "session-789",
        ],
        env=environment,
        capture_output=True,
        text=True,
    )
    assert recovery.returncode == 0, recovery.stderr
    recovery_args = json.loads(recovery.stdout)["args"]
    assert recovery_args[:2] == ["--no-extensions", "--extension"]
    assert Path(recovery_args[2]) == (repository / "scripts" / "pi-damage-control-recovery.js")
    assert recovery_args[3:] == ["--session", "session-789"]

    _write_valid_bootstrap(repository).unlink()
    failed = subprocess.run(
        [
            PWSH,
            "-NoProfile",
            "-File",
            str(repository / "scripts" / "pp.ps1"),
            "--tools=write",
            "--extension=bypass.js",
        ],
        env=environment,
        capture_output=True,
        text=True,
    )
    assert failed.returncode == 0, failed.stderr
    assert json.loads(failed.stdout)["args"] == ["--no-tools", "--no-extensions"]
