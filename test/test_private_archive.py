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
        'if [ "$1 $2" = "scan --staged" ]; then\n'
        "  for path in $(git diff --cached --name-only); do\n"
        '    case "$path" in\n'
        "      private|private/*) echo unsafe staged path >&2; exit 3 ;;\n"
        "      .dolos/authorized_keys|.dolos/artifacts/private.tar.gz.age) ;;\n"
        "      .dolos/*) echo unsafe staged path >&2; exit 3 ;;\n"
        "    esac\n"
        "  done\n"
        "  echo dolos scan ok\n"
        "  exit 0\n"
        "fi\n"
        'if [ "$1" = "status" ]; then\n'
        '  if [ -f fake-status ]; then cat fake-status; exit 4; fi\n'
        "  if [ -d private ] && [ ! -f .dolos/artifacts/private.tar.gz.age ]; then\n"
        "    echo 'archive=private status=plain-changed plain=true artifact=false'\n"
        "    exit 4\n"
        "  fi\n"
        "  echo 'archive=private status=clean plain=true artifact=true'\n"
        "  exit 0\n"
        "fi\n"
        'if [ "$1 $2" = "pack private" ]; then\n'
        "  mkdir -p .dolos/artifacts\n"
        "  printf 'encrypted private archive\\n' > .dolos/artifacts/private.tar.gz.age\n"
        "  exit 0\n"
        "fi\n"
        "exit 2\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    git_init(repo)
    run(["git", "add", "scripts", ".gitignore", ".gitattributes"], cwd=repo)
    run(["git", "add", "-f", str(fake.relative_to(repo))], cwd=repo)
    run(["git", "commit", "-m", "base"], cwd=repo)
    hook_path = run(["git", "rev-parse", "--git-path", "hooks/pre-commit"], cwd=repo).stdout.strip()
    hook = repo / hook_path
    hook.parent.mkdir(parents=True, exist_ok=True)
    hook.write_text("#!/bin/sh\nscripts/git-hooks/pre-commit-x-private\n", encoding="utf-8")
    return repo


def test_hook_install_idempotent_auto_pack_and_unrelated_commit(tmp_path):
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
    args_log = (repo / "dolos-args.log").read_text(encoding="utf-8")
    assert "scan\n--staged\n" in args_log
    assert "pack\nprivate\n" not in args_log

    (repo / "private").mkdir()
    (repo / "private" / "secret.txt").write_text("CANARY_PRIVATE_SECRET\n", encoding="utf-8")
    (repo / "README.md").write_text("with private archive\n", encoding="utf-8")
    run(["git", "add", "README.md"], cwd=repo)
    run(["git", "commit", "-m", "pack private"], cwd=repo)
    args_log = (repo / "dolos-args.log").read_text(encoding="utf-8")
    assert "pack\nprivate\n--if-plain-changed\n" in args_log
    committed = run(["git", "show", "--name-only", "--format=", "HEAD"], cwd=repo).stdout
    assert ".dolos/artifacts/private.tar.gz.age" in committed

    run(["git", "rm", "--cached", ".dolos/artifacts/private.tar.gz.age"], cwd=repo)
    (repo / ".dolos" / "artifacts" / "private.tar.gz.age").unlink()
    run(["git", "add", "-f", "private/secret.txt"], cwd=repo)
    proc = run(["git", "commit", "-m", "plaintext"], cwd=repo, check=False)
    assert proc.returncode != 0
    assert not (repo / ".dolos" / "artifacts" / "private.tar.gz.age").exists()


@pytest.mark.parametrize("state", ["artifact-changed", "diverged", "untracked", "no-index"])
def test_hook_refuses_non_plaintext_states_without_packing(tmp_path, state):
    repo = make_hook_repo(tmp_path)
    (repo / "private").mkdir()
    (repo / "fake-status").write_text(
        f"archive=private status={state} plain=true artifact=true\n", encoding="utf-8"
    )
    result = run(["sh", "scripts/git-hooks/pre-commit-dolos"], cwd=repo, check=False)
    assert result.returncode == 4
    assert "refusing automatic packing" in result.stderr
    assert "pack\nprivate\n" not in (repo / "dolos-args.log").read_text()


