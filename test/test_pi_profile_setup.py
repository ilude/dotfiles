"""Execute dependency setup against isolated packages, never the live profile."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
BASH = shutil.which("bash")
PACKAGES = [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
    "typebox",
]
pytestmark = pytest.mark.skipif(BASH is None, reason="bash unavailable")


@pytest.fixture
def setup_tree(tmp_path):
    root = tmp_path / "checkout with spaces"
    (root / "scripts").mkdir(parents=True)
    shutil.copy2(ROOT / "scripts/pi-deps-link-setup", root / "scripts")
    for profile in ("default", "legacy"):
        (root / "pi/profiles" / profile).mkdir(parents=True)
    global_dir = tmp_path / "global packages/node_modules"
    for package in PACKAGES:
        folder = global_dir / package
        folder.mkdir(parents=True)
        (folder / "package.json").write_text(
            json.dumps({"name": package, "version": "0.0.0", "main": "index.js"})
        )
        (folder / "index.js").write_text("module.exports = {};\n")
        if package == "@earendil-works/pi-ai":
            (folder / "package.json").write_text(
                json.dumps(
                    {
                        "name": package,
                        "version": "0.0.0",
                        "type": "module",
                        "exports": {".": {"import": "./index.js"}},
                    }
                )
            )
    bin_dir = tmp_path / "fake bin"
    bin_dir.mkdir()
    pnpm = bin_dir / "pnpm"
    pnpm.write_text("#!/usr/bin/env bash\nprintf '[]\\n'\n")
    pnpm.chmod(0o755)
    env = {
        **os.environ,
        "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        "PNPM_GLOBAL_NODE_MODULES": str(global_dir),
    }

    def run(*args):
        return subprocess.run(
            [BASH, str(root / "scripts/pi-deps-link-setup"), *args],
            env=env,
            capture_output=True,
            text=True,
            timeout=45,
        )

    return root, global_dir, run


def test_default_links_runtime_cohort_and_repairs_stale_links(setup_tree):
    root, global_dir, run = setup_tree
    target = root / "pi/profiles/default/node_modules/typebox"
    target.parent.mkdir(parents=True)
    target.symlink_to(global_dir / "missing-old-version", target_is_directory=True)
    result = run("--profile", "default")
    assert result.returncode == 0, result.stdout + result.stderr
    for package in PACKAGES:
        linked = root / "pi/profiles/default/node_modules" / package
        assert linked.is_symlink(), result.stdout + result.stderr
        assert linked.resolve() == (global_dir / package).resolve()
    assert not (root / "pi/profiles/legacy/node_modules").exists()


def test_missing_required_package_is_nonzero_not_successful_skip(setup_tree):
    _, global_dir, run = setup_tree
    shutil.rmtree(global_dir / "@earendil-works/pi-ai")
    result = run("--profile", "default")
    assert result.returncode != 0
    assert "required package @earendil-works/pi-ai" in result.stderr
    assert "Done" not in result.stdout


def test_refuses_unrelated_directory_without_modifying_it(setup_tree):
    root, _, run = setup_tree
    target = root / "pi/profiles/default/node_modules/@earendil-works/pi-coding-agent"
    target.mkdir(parents=True)
    marker = target / "user-work.txt"
    marker.write_text("preserve me")
    result = run("--profile", "default")
    assert result.returncode != 0
    assert "refusing to overwrite" in result.stdout
    assert marker.read_text() == "preserve me"


def test_no_argument_preserves_legacy_missing_package_skip(setup_tree):
    root, global_dir, run = setup_tree
    shutil.rmtree(global_dir / "typebox")
    result = run()
    assert result.returncode == 0, result.stderr
    assert "Skipping typebox" in result.stdout
    assert (root / "pi/profiles/legacy/node_modules").is_dir()
    assert not (root / "pi/profiles/default/node_modules").exists()


@pytest.mark.parametrize("args", [("--profile",), ("--profile", "../bad"), ("unexpected",)])
def test_invalid_arguments_do_not_create_dependencies(setup_tree, args):
    root, _, run = setup_tree
    result = run(*args)
    assert result.returncode == 2
    assert not (root / "pi/profiles/default/node_modules").exists()


@pytest.mark.parametrize("fail", [False, True])
def test_bash_installer_default_phase_executes_order_and_stops_on_failure(tmp_path, fail):
    root = tmp_path / "installer fixture"
    profile = root / "pi/profiles/default"
    profile.mkdir(parents=True)
    (profile / "package.json").write_text("{}")
    (root / "scripts").mkdir()
    helper = root / "scripts/pi-deps-link-setup"
    helper.write_text('#!/usr/bin/env bash\nprintf "link %s\\n" "$*" >> "$TRACE"\n')
    helper.chmod(0o755)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    stub = bin_dir / "pnpm"
    stub.write_text(
        '#!/usr/bin/env bash\nprintf "pnpm %s\\n" "$*" >> "$TRACE"\n'
        'if [[ "$FAIL_INSTALL" == 1 ]]; then exit 9; fi\n'
    )
    stub.chmod(0o755)
    source = (ROOT / "install").read_text()
    phase = source.split('current_step="default pi dependencies"', 1)[1].split(
        'current_step="pi agent directory link"', 1
    )[0]
    script = tmp_path / "phase.sh"
    script.write_text('BASEDIR="$FIXTURE_ROOT"\ncompleted_steps=()\n' + phase)
    trace = tmp_path / "trace"
    result = subprocess.run(
        [BASH, str(script)],
        env={
            **os.environ,
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
            "FIXTURE_ROOT": str(root),
            "TRACE": str(trace),
            "FAIL_INSTALL": str(int(fail)),
        },
        text=True,
        capture_output=True,
        timeout=20,
    )
    calls = trace.read_text().splitlines()
    if fail:
        assert result.returncode != 0
        assert len(calls) == 1
    else:
        assert result.returncode == 0, result.stderr
        assert len(calls) == 4
        assert calls[0].endswith("--frozen-lockfile")
        assert "--ignore-workspace install --frozen-lockfile" in calls[1]
        assert calls[2] == "link --profile default"
        assert calls[3] == "pnpm run check:runtime"


@pytest.mark.parametrize("fail_at", [0, 1, 2, 3, 4])
def test_powershell_installer_phase_is_strict_and_restores_location(tmp_path, fail_at):
    pwsh = shutil.which("pwsh")
    if not pwsh:
        pytest.skip("PowerShell unavailable")
    root = tmp_path / "PowerShell installer fixture"
    profile = root / "pi/profiles/default"
    profile.mkdir(parents=True)
    (profile / "package.json").write_text("{}")
    source = (ROOT / "install.ps1").read_text()
    phase = source.split(
        "# Default safety setup is strict and does not inherit legacy build overrides.", 1
    )[1].split("    # ========================================================================", 1)[
        0
    ]
    script = tmp_path / "phase.ps1"
    script.write_text(
        "$ErrorActionPreference = 'Stop'\n"
        "$BASEDIR = $env:FIXTURE_ROOT\n"
        "$gitBash = 'Invoke-FixtureBash'\n"
        "$script:step = 0\n"
        "function Trace-Step($kind, $values) {\n"
        "  $script:step++\n"
        "  Add-Content $env:TRACE ($kind + ' ' + ($values -join ' '))\n"
        "  $global:LASTEXITCODE = if ($script:step -eq [int]$env:FAIL_AT) {9} else {0}\n"
        "}\n"
        "function pnpm { Trace-Step 'pnpm' $args }\n"
        "function Invoke-FixtureBash { Trace-Step 'link' $args }\n"
        "function ConvertTo-GitBashPath($value) { return $value }\n"
        "$before = (Get-Location).Path\n"
        "try {\n" + phase + "\n} finally {\n"
        "  if ((Get-Location).Path -ne $before) { throw 'Location not restored' }\n"
        "}\n"
    )
    trace = tmp_path / "trace"
    result = subprocess.run(
        [pwsh, "-NoProfile", "-File", str(script)],
        env={
            **os.environ,
            "FIXTURE_ROOT": str(root),
            "TRACE": str(trace),
            "FAIL_AT": str(fail_at),
        },
        text=True,
        capture_output=True,
        timeout=20,
    )
    calls = trace.read_text().splitlines()
    assert len(calls) == (fail_at or 4), result.stderr
    assert (result.returncode != 0) == bool(fail_at), result.stderr
    assert "Location not restored" not in result.stderr
    if not fail_at:
        assert calls[0] == "pnpm install --frozen-lockfile"
        assert "--ignore-workspace install --frozen-lockfile" in calls[1]
        assert calls[2].endswith("--profile default")
        assert calls[3] == "pnpm run check:runtime"


def test_missing_global_root_fails_only_default(setup_tree):
    _, global_dir, run = setup_tree
    shutil.rmtree(global_dir)
    assert run("--profile", "default").returncode != 0
    assert run().returncode == 0
