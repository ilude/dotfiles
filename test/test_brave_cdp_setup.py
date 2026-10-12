import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "brave-cdp-setup.ps1"


pytestmark = pytest.mark.skipif(os.name != "nt", reason="Windows shortcut integration")


def run_powershell(script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["pwsh", "-NoProfile", "-Command", script],
        check=False,
        capture_output=True,
        text=True,
    )


def ps_quote(path: Path) -> str:
    return "'" + str(path).replace("'", "''") + "'"


def test_updates_shortcuts_deterministically_and_preserves_other_arguments(tmp_path: Path):
    brave = tmp_path / "Application" / "brave.exe"
    user_data = tmp_path / "User Data"
    shortcuts = tmp_path / "Shortcuts"
    desktop = tmp_path / "Desktop"
    backups = tmp_path / "Backups"
    brave.parent.mkdir()
    brave.write_bytes(b"")
    user_data.mkdir()
    shortcuts.mkdir()
    desktop.mkdir()

    setup = f"""
    $ws = New-Object -ComObject WScript.Shell
    $link = $ws.CreateShortcut({ps_quote(shortcuts / "Personal.lnk")})
    $link.TargetPath = {ps_quote(brave)}
    $link.Arguments = '--profile-directory="Profile 1" --disable-features=Example'
    $link.Save()
    $params = @{{
        BravePath = {ps_quote(brave)}
        UserDataDir = {ps_quote(user_data)}
        ShortcutRoots = {ps_quote(shortcuts)}
        DesktopDirectory = {ps_quote(desktop)}
        BackupDirectory = {ps_quote(backups)}
        SkipProtocolHandlers = $true
    }}
    & {ps_quote(SCRIPT)} @params
    if (-not $?) {{ exit 10 }}
    & {ps_quote(SCRIPT)} @params
    if (-not $?) {{ exit 11 }}
    $personal = $ws.CreateShortcut({ps_quote(shortcuts / "Personal.lnk")})
    $desktopLink = $ws.CreateShortcut({ps_quote(desktop / "Brave.lnk")})
    [pscustomobject]@{{
        Personal = $personal.Arguments
        Desktop = $desktopLink.Arguments
        BackupRuns = @(Get-ChildItem {ps_quote(backups)} -Directory).Count
    }} | ConvertTo-Json -Compress
    """
    result = run_powershell(setup)

    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout.strip().splitlines()[-1])
    required = [
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=9222",
        f'--user-data-dir="{user_data}"',
    ]
    assert '--profile-directory="Profile 1"' in data["Personal"]
    assert "--disable-features=Example" in data["Personal"]
    assert '--profile-directory="Default"' in data["Desktop"]
    assert all(argument in data["Personal"] for argument in required)
    assert all(argument in data["Desktop"] for argument in required)
    assert data["BackupRuns"] == 1


@pytest.mark.parametrize("install_root", ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"])
def test_discovers_brave_install_location(tmp_path: Path, install_root: str):
    roots = {
        name: tmp_path / name for name in ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"]
    }
    brave = roots[install_root] / "BraveSoftware" / "Brave-Browser" / "Application" / "brave.exe"
    brave.parent.mkdir(parents=True)
    brave.write_bytes(b"")
    user_data = tmp_path / "User Data"
    user_data.mkdir()
    shortcuts = tmp_path / "Shortcuts"
    shortcuts.mkdir()
    desktop = tmp_path / "Desktop"
    desktop.mkdir()
    env_setup = "\n".join(
        f"[Environment]::SetEnvironmentVariable('{name}', {ps_quote(root)}, 'Process')"
        for name, root in roots.items()
    )
    result = run_powershell(
        f"""
        $ErrorActionPreference = 'Stop'
        {env_setup}
        $env:BRAVE_PATH = $null
        & {ps_quote(SCRIPT)} -UserDataDir {ps_quote(user_data)} `
            -ShortcutRoots {ps_quote(shortcuts)} -DesktopDirectory {ps_quote(desktop)} `
            -BackupDirectory {ps_quote(tmp_path / "Backups")} -SkipProtocolHandlers
        $ws = New-Object -ComObject WScript.Shell
        $link = $ws.CreateShortcut({ps_quote(desktop / "Brave.lnk")})
        [pscustomobject]@{{
            Target = $link.TargetPath
            Arguments = $link.Arguments
        }} | ConvertTo-Json -Compress
        """
    )

    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout.strip().splitlines()[-1])
    assert Path(data["Target"]) == brave
    assert "--remote-debugging-port=9222" in data["Arguments"]


def test_missing_brave_is_a_nonfatal_skip(tmp_path: Path):
    result = run_powershell(
        f"& {ps_quote(SCRIPT)} -BravePath {ps_quote(tmp_path / 'missing.exe')} "
        f"-UserDataDir {ps_quote(tmp_path)} -SkipProtocolHandlers"
    )

    assert result.returncode == 0
    assert "executable not found" in result.stdout