def test_hook_install_from_nested_directory(tmp_path):
    repo = make_hook_repo(tmp_path)
    nested = repo / "nested/deep"
    nested.mkdir(parents=True)
    run(script(repo / "scripts/install-dolos-hook"), cwd=nested)
    hook = Path(run(
        ["git", "rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-commit"],
        cwd=repo,
    ).stdout.rstrip("\n"))
    assert "scripts/git-hooks/pre-commit-dolos" in hook.read_text()
    assert not (nested / ".git").exists()


def test_linked_worktree_commit_uses_path_dolos_and_skips_plaintext_status(tmp_path, monkeypatch):
    repo = make_hook_repo(tmp_path)
    run(script(repo / "scripts/install-dolos-hook"), cwd=repo)
    worktree = tmp_path / "worktree"
    run(["git", "worktree", "add", "-b", "worktree-test", str(worktree)], cwd=repo)
    local_dolos = worktree / "bin" / ("dolos.exe" if os.name == "nt" else "dolos")
    shared_bin = tmp_path / "shared-bin"
    shared_bin.mkdir()
    shutil.copy2(local_dolos, shared_bin / local_dolos.name)
    local_dolos.unlink()
    monkeypatch.setenv("PATH", str(shared_bin) + os.pathsep + os.environ["PATH"])

    (worktree / "README.md").write_text("worktree change\n", encoding="utf-8")
    run(["git", "add", "README.md"], cwd=worktree)
    run(["git", "add", "-u", str(local_dolos.relative_to(worktree))], cwd=worktree)
    run(["git", "commit", "-m", "worktree commit"], cwd=worktree)

    args_log = (worktree / "dolos-args.log").read_text(encoding="utf-8")
    assert "scan\n--staged\n" in args_log
    assert "status\n" not in args_log
    assert "pack\nprivate\n" not in args_log


@pytest.fixture(scope="module")
def real_dolos(tmp_path_factory):
    if not shutil.which("go") or not shutil.which("ssh-keygen"):
        pytest.skip("generated Dolos integration fixtures require Go and ssh-keygen")
    fixtures = tmp_path_factory.mktemp("dolos-fixtures")
    binary = fixtures / ("dolos.exe" if os.name == "nt" else "dolos")
    run(["go", "build", "-o", str(binary), "."], cwd=ROOT / "tools/dolos")
    key = fixtures / "fixture-key"
    run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(key)])
    return binary, key


def make_real_repo(tmp_path, real_dolos):
    binary, key = real_dolos
    repo = tmp_path / "source"
    repo.mkdir()
    git_init(repo)
    (repo / "scripts/git-hooks").mkdir(parents=True)
    for name in ("install-dolos-hook", "git-hooks/pre-commit-dolos"):
        shutil.copy2(SCRIPTS / name, repo / "scripts" / name)
    (repo / "bin").mkdir()
    shutil.copy2(binary, repo / "bin" / binary.name)
    (repo / ".gitignore").write_text("private/\nbin/\n", encoding="utf-8")
    (repo / "README.md").write_text("base\n", encoding="utf-8")
    run([str(binary), "init", "--key", str(key) + ".pub"], cwd=repo)
    (repo / "private").mkdir()
    (repo / "private/fixture.txt").write_text("generated old value\n", encoding="utf-8")
    run([str(binary), "pack", "private"], cwd=repo)
    run(["git", "add", "."], cwd=repo)
    run(["git", "commit", "-m", "base"], cwd=repo)
    run(script(repo / "scripts/install-dolos-hook"), cwd=repo)
    return repo


