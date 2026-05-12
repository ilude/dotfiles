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
        cmd, cwd=cwd, env=env, text=True, capture_output=True, check=True, **kwargs
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
    shutil.copy2(ROOT / ".gitignore", repo / ".gitignore")
    shutil.copy2(ROOT / ".gitattributes", repo / ".gitattributes")
    (repo / "config/age").mkdir(parents=True)
    (repo / "config/age/recipients.txt").write_text(recipient + "\n")
    return repo


def git_init(repo: Path) -> None:
    run(["git", "init"], cwd=repo)
    run(["git", "config", "user.email", "t@example.com"], cwd=repo)
    run(["git", "config", "user.name", "Test"], cwd=repo)


def test_scanner_blocks_plaintext_and_allows_encrypted_age(tmp_path):
    blocked = tmp_path / "blocked.paths"
    blocked.write_bytes(
        b"private/foo.txt\0private/handoffs/example.md\0private.tar\0"
        b"private.conflicts/foo\0.encrypted/plain.txt\0"
    )
    allowed = tmp_path / "allowed.paths"
    allowed.write_bytes(b"private.tar.age\0.encrypted/handoffs/example.md.age\0")
    bad = subprocess.run(
        script(SCRIPTS / "private-archive-scan") + ["--paths-from", str(blocked)], cwd=ROOT
    )
    assert bad.returncode == 1
    run(script(SCRIPTS / "private-archive-scan") + ["--paths-from", str(allowed)])


def test_encrypt_decrypt_per_file_no_plaintext_and_delete_rename_sync(tmp_path):
    ident, rec = age_identity(tmp_path / "id")
    repo = make_repo(tmp_path, rec)
    private = repo / "private/a"
    private.mkdir(parents=True)
    (private / "old.txt").write_text("fixture secret\n")
    run(script(repo / "scripts/private-archive-encrypt"), cwd=repo)
    old_age = repo / ".encrypted/a/old.txt.age"
    assert old_age.exists()
    assert b"fixture secret" not in old_age.read_bytes()
    decrypted = run(["age", "-d", "-i", str(ident), str(old_age)], cwd=repo).stdout
    assert decrypted == "fixture secret\n"
    (private / "old.txt").rename(private / "new.txt")
    (private / "new.txt").write_text("renamed secret\n")
    run(script(repo / "scripts/private-archive-encrypt"), cwd=repo)
    assert not old_age.exists()
    new_age = repo / ".encrypted/a/new.txt.age"
    assert new_age.exists()
    assert run(["age", "-d", "-i", str(ident), str(new_age)], cwd=repo).stdout == "renamed secret\n"
    shutil.rmtree(repo / "private")
    run(script(repo / "scripts/private-archive-decrypt") + ["--identity", str(ident)], cwd=repo)
    assert (repo / "private/a/new.txt").read_text() == "renamed secret\n"


def test_encrypt_failure_invalid_malformed_recipient_preserves_existing_output(tmp_path):
    ident, rec = age_identity(tmp_path / "id")
    repo = make_repo(tmp_path, rec)
    (repo / "private").mkdir()
    (repo / "private/good.txt").write_text("good\n")
    run(script(repo / "scripts/private-archive-encrypt"), cwd=repo)
    before = sorted(p.relative_to(repo).as_posix() for p in (repo / ".encrypted").rglob("*"))
    (repo / "config/age/recipients.txt").write_text("not-an-age-recipient\n")
    (repo / "private/bad.txt").write_text("bad\n")
    proc = subprocess.run(
        script(repo / "scripts/private-archive-encrypt"), cwd=repo, text=True, capture_output=True
    )
    assert proc.returncode != 0
    assert "malformed" in proc.stderr or "malformed" in proc.stdout
    after = sorted(p.relative_to(repo).as_posix() for p in (repo / ".encrypted").rglob("*"))
    assert before == after
    assert (
        run(["age", "-d", "-i", str(ident), str(repo / ".encrypted/good.txt.age")], cwd=repo).stdout
        == "good\n"
    )


def test_symlink_traversal_duplicate_and_non_age_safety(tmp_path):
    sys.path.insert(0, str(SCRIPTS))
    from private_archive_lib import is_safe_relative

    assert not is_safe_relative("../escape")
    assert not is_safe_relative("C:/escape")
    _ident, rec = age_identity(tmp_path / "id")
    repo = make_repo(tmp_path, rec)
    (repo / "private").mkdir()
    (repo / "private/target.txt").write_text("x")
    (repo / "private/link.txt").symlink_to(repo / "private/target.txt")
    proc = subprocess.run(
        script(repo / "scripts/private-archive-encrypt"), cwd=repo, text=True, capture_output=True
    )
    assert proc.returncode != 0
    assert "symlink" in proc.stderr or "symlink" in proc.stdout
    (repo / "private/link.txt").unlink()
    (repo / ".encrypted").mkdir()
    (repo / ".encrypted/plaintext.txt").write_text("nope")
    proc = subprocess.run(
        script(repo / "scripts/private-archive-status"), cwd=repo, text=True, capture_output=True
    )
    assert proc.returncode != 0
    assert "non-age" in proc.stdout


