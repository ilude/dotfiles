#!/usr/bin/env python3
"""Restore and validate the local configuration required by Onclave."""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import time
from collections.abc import Mapping
from pathlib import Path

REQUIRED_SECRET_KEYS = ("BITWARDEN_ACCESS_KEY",)


class BootstrapError(RuntimeError):
    """Raised when Onclave bootstrap cannot produce a usable configuration."""


def parse_exported_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        key, separator, value = line.partition("=")
        if not separator:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key.strip()] = value
    return values


def identity_candidates(home: Path, environment: Mapping[str, str]) -> list[Path]:
    candidates: list[Path] = []
    explicit = environment.get("DOLOS_IDENTITY", "").strip()
    if explicit:
        candidates.append(Path(explicit).expanduser())
    candidates.extend(
        [
            home / ".ssh" / "id_ed25519-personal",
            home / ".ssh" / "id_ed25519",
        ]
    )
    return candidates


def find_go() -> str | None:
    discovered = shutil.which("go")
    if discovered:
        return discovered
    if platform.system().lower() == "windows":
        candidate = (
            Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Go" / "bin" / "go.exe"
        )
        if candidate.is_file():
            return str(candidate)
    return None


def dolos_target(repo_root: Path) -> Path:
    executable = "dolos.exe" if platform.system().lower() == "windows" else "dolos"
    return repo_root / "bin" / executable


def build_dolos(repo_root: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    go = find_go()
    if go:
        subprocess.run(
            [go, "build", "-o", str(target), "."],
            cwd=repo_root / "tools" / "dolos",
            check=True,
        )
        return

    docker = shutil.which("docker")
    bash = shutil.which("bash")
    if docker and bash:
        machine = platform.machine().lower()
        arch = "arm64" if machine in {"arm64", "aarch64"} else "amd64"
        system = "windows" if platform.system().lower() == "windows" else "linux"
        environment = {
            **os.environ,
            "GOOS": system,
            "GOARCH": arch,
            "BINARY": target.name,
        }
        subprocess.run(
            [bash, str(repo_root / "tools" / "dolos" / "build.sh")],
            cwd=repo_root,
            env=environment,
            check=True,
        )
        return

    raise BootstrapError("cannot build Dolos: install Go or provide a running Docker CLI")


def run_unpack(dolos: Path, repo_root: Path, identity: Path) -> None:
    command = [str(dolos), "unpack", "private", "--identity", str(identity)]
    result = subprocess.run(command, cwd=repo_root, text=True, capture_output=True, check=False)
    if result.returncode == 0:
        return
    detail = (result.stderr or result.stdout).strip()
    if platform.system().lower() == "windows" and "access is denied" in detail.lower():
        time.sleep(0.25)
        result = subprocess.run(command, cwd=repo_root, text=True, capture_output=True, check=False)
        if result.returncode == 0:
            return
        detail = (result.stderr or result.stdout).strip()
    raise BootstrapError(f"Dolos could not restore private/: {detail or 'unknown error'}")


def restore_private(
    repo_root: Path,
    home: Path,
    environment: Mapping[str, str] = os.environ,
) -> Path:
    secrets_file = repo_root / "private" / "secrets.env"
    if secrets_file.is_file():
        return secrets_file

    private_dir = repo_root / "private"
    if private_dir.exists():
        raise BootstrapError(
            "private/ exists but private/secrets.env is missing; refusing to overwrite it"
        )

    archive = repo_root / ".dolos" / "artifacts" / "private.tar.gz.age"
    if not archive.is_file():
        raise BootstrapError("private/secrets.env and the encrypted private archive are missing")

    identity = next(
        (path for path in identity_candidates(home, environment) if path.is_file()), None
    )
    if identity is None:
        raise BootstrapError(
            "no Dolos identity found; set DOLOS_IDENTITY or install ~/.ssh/id_ed25519-personal"
        )

    dolos = dolos_target(repo_root)
    if not dolos.is_file():
        build_dolos(repo_root, dolos)
    run_unpack(dolos, repo_root, identity)
    if not secrets_file.is_file():
        raise BootstrapError("Dolos restored private/ without private/secrets.env")
    return secrets_file


def validate_secrets(path: Path) -> None:
    values = parse_exported_env(path)
    missing = [key for key in REQUIRED_SECRET_KEYS if not values.get(key, "").strip()]
    if missing:
        raise BootstrapError(f"private/secrets.env is missing required keys: {', '.join(missing)}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument("--home", type=Path, default=Path.home())
    args = parser.parse_args(argv)

    try:
        secrets_file = restore_private(args.repo_root.resolve(), args.home.resolve())
        validate_secrets(secrets_file)
    except (BootstrapError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, f"Onclave bootstrap failed: {error}\n")

    print("Onclave bootstrap: private configuration is ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
