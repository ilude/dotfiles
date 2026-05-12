#!/usr/bin/env python3
"""Shared helpers for private archive encryption scripts."""
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
ARCHIVE = Path("private.tar.age")
RECIPIENTS = Path("config/age/recipients.txt")
BLOCKED_EXACT = {"private.tar", "private.tar.gz", "private-merge.tar", ".private.tar"}
BLOCKED_PREFIXES = ("private/", "private.conflicts/")


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, text=False, **kwargs)


def normalize(path: str) -> str:
    return str(PurePosixPath(path.replace("\\", "/"))).lstrip("./")


def nul_paths(data: bytes) -> list[str]:
    return [normalize(p.decode("utf-8", "replace")) for p in data.split(b"\0") if p]


def is_blocked_path(path: str) -> bool:
    p = normalize(path)
    if p == "private.tar.age":
        return False
    if p.startswith(".encrypted/") and p.endswith(".age"):
        return False
    if p in BLOCKED_EXACT or any(p.startswith(prefix) for prefix in BLOCKED_PREFIXES):
        return True
    if p.startswith(".encrypted/") and not p.endswith(".age"):
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


def read_recipients() -> list[str]:
    if not RECIPIENTS.exists():
        return []
    vals = []
    for line in RECIPIENTS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            vals.append(line)
    return vals


def recipients_configured() -> bool:
    return bool(read_recipients())


def recipients() -> list[str]:
    if not RECIPIENTS.exists():
        raise SystemExit(f"missing recipients file: {RECIPIENTS}")
    vals = read_recipients()
    if not vals:
        raise SystemExit("recipients file has no recipients")
    return vals


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


def make_tar(src: Path, dest: Path) -> None:
    with tarfile.open(dest, "w") as tf:
        for item in sorted(src.rglob("*")):
            arc = item.relative_to(src).as_posix()
            if item.is_symlink():
                raise SystemExit(f"refusing symlink in private archive: {arc}")
            tf.add(item, arcname=arc, recursive=False)


def encrypt_tar(tar_path: Path, out_path: Path = ARCHIVE) -> None:
    cmd = ["age"]
    for rec in recipients():
        cmd.extend(["-r", rec])
    cmd.extend(["-o", str(out_path), str(tar_path)])
    run(cmd)


def encrypt_file(input_path: Path, out_path: Path) -> None:
    cmd = ["age"]
    for rec in recipients():
        cmd.extend(["-r", rec])
    cmd.extend(["-o", str(out_path), str(input_path)])
    run(cmd)


def decrypt_file(age_path: Path, identity: Path, out_path: Path) -> None:
    run(["age", "-d", "-i", str(identity), "-o", str(out_path), str(age_path)])


def decrypt_to_tar(age_path: Path, identity: Path, tar_path: Path) -> None:
    run(["age", "-d", "-i", str(identity), "-o", str(tar_path), str(age_path)])
    validate_tar(tar_path)


def extract_tar(tar_path: Path, dest: Path) -> None:
    validate_tar(tar_path)
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar_path, "r") as tf:
        for member in tf.getmembers():
            assert_safe_member(member)
            target = dest / member.name
            resolved = target.resolve()
            if dest.resolve() not in [resolved, *resolved.parents]:
                raise ValueError(f"unsafe extraction target: {member.name}")
        tf.extractall(dest)


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
