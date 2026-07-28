#!/usr/bin/env python3
"""Install the pinned Bitwarden Secrets Manager CLI for the current platform."""

from __future__ import annotations

import argparse
import hashlib
import os
import platform
import shutil
import stat
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

VERSION = "1.0.0"
RELEASE_BASE = f"https://github.com/bitwarden/sdk-sm/releases/download/bws-v{VERSION}"
ASSETS = {
    ("linux", "x86_64"): (
        f"bws-x86_64-unknown-linux-gnu-{VERSION}.zip",
        "9077fb7b336a62abc8194728fea8753afad8b0baa3a18723fc05fc02fdb53568",
    ),
    ("linux", "aarch64"): (
        f"bws-aarch64-unknown-linux-gnu-{VERSION}.zip",
        "20a3dcb9e3ce7716a1dc3c0e1c76cea9d5e2bf75094cbb5aad54ced4304929cb",
    ),
    ("darwin", "x86_64"): (
        f"bws-macos-universal-{VERSION}.zip",
        "5ece899717ccd3abdb1a40fff5e34e759d8e95061845d289df31957f7bc700b0",
    ),
    ("darwin", "aarch64"): (
        f"bws-macos-universal-{VERSION}.zip",
        "5ece899717ccd3abdb1a40fff5e34e759d8e95061845d289df31957f7bc700b0",
    ),
    ("windows", "x86_64"): (
        f"bws-x86_64-pc-windows-msvc-{VERSION}.zip",
        "69b8d0fb2facc8cec4dd2b8157a3496ecaaa376ee1b0fd822012192ce7437505",
    ),
    ("windows", "aarch64"): (
        f"bws-aarch64-pc-windows-msvc-{VERSION}.zip",
        "457b706961d7949202e74c799d465097462161171c255646513ea76add60d169",
    ),
}


def normalized_machine(machine: str) -> str:
    value = machine.lower()
    if value in {"amd64", "x64", "x86_64"}:
        return "x86_64"
    if value in {"arm64", "aarch64"}:
        return "aarch64"
    return value


def release_asset(system: str, machine: str) -> tuple[str, str]:
    key = (system.lower(), normalized_machine(machine))
    if key not in ASSETS:
        raise RuntimeError(f"unsupported BWS platform: {key[0]}/{key[1]}")
    return ASSETS[key]


def installed_version(binary: str) -> str | None:
    try:
        result = subprocess.run(
            [binary, "--version"], capture_output=True, text=True, timeout=10, check=False
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    fields = result.stdout.strip().split()
    return fields[-1] if fields else None


def install(target_dir: Path, force: bool = False) -> Path:
    executable = "bws.exe" if platform.system().lower() == "windows" else "bws"
    target = target_dir / executable
    discovered = shutil.which("bws")
    if not force and discovered and installed_version(discovered) == VERSION:
        print(f"bws {VERSION}: already installed")
        return Path(discovered)

    asset, expected_sha256 = release_asset(platform.system(), platform.machine())
    with tempfile.TemporaryDirectory(prefix="bws-install-") as temporary:
        archive = Path(temporary) / asset
        request = urllib.request.Request(
            f"{RELEASE_BASE}/{asset}", headers={"User-Agent": "dotfiles-bws-install"}
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            archive.write_bytes(response.read())
        actual_sha256 = hashlib.sha256(archive.read_bytes()).hexdigest()
        if actual_sha256 != expected_sha256:
            raise RuntimeError("BWS archive checksum verification failed")
        with zipfile.ZipFile(archive) as bundle:
            member = next(
                (name for name in bundle.namelist() if Path(name).name == executable),
                None,
            )
            if member is None:
                raise RuntimeError("BWS archive does not contain the expected executable")
            extracted = Path(temporary) / executable
            extracted.write_bytes(bundle.read(member))
        extracted.chmod(extracted.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        target_dir.mkdir(parents=True, exist_ok=True)
        os.replace(extracted, target)
    print(f"bws {VERSION}: installed to {target}")
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--target-dir", type=Path, default=Path.home() / ".local" / "bin")
    args = parser.parse_args(argv)
    install(args.target_dir, args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
