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
ZSH = shutil.which("zsh") or os.environ.get("ZSH_EXECUTABLE")


def _repository(tmp_path: Path, shell: str) -> Path:
    repository = tmp_path / ".dotfiles"
    scripts = repository / "scripts"
    scripts.mkdir(parents=True)
    (repository / "pi/profiles/default").mkdir(parents=True)
    (repository / "pi/profiles/legacy").mkdir(parents=True)
    for name in [
        "pi-profile-launch",
        "pi-profile-launch.ps1",
        "pi-damage-control-preflight.mjs",
        "pi-damage-control-recovery.js",
    ]:
        shutil.copy2(DOTFILES / "scripts" / name, scripts / name)
    bootstrap = repository / "pi/profiles/default/extensions/damage-control/index.js"
    bootstrap.parent.mkdir(parents=True)
    bootstrap.write_text("export default function fixture() {}\n", encoding="utf-8")
    return repository


def _environment(tmp_path: Path, shell: str) -> dict:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    if shell == "bash":
        executable = bin_dir / "pi"
        executable.write_text(
            "#!/usr/bin/env bash\n"
            "node -e 'console.log(JSON.stringify({dir: process.env.PI_CODING_AGENT_DIR, "
            'args: process.argv.slice(1)}))\' -- "$@"\n',
            encoding="utf-8",
        )
        executable.chmod(0o755)
    else:
        (bin_dir / "pi.ps1").write_text(
            "[pscustomobject]@{ dir = $env:PI_CODING_AGENT_DIR; "
            "args = @($args) } | ConvertTo-Json -Compress\nexit 0\n",
            encoding="utf-8",
        )
    # A stale public launcher must never be used by either shell function.
    (bin_dir / "pp").write_text("#!/usr/bin/env bash\nexit 99\n", encoding="utf-8")
    (bin_dir / "pp").chmod(0o755)
    (bin_dir / "pp.ps1").write_text("throw 'stale pp invoked'\n", encoding="utf-8")
    return {
        **os.environ,
        "HOME": str(tmp_path),
        "USERPROFILE": str(tmp_path),
        "ZDOTDIR": str(tmp_path),
        "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
    }


def _run(repository: Path, shell: str, env: dict, args: list):
    command = (
        [BASH, str(repository / "scripts/pi-profile-launch")]
        if shell == "bash"
        else [PWSH, "-NoProfile", "-File", str(repository / "scripts/pi-profile-launch.ps1")]
    )
    return subprocess.run(command + args, env=env, capture_output=True, text=True, timeout=30)


@pytest.fixture(params=["bash", "powershell"])
def launcher(request, tmp_path):
    shell = request.param
    if NODE is None or (BASH if shell == "bash" else PWSH) is None:
        pytest.skip("required shell or node not found")
    return _repository(tmp_path, shell), shell, _environment(tmp_path, shell)


@pytest.mark.parametrize(
    "args,profile,forwarded",
    [
        ([], "default", []),
        (["-p", "clean", "--model", "example"], "clean", ["--model", "example"]),
        (["--profile", "legacy", "--model", "example"], "legacy", ["--model", "example"]),
        (["--profile=clean", "--", "-p", "hello world"], "clean", ["-p", "hello world"]),
        (
            ["--resume", "session-123", "--model", "example"],
            "default",
            ["--session", "session-123", "--model", "example"],
        ),
        (["--session=session-123"], "default", ["--session", "session-123"]),
        (["--", "--dc-recovery"], "default", ["--dc-recovery"]),
    ],
)
def test_profile_routing_and_forwarding(launcher, args, profile, forwarded, tmp_path):
    repository, shell, env = launcher
    result = _run(repository, shell, env, args)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    expected = (
        repository / "pi/profiles" / profile
        if profile in ["default", "legacy"]
        else tmp_path / ".pi/profiles" / profile
    )
    assert Path(payload["dir"]) == expected
    assert payload["args"] == forwarded
    assert result.stderr == ""


