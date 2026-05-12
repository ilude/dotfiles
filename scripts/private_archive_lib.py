#!/usr/bin/env python3
"""Shared helpers for private per-file age encryption scripts."""

from __future__ import annotations

import os
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

ROOT = Path.cwd()
PRIVATE_DIR = Path("private")
ENCRYPTED_DIR = Path(".encrypted")
ARCHIVE = Path("private.tar.age")  # legacy compatibility name
RECIPIENTS = Path("config/age/recipients.txt")
BLOCKED_EXACT = {"private.tar", "private.tar.gz", "private-merge.tar", ".private.tar"}
BLOCKED_PREFIXES = ("private/", "private.conflicts/")


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, text=False, **kwargs)


def normalize(path: str) -> str:
    return str(PurePosixPath(path.replace("\\", "/"))).lstrip("./")


def nul_paths(data: bytes) -> list[str]:
    return [normalize(p.decode("utf-8", "replace")) for p in data.split(b"\0") if p]


def is_encrypted_age_path(path: str) -> bool:
    p = normalize(path)
    return (
        p.startswith(".encrypted/")
        and p.endswith(".age")
        and is_safe_relative(p[len(".encrypted/") : -4])
    )


def is_blocked_path(path: str) -> bool:
    p = normalize(path)
    if p == "private.tar.age" or is_encrypted_age_path(p):
        return False
    if p in BLOCKED_EXACT or any(p.startswith(prefix) for prefix in BLOCKED_PREFIXES):
        return True
    if p.startswith(".encrypted/") or p == ".encrypted":
        return True
    if p.startswith("private-encrypted/") and not p.endswith(".age"):
        return True
    return False


def staged_paths() -> list[str]:
    proc = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "-z"],
        check=True,
        stdout=subprocess.PIPE,
    )
    return nul_paths(proc.stdout)


def recipients() -> list[str]:
    if shutil.which("age") is None:
        raise SystemExit("missing required command: age")
    if not RECIPIENTS.exists():
        raise SystemExit(f"missing recipients file: {RECIPIENTS}")
    vals: list[str] = []
    for lineno, line in enumerate(RECIPIENTS.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if not line.startswith("age1"):
            raise SystemExit(f"malformed age recipient at {RECIPIENTS}:{lineno}")
        vals.append(line)
    if not vals:
        raise SystemExit("recipients file has no recipients")
    return vals


def is_safe_relative(path: str) -> bool:
    p = path.replace("\\", "/")
    posix = PurePosixPath(p)
    return bool(p) and not p.startswith(("/", "~")) and ":" not in p and ".." not in posix.parts


def private_files(private_dir: Path = PRIVATE_DIR) -> list[tuple[Path, str]]:
    if not private_dir.is_dir():
        raise SystemExit(f"missing private directory: {private_dir}")
    seen: dict[str, str] = {}
    files: list[tuple[Path, str]] = []
    for item in sorted(private_dir.rglob("*")):
        rel = item.relative_to(private_dir).as_posix()
        if item.is_symlink():
            raise SystemExit(f"refusing symlink in private data: {rel}")
        if not item.is_file():
            continue
        if not is_safe_relative(rel):
            raise SystemExit(f"unsafe private path: {rel}")
        folded = rel.casefold()
        if folded in seen and seen[folded] != rel:
            raise SystemExit(f"case-colliding private paths: {seen[folded]} and {rel}")
        seen[folded] = rel
        files.append((item, rel))
    return files


def encrypted_files(encrypted_dir: Path = ENCRYPTED_DIR) -> list[tuple[Path, str]]:
    if not encrypted_dir.exists():
        return []
    files: list[tuple[Path, str]] = []
    for item in sorted(encrypted_dir.rglob("*")):
        rel = item.relative_to(encrypted_dir).as_posix()
        if item.is_symlink():
            raise SystemExit(f"refusing symlink in encrypted data: {rel}")
        if not item.is_file():
            continue
        if not rel.endswith(".age") or not is_safe_relative(rel[:-4]):
            raise SystemExit(f"refusing non-age encrypted artifact: {ENCRYPTED_DIR / rel}")
        files.append((item, rel[:-4]))
    return files


def encrypt_file(src: Path, dest: Path, recs: list[str]) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["age"]
    for rec in recs:
        cmd.extend(["-r", rec])
    cmd.extend(["-o", str(dest), str(src)])
    run(cmd)


def sync_encrypt(private_dir: Path = PRIVATE_DIR, encrypted_dir: Path = ENCRYPTED_DIR) -> list[str]:
    files = private_files(private_dir)
    recs = recipients()
    parent = encrypted_dir.parent if encrypted_dir.parent != Path("") else Path(".")
    with tempfile.TemporaryDirectory(prefix="encrypted-sync-", dir=parent) as td:
        tmp_root = Path(td) / encrypted_dir.name
        written: list[str] = []
        for src, rel in files:
            out = tmp_root / f"{rel}.age"
            encrypt_file(src, out, recs)
            written.append(out.relative_to(tmp_root).as_posix())
        if encrypted_dir.exists():
            shutil.rmtree(encrypted_dir)
        tmp_root.rename(encrypted_dir)
        return written


def decrypt_file(src: Path, identity: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(["age", "-d", "-i", str(identity), "-o", str(dest), str(src)])


def sync_decrypt(
    identity: Path,
    encrypted_dir: Path = ENCRYPTED_DIR,
    output_dir: Path = PRIVATE_DIR,
    force: bool = False,
) -> list[str]:
    files = encrypted_files(encrypted_dir)
    if output_dir.exists() and not force:
        raise SystemExit(f"refusing to overwrite existing {output_dir}; use --force")
    with tempfile.TemporaryDirectory(prefix="private-decrypt-") as td:
        tmp_private = Path(td) / output_dir.name
        restored: list[str] = []
        for src, rel in files:
            if not is_safe_relative(rel):
                raise SystemExit(f"unsafe encrypted path: {rel}.age")
            decrypt_file(src, identity, tmp_private / rel)
            restored.append(rel)
        if output_dir.exists():
            backup = output_dir.with_name(output_dir.name + ".bak")
            if backup.exists():
                raise SystemExit(f"backup already exists: {backup}")
            output_dir.rename(backup)
        shutil.copytree(tmp_private, output_dir)
        return restored


# Legacy tar helpers retained for compatibility with older conflict tooling/tests.
def assert_safe_member(member: tarfile.TarInfo) -> None:
    name = member.name.replace("\\", "/")
    posix = PurePosixPath(name)
    if name.startswith("/") or ".." in posix.parts or name in {"", "."}:
        raise ValueError(f"unsafe tar member path: {member.name}")
    if member.issym() or member.islnk() or member.isdev():
        raise ValueError(f"unsafe tar member type: {member.name}")


def validate_tar(path: Path) -> None:
    with tarfile.open(path, "r") as tf:
        for member in tf.getmembers():
            assert_safe_member(member)


def atomic_replace(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    os.replace(src, dest)


def copy_tree_merge(src: Path, dst: Path) -> list[str]:
    conflicts: list[str] = []
    for item in src.rglob("*"):
        rel = item.relative_to(src)
        target = dst / rel
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif target.exists() and target.read_bytes() != item.read_bytes():
            conflicts.append(rel.as_posix())
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)
    return conflicts


def tempdir(prefix: str):
    return tempfile.TemporaryDirectory(prefix=prefix)
