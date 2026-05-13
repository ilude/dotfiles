from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
EVIDENCE = ROOT / ".specs" / "dolos-private-archive" / "evidence"


def script(path: Path) -> list[str]:
    return [sys.executable, str(path)]


def run(cmd, cwd=ROOT, check=True, **kwargs):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(SCRIPTS) + os.pathsep + env.get("PYTHONPATH", "")
    return subprocess.run(
        cmd, cwd=cwd, env=env, text=True, capture_output=True, check=check, **kwargs
    )


def git_init(repo: Path) -> None:
    run(["git", "init"], cwd=repo)
    run(["git", "config", "user.email", "t@example.com"], cwd=repo)
    run(["git", "config", "user.name", "Test"], cwd=repo)


def dolos_exe() -> Path:
    exe = ROOT / "bin" / ("dolos.exe" if os.name == "nt" else "dolos")
    if not exe.exists():
        alt = ROOT / "bin" / ("dolos" if os.name == "nt" else "dolos.exe")
        exe = alt if alt.exists() else exe
    return exe


def dolos_cmd() -> list[str]:
    return [str(dolos_exe())]


def write_evidence(name: str, text: str) -> None:
    if not EVIDENCE.parent.exists():
        return
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / name).write_text(text, encoding="utf-8")


def make_hook_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    shutil.copytree(ROOT / "scripts", repo / "scripts")
    shutil.copy2(ROOT / ".gitignore", repo / ".gitignore")
    shutil.copy2(ROOT / ".gitattributes", repo / ".gitattributes")
    (repo / "bin").mkdir()
    fake = repo / "bin" / ("dolos.exe" if os.name == "nt" else "dolos")
    fake.write_text(
        "#!/bin/sh\n"
        "printf '%s\\n' \"$@\" >> dolos-args.log\n"
        "if [ \"$1 $2\" = \"scan --staged\" ]; then\n"
        "  for path in $(git diff --cached --name-only); do\n"
        "    case \"$path\" in\n"
        "      private|private/*) echo unsafe staged path >&2; exit 3 ;;\n"
        "      .dolos/authorized_keys|.dolos/artifacts/private.tar.gz.age) ;;\n"
        "      .dolos/*) echo unsafe staged path >&2; exit 3 ;;\n"
        "    esac\n"
        "  done\n"
        "  echo dolos scan ok\n"
        "  exit 0\n"
        "fi\n"
        "exit 2\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    git_init(repo)
    run(["git", "add", "scripts", ".gitignore", ".gitattributes"], cwd=repo)
    run(["git", "commit", "-m", "base"], cwd=repo)
    hook_path = run(
        ["git", "rev-parse", "--git-path", "hooks/pre-commit"], cwd=repo
    ).stdout.strip()
    hook = repo / hook_path
    hook.parent.mkdir(parents=True, exist_ok=True)
    hook.write_text("#!/bin/sh\nscripts/git-hooks/pre-commit-x-private\n", encoding="utf-8")
    return repo


def test_legacy_allowlist():
    proc = run(
        [
            "git",
            "grep",
            "-nE",
            r"\\.encrypted|recipients\\.txt|private-archive|x-private|private_archive_lib|pre-commit-x-private|install-x-private-hook",
            "--",
            ".gitignore",
            ".gitattributes",
            "scripts",
            "test/test_private_archive.py",
            "tests",
            "pi/prompts/handoff.md",
            "pi/skills/x-twitter/SKILL.md",
        ],
        check=False,
    )
    allowed_prefixes = (
        "scripts/install-dolos-hook:",
        "test/test_private_archive.py:",
    )
    unexpected = [
        line
        for line in proc.stdout.splitlines()
        if not line.startswith(allowed_prefixes)
    ]
    assert unexpected == []


def test_hook_install_idempotent_block_only_and_unrelated_commit(tmp_path):
    repo = make_hook_repo(tmp_path)
    run(script(repo / "scripts/install-dolos-hook") + ["--dry-run"], cwd=repo)
    run(script(repo / "scripts/install-dolos-hook"), cwd=repo)
    run(script(repo / "scripts/install-dolos-hook"), cwd=repo)
    hook_path = run(["git", "rev-parse", "--git-path", "hooks/pre-commit"], cwd=repo).stdout.strip()
    hook = repo / hook_path if not Path(hook_path).is_absolute() else Path(hook_path)
    text = hook.read_text(encoding="utf-8")
    assert text.count("scripts/git-hooks/pre-commit-dolos") == 1
    assert "pre-commit-x-private" not in text

    (repo / "README.md").write_text("unrelated\n", encoding="utf-8")
    run(["git", "add", "README.md"], cwd=repo)
    run(["git", "commit", "-m", "unrelated"], cwd=repo)
    assert "scan\n--staged\n" in (repo / "dolos-args.log").read_text(encoding="utf-8")

    (repo / "private").mkdir()
    (repo / "private" / "secret.txt").write_text("CANARY_PRIVATE_SECRET\n", encoding="utf-8")
    run(["git", "add", "-f", "private/secret.txt"], cwd=repo)
    proc = run(["git", "commit", "-m", "plaintext"], cwd=repo, check=False)
    assert proc.returncode != 0
    assert not (repo / ".dolos" / "artifacts" / "private.tar.gz.age").exists()


def test_real_repo_dolos_checks_are_non_mutating():
    if not dolos_exe().exists():
        pytest.skip("Dolos binary is a local ignored artifact")

    status_paths = [
        "git",
        "status",
        "--short",
        "--",
        "private",
        ".dolos",
        "bin/dolos",
        "bin/dolos.exe",
    ]
    before = run(status_paths, check=False).stdout
    status = run(dolos_cmd() + ["status"], check=False)
    scan = run(dolos_cmd() + ["scan", "--staged"], check=False)
    after = run(status_paths, check=False).stdout

    assert status.returncode in {0, 4}
    assert scan.returncode == 0
    assert before == after
    evidence = (
        "$ dolos status\n"
        f"exit={status.returncode}\n{status.stdout}{status.stderr}\n"
        "$ dolos scan --staged\n"
        f"exit={scan.returncode}\n{scan.stdout}{scan.stderr}\n"
    )
    write_evidence("real-repo-check.txt", evidence)


def test_evidence_hygiene():
    if not EVIDENCE.exists():
        return
    needle_re = (
        r"CANARY_PRIVATE_SECRET|BEGIN OPENSSH|AGE-SECRET-KEY|PRIVATE KEY|"
        r"do-not-print|fixture secret"
    )
    proc = run(["grep", "-R", "-nE", needle_re, str(EVIDENCE)], check=False)
    write_evidence(
        "no-secret-check.txt",
        "evidence hygiene grep completed without private canary/key material\n"
        f"exit={proc.returncode}\n",
    )
    assert proc.returncode == 1, proc.stdout + proc.stderr


def test_git_metadata_allows_dolos_and_marks_artifact_binary():
    for path in (".dolos/authorized_keys", ".dolos/artifacts/private.tar.gz.age"):
        ignored = run(["git", "check-ignore", "-q", path], check=False)
        assert ignored.returncode == 1
    attrs = run(
        [
            "git",
            "check-attr",
            "--all",
            "--",
            ".dolos/artifacts/private.tar.gz.age",
            ".dolos/authorized_keys",
        ]
    ).stdout
    assert ".dolos/artifacts/private.tar.gz.age: binary: set" in attrs
    assert ".dolos/artifacts/private.tar.gz.age: diff: unset" in attrs
    assert ".dolos/artifacts/private.tar.gz.age: merge: unset" in attrs
    assert ".dolos/authorized_keys: text: set" in attrs
