"""Platform selection contracts for the pinned BWS installer."""

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "install-bws.py"
SPEC = importlib.util.spec_from_file_location("install_bws", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


@pytest.mark.parametrize(
    ("system", "machine", "asset_fragment"),
    [
        ("Linux", "x86_64", "x86_64-unknown-linux-gnu"),
        ("Linux", "arm64", "aarch64-unknown-linux-gnu"),
        ("Darwin", "x86_64", "macos-universal"),
        ("Darwin", "arm64", "macos-universal"),
        ("Windows", "AMD64", "x86_64-pc-windows-msvc"),
        ("Windows", "ARM64", "aarch64-pc-windows-msvc"),
    ],
)
def test_release_asset_supports_dotfiles_platforms(
    system: str, machine: str, asset_fragment: str
) -> None:
    asset, checksum = MODULE.release_asset(system, machine)

    assert asset_fragment in asset
    assert len(checksum) == 64


def test_release_asset_rejects_unknown_platform() -> None:
    with pytest.raises(RuntimeError, match="unsupported BWS platform"):
        MODULE.release_asset("Plan9", "mips")
