"""Stage orchestration and actual link behavior with disposable fixture packages.

Download and readiness boundaries are stubbed, not actual-Pi acceptance.
"""

import json
import os
import shlex
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
BASH = shutil.which("bash")
NODE = shutil.which("node")
PACKAGES = [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
    "typebox",
]
pytestmark = pytest.mark.skipif(BASH is None or NODE is None, reason="bash/node unavailable")


@pytest.fixture
def setup_tree(tmp_path):
    root = tmp_path / "checkout with spaces"
    (root / "scripts").mkdir(parents=True)
    for script in ("pi-default-setup", "pi-deps-link-setup", "pi-link-setup", "pi-link-setup.ps1"):
        shutil.copy2(ROOT / "scripts" / script, root / "scripts")
    # The production smoke is tested separately against the installed Pi SDK.
    (root / "scripts/pi-setup-smoke.mjs").write_text("// readiness fixture\n")
    profile = root / "pi/profiles/default"
    (profile / "extensions/web-tools").mkdir(parents=True)
    (profile / "package.json").write_text("{}")
    legacy = root / "pi/profiles/legacy"
    legacy.mkdir(parents=True)
    (legacy / "preserve.txt").write_text("untouched")
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
    home = tmp_path / "caller home with spaces"
    home.mkdir()
    elsewhere = tmp_path / "unrelated working directory"
    elsewhere.mkdir()
    bin_dir = tmp_path / "fake bin"
    bin_dir.mkdir()
    trace = tmp_path / "trace"
    pnpm = bin_dir / "pnpm"
    pnpm.write_text(
        "#!/usr/bin/env bash\n"
        'if [[ "$1" == list ]]; then printf "[]\\n"; exit 0; fi\n'
        "kind=install\n"
        'if [[ "$*" == *--ignore-workspace* ]]; then kind=web; fi\n'
        'if [[ "$1" == run ]]; then kind=runtime; fi\n'
        'printf "%s|%s|%s|%s\\n" "$kind" "$CI" "$PWD" "$*" >> "$TRACE"\n'
        'if [[ "$FAIL_AT" == "$kind" ]]; then exit 9; fi\n'
    )
    pnpm.chmod(0o755)
    node = bin_dir / "node"
    node.write_text(
        "#!/usr/bin/env bash\n"
        'if [[ "$1" == */pi-setup-smoke.mjs ]]; then\n'
        '  printf "smoke|%s\\n" "$*" >> "$TRACE"\n'
        '  if [[ "$FAIL_AT" == smoke ]]; then exit 9; fi\n'
        "  exit 0\n"
        "fi\n"
        f'exec {shlex.quote(Path(NODE).as_posix())} "$@"\n'
    )
    node.chmod(0o755)
    env = {
        **os.environ,
        "HOME": str(home),
        "USERPROFILE": str(home),
        "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        "PNPM_GLOBAL_NODE_MODULES": str(global_dir),
        "TRACE": str(trace),
        "FAIL_AT": "",
    }

    def run(*args, stage=False, fail_at=""):
        script = "pi-default-setup" if stage else "pi-deps-link-setup"
        return subprocess.run(
            [BASH, str(root / "scripts" / script), *args],
            env={**env, "FAIL_AT": fail_at},
            cwd=elsewhere,
            capture_output=True,
            text=True,
            timeout=45,
        )

    return root, global_dir, home, trace, run


def test_default_links_runtime_cohort_and_repairs_stale_links(setup_tree):
    root, global_dir, _, _, run = setup_tree
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
    _, global_dir, _, _, run = setup_tree
    shutil.rmtree(global_dir / "@earendil-works/pi-ai")
    result = run("--profile", "default")
    assert result.returncode != 0
    assert "required package @earendil-works/pi-ai" in result.stderr
    assert "Done" not in result.stdout


def test_refuses_unrelated_directory_without_modifying_it(setup_tree):
    root, _, _, _, run = setup_tree
    target = root / "pi/profiles/default/node_modules/@earendil-works/pi-coding-agent"
    target.mkdir(parents=True)
    marker = target / "user-work.txt"
    marker.write_text("preserve me")
    result = run("--profile", "default")
    assert result.returncode != 0
    assert "refusing to overwrite" in result.stdout
    assert marker.read_text() == "preserve me"


@pytest.mark.parametrize("args", [("--profile",), ("--profile", "../bad"), ("unexpected",)])
def test_invalid_arguments_do_not_create_dependencies(setup_tree, args):
    root, _, _, _, run = setup_tree
    assert run(*args).returncode == 2
    assert not (root / "pi/profiles/default/node_modules").exists()


def test_missing_global_root_fails_default(setup_tree):
    _, global_dir, _, _, run = setup_tree
    shutil.rmtree(global_dir)
    assert run("--profile", "default").returncode != 0


def test_actual_default_stage_is_repeatable_and_uses_caller_home(setup_tree):
    root, global_dir, home, trace, run = setup_tree
    for _ in range(2):
        result = run(stage=True)
        assert result.returncode == 0, result.stdout + result.stderr
        assert "configuration ready; authentication unverified" in result.stdout
        assert (home / ".pi/agent").resolve() == (root / "pi/profiles/default").resolve()
        for package in PACKAGES:
            assert (root / "pi/profiles/default/node_modules" / package).resolve() == (
                global_dir / package
            ).resolve()
    calls = trace.read_text().splitlines()
    assert [line.split("|", 1)[0] for line in calls] == ["install", "web", "runtime", "smoke"] * 2
    for line in calls:
        if line.startswith(("install|", "web|")):
            assert "|true|" in line
            assert line.endswith("--frozen-lockfile")
            assert str(root).replace("\\", "/") in line or root.name in line
        if line.startswith("runtime|"):
            assert "/pi/profiles/default|run check:runtime" in line.replace("\\", "/")
    assert (root / "pi/profiles/legacy/preserve.txt").read_text() == "untouched"
    assert sorted(p.name for p in (root / "pi/profiles/legacy").iterdir()) == ["preserve.txt"]


@pytest.mark.parametrize("fail_at", ["install", "web", "runtime", "smoke"])
def test_actual_stage_propagates_required_failure(setup_tree, fail_at):
    _, _, home, trace, run = setup_tree
    result = run(stage=True, fail_at=fail_at)
    assert result.returncode == 9, result.stdout + result.stderr
    kinds = [line.split("|", 1)[0] for line in trace.read_text().splitlines()]
    order = ["install", "web", "runtime", "smoke"]
    assert kinds == order[: order.index(fail_at) + 1]
    assert "configuration ready" not in result.stdout
    if fail_at != "smoke":
        assert not (home / ".pi/agent").exists()


def test_actual_stage_propagates_agent_link_failure_without_readiness(setup_tree):
    _, _, home, trace, run = setup_tree
    target = home / ".pi/agent"
    target.parent.mkdir()
    target.write_text("preserve this unrelated file")
    result = run(stage=True)
    assert result.returncode != 0, result.stdout + result.stderr
    assert target.read_text() == "preserve this unrelated file"
    assert [line.split("|", 1)[0] for line in trace.read_text().splitlines()] == [
        "install",
        "web",
        "runtime",
    ]
    assert "configuration ready" not in result.stdout


def test_actual_stage_propagates_dependency_link_failure(setup_tree):
    _, global_dir, home, trace, run = setup_tree
    shutil.rmtree(global_dir / "typebox")
    result = run(stage=True)
    assert result.returncode != 0
    assert [line.split("|", 1)[0] for line in trace.read_text().splitlines()] == ["install", "web"]
    assert not (home / ".pi/agent").exists()
