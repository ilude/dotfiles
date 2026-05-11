from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"


def script(path: Path) -> list[str]:
    return [sys.executable, str(path)]


def run(cmd, cwd=ROOT, **kwargs):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(SCRIPTS) + os.pathsep + env.get("PYTHONPATH", "")
    return subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        text=True,
        capture_output=True,
        check=True,
        **kwargs,
    )


def age_identity(tmp_path):
    tmp_path.mkdir(parents=True, exist_ok=True)
    ident = tmp_path / "id.txt"
    proc = run(["age-keygen", "-o", str(ident)], cwd=tmp_path)
    text = proc.stderr + proc.stdout + ident.read_text()
    recipient = next(line.split()[-1] for line in text.splitlines() if "public key:" in line)
    return ident, recipient


def make_repo(tmp_path, recipient):
    repo = tmp_path / "repo"
    shutil.copytree(ROOT / "scripts", repo / "scripts")
    (repo / "config/age").mkdir(parents=True)
    (repo / "config/age/recipients.txt").write_text(recipient + "\n")
    return repo


def test_scanner_blocks_plaintext_and_allows_archive(tmp_path):
    blocked = tmp_path / "blocked.paths"
    blocked.write_bytes(
        b"private/foo.txt\0private/handoffs/example.md\0private.tar\0"
        b"private.conflicts/foo\0"
    )
    allowed = tmp_path / "allowed.paths"
    allowed.write_bytes(b"private.tar.age\0")
    bad = subprocess.run(
        script(SCRIPTS / "private-archive-scan") + ["--paths-from", str(blocked)],
        cwd=ROOT,
    )
    assert bad.returncode == 1
    run(script(SCRIPTS / "private-archive-scan") + ["--paths-from", str(allowed)])


def test_encrypt_decrypt_recipients_and_atomic(tmp_path):
    id1, rec1 = age_identity(tmp_path / "a")
    id2, rec2 = age_identity(tmp_path / "b")
    repo = make_repo(tmp_path, f"{rec1}\n{rec2}")
    private = repo / "private"
    private.mkdir()
    (private / "note.txt").write_text("fixture secret\n")
    run(script(repo / "scripts/private-archive-encrypt"), cwd=repo)
    assert (repo / "private.tar.age").exists()
    assert not (repo / "private.tar").exists()
    shutil.rmtree(private)
    run(script(repo / "scripts/private-archive-decrypt") + ["--identity", str(id1)], cwd=repo)
    assert (private / "note.txt").read_text() == "fixture secret\n"
    shutil.rmtree(private)
    run(script(repo / "scripts/private-archive-decrypt") + ["--identity", str(id2)], cwd=repo)
    assert (private / "note.txt").read_text() == "fixture secret\n"
    proc = subprocess.run(
        script(repo / "scripts/private-archive-decrypt") + ["--identity", str(id2)],
        cwd=repo,
        text=True,
    )
    assert proc.returncode != 0


def test_status_reports_without_contents(tmp_path):
    _ident, rec = age_identity(tmp_path)
    repo = make_repo(tmp_path, rec)
    (repo / "private").mkdir()
    (repo / "private/secret.txt").write_text("do-not-print")
    run(script(repo / "scripts/private-archive-encrypt"), cwd=repo)
    proc = run(script(repo / "scripts/private-archive-status"), cwd=repo)
    assert "age: ok" in proc.stdout
    assert "do-not-print" not in proc.stdout


def test_unsafe_tar_rejected(tmp_path):
    sys.path.insert(0, str(SCRIPTS))
    from private_archive_lib import validate_tar

    tar_path = tmp_path / "bad.tar"
    with tarfile.open(tar_path, "w") as tf:
        info = tarfile.TarInfo("../escape.txt")
        info.size = 1
        import io

        tf.addfile(info, io.BytesIO(b"x"))
    try:
        validate_tar(tar_path)
    except ValueError:
        pass
    else:
        raise AssertionError("unsafe_tar not rejected")


def test_hook_install_and_staged_isolation(tmp_path):
    repo = tmp_path / "gitrepo"
    shutil.copytree(ROOT / "scripts", repo / "scripts")
    run(["git", "init"], cwd=repo)
    run(script(repo / "scripts/install-x-private-hook"), cwd=repo)
    hook = repo / ".git/hooks/pre-commit"
    assert hook.exists()
    assert "private-archive-scan" in (repo / "scripts/git-hooks/pre-commit-x-private").read_text()
    (repo / "private").mkdir()
    (repo / "private/foo.txt").write_text("fixture")
    run(["git", "add", "-f", "private/foo.txt"], cwd=repo)
    proc = subprocess.run(script(repo / "scripts/private-archive-scan") + ["--staged"], cwd=repo)
    assert proc.returncode == 1


def test_conflict_detection_conflict_resolve_conflict_cleanup_real_git(tmp_path):
    ident, rec = age_identity(tmp_path / "id")
    repo = make_repo(tmp_path, rec)
    run(["git", "init"], cwd=repo)
    run(["git", "config", "user.email", "t@example.com"], cwd=repo)
    run(["git", "config", "user.name", "Test"], cwd=repo)
    (repo / "private").mkdir()
    (repo / "private/base.txt").write_text("base")
    run(script(repo / "scripts/private-archive-encrypt"), cwd=repo)
    run(["git", "add", "private.tar.age", "scripts", "config"], cwd=repo)
    run(["git", "commit", "-m", "base"], cwd=repo)
    base_branch = run(["git", "branch", "--show-current"], cwd=repo).stdout.strip()
    run(["git", "checkout", "-b", "ours"], cwd=repo)
    (repo / "private/ours.txt").write_text("ours")
    run(script(repo / "scripts/private-archive-encrypt"), cwd=repo)
    run(["git", "commit", "-am", "ours"], cwd=repo)
    run(["git", "checkout", "-b", "theirs", base_branch], cwd=repo)
    (repo / "private/theirs.txt").write_text("theirs")
    run(script(repo / "scripts/private-archive-encrypt"), cwd=repo)
    run(["git", "commit", "-am", "theirs"], cwd=repo)
    subprocess.run(["git", "checkout", "ours"], cwd=repo, check=True)
    subprocess.run(["git", "merge", "theirs"], cwd=repo)
    assert run(["git", "ls-files", "-u", "--", "private.tar.age"], cwd=repo).stdout
    run(
        script(repo / "scripts/private-archive-conflict-resolve") + ["--identity", str(ident)],
        cwd=repo,
    )
    assert not (repo / "private.conflicts").exists()