@pytest.mark.parametrize("state", ["missing", "malformed"])
def test_startup_protection_disables_tools_and_extensions(launcher, state):
    repository, shell, env = launcher
    bootstrap = repository / "pi/profiles/default/extensions/damage-control/index.js"
    if state == "missing":
        bootstrap.unlink()
    else:
        bootstrap.write_text("export default {\n", encoding="utf-8")
    result = _run(
        repository,
        shell,
        env,
        [
            "--session=repair-session",
            "--tools",
            "bash,write",
            "--extension=untrusted.js",
            "--model",
            "example",
        ],
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["args"] == [
        "--no-tools",
        "--no-extensions",
        "--session",
        "repair-session",
        "--model",
        "example",
    ]
    assert "pi: default damage-control bootstrap is unavailable" in result.stderr
    assert "recovery is never selected automatically" in result.stderr


def test_explicit_recovery_preserves_tools_and_resume(launcher):
    repository, shell, env = launcher
    result = _run(
        repository,
        shell,
        env,
        ["--dc-recovery", "--resume", "session-456", "-e", "untrusted.js", "--tools", "read,write"],
    )
    assert result.returncode == 0, result.stderr
    args = json.loads(result.stdout)["args"]
    assert args[:2] == ["--no-extensions", "--extension"]
    assert Path(args[2]) == repository / "scripts/pi-damage-control-recovery.js"
    assert args[3:] == ["--session", "session-456", "--tools", "read,write"]


def test_invalid_recovery_helper_fails_closed(launcher):
    repository, shell, env = launcher
    (repository / "scripts/pi-damage-control-recovery.js").write_text(
        "export default {\n", encoding="utf-8"
    )
    result = _run(
        repository, shell, env, ["--dc-recovery", "--tools=write", "--extension", "bypass.js"]
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["args"] == ["--no-tools", "--no-extensions"]
    assert "pi: recovery helper is unavailable" in result.stderr


@pytest.mark.parametrize(
    "args,message",
    [
        (["--profile", "../bad"], "pi: invalid profile name"),
        (["--profile", "legacy", "--dc-recovery"], "only for the default profile"),
        (["-p"], "usage: pi"),
    ],
)
def test_public_errors_use_pi(launcher, args, message):
    repository, shell, env = launcher
    result = _run(repository, shell, env, args)
    assert result.returncode == 2
    assert message in result.stderr


@pytest.mark.parametrize(
    "args,expected",
    [
        ("--model example", ["--model", "example"]),
        ("-p clean -- --print 'hello world'", ["--print", "hello world"]),
        ("--resume session-123", ["--session", "session-123"]),
        ("--dc-recovery", None),
        ("--tools write --extension unsafe.js", ["--no-tools", "--no-extensions"]),
    ],
)
def test_bare_pi_shell_function_uses_internal_helper_without_recursion(launcher, args, expected):
    repository, shell, env = launcher
    if expected == ["--no-tools", "--no-extensions"]:
        (repository / "pi/profiles/default/extensions/damage-control/index.js").unlink()
    if shell == "bash":
        if ZSH is None:
            pytest.skip("zsh not found")
        aliases = (DOTFILES / "zsh/rc.d/06-aliases.zsh").as_posix()
        if os.name == "nt":
            aliases = f"/{aliases[0].lower()}{aliases[2:]}"
            home = Path(env["ZDOTDIR"]).as_posix()
            env["ZDOTDIR"] = f"/{home[0].lower()}{home[2:]}"
        command = [ZSH, "-f", "-c", f'source "{aliases}"; pi {args}']
    else:
        # Load only the Pi wiring from the real profile, avoiding unrelated interactive setup.
        profile = str(DOTFILES / "powershell/profile.ps1").replace("'", "''")
        command = [
            PWSH,
            "-NoProfile",
            "-Command",
            f"$text = Get-Content -Raw '{profile}'; "
            "$start = $text.IndexOf('$script:PiProfileLauncher ='); "
            "$end = $text.IndexOf('# Claude Code YOLO mode', $start); "
            "Invoke-Expression $text.Substring($start, $end - $start); "
            f"pi {args}",
        ]
    result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    if expected is None:
        assert payload["args"][:2] == ["--no-extensions", "--extension"]
    else:
        assert payload["args"] == expected


@pytest.mark.skipif(NODE is None, reason="node not found")
def test_damage_control_preflight_checks_existence_and_javascript_syntax(tmp_path):
    preflight = DOTFILES / "scripts/pi-damage-control-preflight.mjs"
    target = tmp_path / "path with spaces/index.js"
    target.parent.mkdir()
    for content, code in [("export default function fixture() {}\n", 0), ("export default {\n", 1)]:
        target.write_text(content, encoding="utf-8")
        result = subprocess.run([NODE, str(preflight), str(target)], capture_output=True, text=True)
        assert result.returncode == code, result.stderr
    target.unlink()
    result = subprocess.run([NODE, str(preflight), str(target)], capture_output=True, text=True)
    assert result.returncode == 1
    assert "bootstrap is unavailable" in result.stderr