def test_status_reports_without_contents(tmp_path):
    _ident, rec = age_identity(tmp_path)
    repo = make_repo(tmp_path, rec)
    (repo / "private").mkdir()
    (repo / "private/secret.txt").write_text("do-not-print")
    run(script(repo / "scripts/private-archive-encrypt"), cwd=repo)
    proc = run(script(repo / "scripts/private-archive-status"), cwd=repo)
    assert "age: ok" in proc.stdout
    assert "encrypted_files: 1" in proc.stdout
    assert "do-not-print" not in proc.stdout


def test_hook_install_linked_worktree_and_real_commit_blocks_plaintext(tmp_path):
    _ident, rec = age_identity(tmp_path / "id")
    main = make_repo(tmp_path, rec)
    git_init(main)
    run(["git", "add", "scripts", "config", ".gitignore", ".gitattributes"], cwd=main)
    run(["git", "commit", "-m", "base"], cwd=main)
    wt = tmp_path / "linked"
    run(["git", "worktree", "add", str(wt), "-b", "linked-test"], cwd=main)
    run(script(wt / "scripts/install-x-private-hook") + ["--dry-run"], cwd=wt)
    run(script(wt / "scripts/install-x-private-hook"), cwd=wt)
    hook_path = run(["git", "rev-parse", "--git-path", "hooks/pre-commit"], cwd=wt).stdout.strip()
    hook = wt / hook_path if not Path(hook_path).is_absolute() else Path(hook_path)
    assert hook.exists()
    assert "scripts/git-hooks/pre-commit-x-private" in hook.read_text()
    (wt / "private/handoffs").mkdir(parents=True)
    (wt / "private/handoffs/example.md").write_text("secret handoff\n")
    run(["git", "add", "-f", "private/handoffs/example.md"], cwd=wt)
    proc = subprocess.run(
        ["git", "commit", "-m", "plaintext"], cwd=wt, text=True, capture_output=True
    )
    assert proc.returncode != 0
    run(["git", "reset"], cwd=wt)
    run(script(wt / "scripts/private-archive-encrypt"), cwd=wt)
    run(["git", "add", ".encrypted/handoffs/example.md.age"], cwd=wt)
    run(["git", "commit", "-m", "encrypted"], cwd=wt)
    tree = run(["git", "ls-tree", "-r", "--name-only", "HEAD"], cwd=wt).stdout
    assert ".encrypted/handoffs/example.md.age" in tree
    assert "private/handoffs/example.md" not in tree


def test_independent_private_file_merge_has_no_conflict(tmp_path):
    _ident, rec = age_identity(tmp_path / "id")
    repo = make_repo(tmp_path, rec)
    git_init(repo)
    run(["git", "add", "scripts", "config", ".gitignore", ".gitattributes"], cwd=repo)
    run(["git", "commit", "-m", "base"], cwd=repo)
    base_branch = run(["git", "branch", "--show-current"], cwd=repo).stdout.strip()
    run(["git", "checkout", "-b", "a"], cwd=repo)
    (repo / "private").mkdir()
    (repo / "private/a.txt").write_text("a")
    run(script(repo / "scripts/private-archive-encrypt"), cwd=repo)
    run(["git", "add", ".encrypted/a.txt.age"], cwd=repo)
    run(["git", "commit", "-m", "a"], cwd=repo)
    run(["git", "checkout", "-b", "b", base_branch], cwd=repo)
    shutil.rmtree(repo / "private")
    (repo / "private").mkdir()
    (repo / "private/b.txt").write_text("b")
    run(script(repo / "scripts/private-archive-encrypt"), cwd=repo)
    run(["git", "add", ".encrypted/b.txt.age"], cwd=repo)
    run(["git", "commit", "-m", "b"], cwd=repo)
    run(["git", "checkout", "a"], cwd=repo)
    run(["git", "merge", "b"], cwd=repo)
    assert (repo / ".encrypted/a.txt.age").exists()
    assert (repo / ".encrypted/b.txt.age").exists()
    assert not run(["git", "ls-files", "-u"], cwd=repo).stdout


def test_unsafe_tar_rejected_legacy_compatibility(tmp_path):
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
