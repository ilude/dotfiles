#!/usr/bin/env python3
"""Install the latest stable Forgejo CLI (fj) release on Windows or GNU/Linux."""

from __future__ import annotations

import argparse
import io
import json
import platform
import re
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

REPOSITORY = "https://codeberg.org/forgejo-contrib/forgejo-cli"
RELEASE_API = "https://codeberg.org/api/v1/repos/forgejo-contrib/forgejo-cli/releases/latest"


def release_asset(system: str, machine: str) -> tuple[str, str]:
    architecture = {"amd64": "x86_64", "arm64": "aarch64"}.get(machine.lower(), machine.lower())
    if system == "Windows" and architecture == "x86_64":
        return "forgejo-cli-x86_64-windows.zip", "fj.exe"
    if system == "Linux" and architecture in {"x86_64", "aarch64"}:
        return f"forgejo-cli-{architecture}-linux.tar.gz", "fj"
    raise RuntimeError(f"No upstream fj binary for {system}/{machine}; use Homebrew on macOS")


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "ilude-dotfiles-installer"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def installed_version(binary: Path) -> tuple[int, ...] | None:
    try:
        result = subprocess.run(
            [str(binary), "version"], capture_output=True, text=True, timeout=10, check=False
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    match = re.search(r"\bv?(\d+)\.(\d+)\.(\d+)\b", result.stdout)
    if result.returncode != 0 or match is None:
        return None
    return tuple(map(int, match.groups()))


def binary_from_archive(payload: bytes, asset: str, executable: str) -> bytes:
    if asset.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            matches = [
                entry
                for entry in archive.infolist()
                if not entry.is_dir() and PurePosixPath(entry.filename).name == executable
            ]
            if len(matches) != 1:
                raise RuntimeError(f"Expected one {executable} in {asset}")
            return archive.read(matches[0])
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        matches = [
            entry
            for entry in archive.getmembers()
            if entry.isfile() and PurePosixPath(entry.name).name == executable
        ]
        if len(matches) != 1:
            raise RuntimeError(f"Expected one {executable} in {asset}")
        stream = archive.extractfile(matches[0])
        assert stream is not None
        with stream:
            return stream.read()


def install(destination: Path) -> Path:
    asset, executable = release_asset(platform.system(), platform.machine())
    release = json.loads(fetch(RELEASE_API))
    tag = release.get("tag_name", "")
    if (
        not re.fullmatch(r"v\d+\.\d+\.\d+", tag)
        or release.get("prerelease")
        or release.get("draft")
    ):
        raise RuntimeError(f"Invalid stable fj release: {tag!r}")
    version = tuple(map(int, tag[1:].split(".")))
    if not any(entry.get("name") == asset for entry in release.get("assets", [])):
        raise RuntimeError(f"fj {tag} has no {asset} release asset")
    target = destination / executable
    current = installed_version(target) if target.is_file() else None
    if current is not None and current >= version:
        print(f"fj {'.'.join(map(str, current))}: already current at {target}")
        return target
    payload = fetch(f"{REPOSITORY}/releases/download/{tag}/{asset}")
    binary = binary_from_archive(payload, asset, executable)
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".fj-install-", dir=destination) as temporary:
        staged = Path(temporary) / executable
        staged.write_bytes(binary)
        staged.chmod(0o755)
        if installed_version(staged) != version:
            raise RuntimeError(f"Downloaded fj {tag} did not report the expected version")
        staged.replace(target)
    print(f"Installed fj {tag[1:]} at {target}")
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir", type=Path, default=Path.home() / ".local" / "bin")
    args = parser.parse_args()
    try:
        install(args.bin_dir.expanduser().resolve())
    except Exception as error:
        print(f"fj installation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
