"""Upstream fj release selection and per-user installation behavior."""

import importlib.util
import io
import json
import subprocess
import tarfile
import zipfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/install-forgejo-cli.py"
SPEC = importlib.util.spec_from_file_location("install_forgejo_cli", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


@pytest.mark.parametrize(
    ("system", "machine", "asset", "executable"),
    [
        ("Windows", "AMD64", "forgejo-cli-x86_64-windows.zip", "fj.exe"),
        ("Linux", "x86_64", "forgejo-cli-x86_64-linux.tar.gz", "fj"),
        ("Linux", "aarch64", "forgejo-cli-aarch64-linux.tar.gz", "fj"),
        ("Linux", "arm64", "forgejo-cli-aarch64-linux.tar.gz", "fj"),
    ],
)
def test_selects_published_release_assets(system, machine, asset, executable):
    assert MODULE.release_asset(system, machine) == (asset, executable)


@pytest.mark.parametrize(("system", "machine"), [("Darwin", "arm64"), ("Windows", "ARM64")])
def test_does_not_guess_unpublished_assets(system, machine):
    with pytest.raises(RuntimeError, match="No upstream fj binary"):
        MODULE.release_asset(system, machine)


def test_uses_fj_version_subcommand_and_parses_v_prefix(tmp_path, monkeypatch):
    binary = tmp_path / "fj.exe"

    def run(args, **_kwargs):
        assert args == [str(binary), "version"]
        return subprocess.CompletedProcess(args, 0, stdout="fj v0.7.0\n", stderr="")

    monkeypatch.setattr(MODULE.subprocess, "run", run)
    assert MODULE.installed_version(binary) == (0, 7, 0)


def archive_payload():
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("release/fj.exe", b"new binary")
        archive.writestr("release/README.md", b"not installed")
    return payload.getvalue()


def test_reads_only_executable_from_zip_and_tar():
    assert MODULE.binary_from_archive(archive_payload(), "release.zip", "fj.exe") == b"new binary"
    payload = io.BytesIO()
    with tarfile.open(fileobj=payload, mode="w:gz") as archive:
        entry = tarfile.TarInfo("release/fj")
        entry.size = 3
        archive.addfile(entry, io.BytesIO(b"elf"))
    assert MODULE.binary_from_archive(payload.getvalue(), "release.tar.gz", "fj") == b"elf"


def test_install_updates_once_and_retains_existing_binary_on_validation_failure(
    tmp_path, monkeypatch
):
    release = {"tag_name": "v0.7.0", "assets": [{"name": "forgejo-cli-x86_64-windows.zip"}]}
    downloads = []

    def fetch(url):
        downloads.append(url)
        return json.dumps(release).encode() if url == MODULE.RELEASE_API else archive_payload()

    monkeypatch.setattr(MODULE.platform, "system", lambda: "Windows")
    monkeypatch.setattr(MODULE.platform, "machine", lambda: "AMD64")
    monkeypatch.setattr(MODULE, "fetch", fetch)
    monkeypatch.setattr(MODULE, "installed_version", lambda _binary: (0, 7, 0))
    target = MODULE.install(tmp_path)
    assert target.read_bytes() == b"new binary"
    assert MODULE.install(tmp_path) == target
    assert len([url for url in downloads if url != MODULE.RELEASE_API]) == 1
    assert sorted(p.name for p in tmp_path.iterdir()) == ["fj.exe"]

    release["tag_name"] = "v0.8.0"
    with pytest.raises(RuntimeError, match="expected version"):
        MODULE.install(tmp_path)
    assert target.read_bytes() == b"new binary"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["fj.exe"]