def test_real_dolos_pull_then_commit_preserves_newer_artifact(tmp_path, real_dolos):
    binary, key = real_dolos
    source = make_real_repo(tmp_path, real_dolos)
    clone = tmp_path / "clone"
    run(["git", "clone", str(source), str(clone)])
    run(["git", "config", "user.name", "Test"], cwd=clone)
    run(["git", "config", "user.email", "t@example.com"], cwd=clone)
    (clone / "bin").mkdir()
    shutil.copy2(binary, clone / "bin" / binary.name)
    run([str(binary), "unpack", "private", "--identity", str(key)], cwd=clone)
    run(script(clone / "scripts/install-dolos-hook"), cwd=clone)

    (source / "private/fixture.txt").write_text("generated new value\n", encoding="utf-8")
    run([str(binary), "pack", "private"], cwd=source)
    run(["git", "add", ".dolos/artifacts/private.tar.gz.age"], cwd=source)
    run(["git", "commit", "-m", "new artifact"], cwd=source)
    run(["git", "pull", "--ff-only"], cwd=clone)
    artifact = clone / ".dolos/artifacts/private.tar.gz.age"
    newer = artifact.read_bytes()
    (clone / "README.md").write_text("unrelated\n", encoding="utf-8")
    run(["git", "add", "README.md"], cwd=clone)
    status = run([str(binary), "status"], cwd=clone, check=False)
    assert status.returncode == 4 and "status=artifact-changed " in status.stdout
    commit = run(["git", "commit", "-m", "unrelated"], cwd=clone, check=False)
    assert commit.returncode != 0
    assert "refusing automatic packing" in commit.stderr
    assert artifact.read_bytes() == newer
    assert (clone / "private/fixture.txt").read_text() == "generated old value\n"
    assert run(["git", "diff", "--cached", "--name-only"], cwd=clone).stdout == "README.md\n"


def test_real_dolos_plaintext_auto_pack_and_alternate_index(tmp_path, real_dolos):
    binary, _ = real_dolos
    repo = make_real_repo(tmp_path, real_dolos)
    artifact = repo / ".dolos/artifacts/private.tar.gz.age"
    original = artifact.read_bytes()
    # A clean --only commit needs no pack and remains permitted.
    (repo / "README.md").write_text("clean pathspec\n", encoding="utf-8")
    run(["git", "commit", "--only", "README.md", "-m", "clean pathspec"], cwd=repo)
    (repo / "private/fixture.txt").write_text("generated changed value\n", encoding="utf-8")
    (repo / "README.md").write_text("changed pathspec\n", encoding="utf-8")
    refused = run(["git", "commit", "--only", "README.md", "-m", "partial"], cwd=repo, check=False)
    assert refused.returncode != 0
    assert "alternate index" in refused.stderr
    assert artifact.read_bytes() == original
    run(["git", "add", "README.md"], cwd=repo)
    run(["git", "commit", "-m", "full index"], cwd=repo)
    assert artifact.read_bytes() != original
    committed = run(["git", "show", "--name-only", "--format=", "HEAD"], cwd=repo).stdout
    assert ".dolos/artifacts/private.tar.gz.age" in committed
    assert run([str(binary), "status"], cwd=repo).returncode == 0


@pytest.mark.parametrize("commit_args", [["-a"], ["-i", "README.md"]], ids=["all", "include"])
def test_real_dolos_full_index_commit_auto_packs(tmp_path, real_dolos, commit_args):
    binary, _ = real_dolos
    repo = make_real_repo(tmp_path, real_dolos)
    artifact = repo / ".dolos/artifacts/private.tar.gz.age"
    original = artifact.read_bytes()
    (repo / "private/fixture.txt").write_text("generated full-index change\n", encoding="utf-8")
    (repo / "README.md").write_text("full-index commit\n", encoding="utf-8")

    run(["git", "commit", *commit_args, "-m", "full index auto-pack"], cwd=repo)

    assert artifact.read_bytes() != original
    committed = run(["git", "show", "--name-only", "--format=", "HEAD"], cwd=repo).stdout
    assert "README.md\n" in committed
    assert ".dolos/artifacts/private.tar.gz.age\n" in committed
    assert run(["git", "status", "--porcelain"], cwd=repo).stdout == ""
    assert run([str(binary), "status"], cwd=repo).returncode == 0


def test_evidence_hygiene():
    if not EVIDENCE.exists():
        return
    needle_re = (
        r"CANARY_PRIVATE_SECRET|BEGIN OPENSSH|AGE-SECRET-KEY|PRIVATE KEY|"
        r"do-not-print|fixture secret"
    )
    proc = run(["grep", "-R", "-nE", needle_re, str(EVIDENCE)], check=False)
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
