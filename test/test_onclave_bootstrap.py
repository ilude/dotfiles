"""Contracts for restoring the Onclave private bootstrap configuration."""

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "onclave-bootstrap.py"
SPEC = importlib.util.spec_from_file_location("onclave_bootstrap", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_parse_exported_env_supports_shell_exports(tmp_path: Path) -> None:
    secrets = tmp_path / "secrets.env"
    secrets.write_text(
        "# private values\nexport BITWARDEN_ACCESS_KEY='token-value'\nPLAIN=value\n",
        encoding="utf-8",
    )

    assert MODULE.parse_exported_env(secrets) == {
        "BITWARDEN_ACCESS_KEY": "token-value",
        "PLAIN": "value",
    }


def test_restore_private_uses_personal_identity_and_dolos(tmp_path: Path, monkeypatch) -> None:
    repo = tmp_path / "repo"
    home = tmp_path / "home"
    archive = repo / ".dolos" / "artifacts" / "private.tar.gz.age"
    identity = home / ".ssh" / "id_ed25519-personal"
    archive.parent.mkdir(parents=True)
    archive.write_bytes(b"encrypted")
    identity.parent.mkdir(parents=True)
    identity.write_text("identity", encoding="utf-8")
    calls: list[tuple[Path, Path, Path]] = []

    def fake_build(_repo: Path, target: Path) -> None:
        target.parent.mkdir(parents=True)
        target.write_text("dolos", encoding="utf-8")

    def fake_unpack(dolos: Path, root: Path, selected_identity: Path) -> None:
        calls.append((dolos, root, selected_identity))
        secrets = root / "private" / "secrets.env"
        secrets.parent.mkdir()
        secrets.write_text("BITWARDEN_ACCESS_KEY=token\n", encoding="utf-8")

    monkeypatch.setattr(MODULE, "build_dolos", fake_build)
    monkeypatch.setattr(MODULE, "run_unpack", fake_unpack)

    restored = MODULE.restore_private(repo, home, {})

    assert restored == repo / "private" / "secrets.env"
    assert calls == [(MODULE.dolos_target(repo), repo, identity)]


def test_restore_private_refuses_existing_incomplete_private_dir(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    (repo / "private").mkdir(parents=True)

    with pytest.raises(MODULE.BootstrapError, match="refusing to overwrite"):
        MODULE.restore_private(repo, tmp_path / "home", {})


def test_validate_secrets_requires_bitwarden_access_key(tmp_path: Path) -> None:
    secrets = tmp_path / "secrets.env"
    secrets.write_text(
        "ONCLAVE_AMQP_ENDPOINT=amqp://rabbitmq.ilude.com/onclave\n", encoding="utf-8"
    )

    with pytest.raises(MODULE.BootstrapError, match="BITWARDEN_ACCESS_KEY"):
        MODULE.validate_secrets(secrets)
