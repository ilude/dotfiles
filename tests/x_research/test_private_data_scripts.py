import shutil
import subprocess
from pathlib import Path


def test_scanner_rejects_private_paths(tmp_path: Path) -> None:
    fixture = tmp_path / "paths.bin"
    fixture.write_bytes(b"private/x/test.json\0private-encrypted/x/test.json\0ok.txt\0")
    proc = subprocess.run(
        ["python", "scripts/x-private-scan", "--paths-from", str(fixture)],
        text=True,
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 1
    assert "private/x/test.json" in proc.stderr


def test_scanner_allows_age_paths(tmp_path: Path) -> None:
    fixture = tmp_path / "paths.bin"
    fixture.write_bytes(b"private-encrypted/x/test.json.age\0")
    proc = subprocess.run(
        ["python", "scripts/x-private-scan", "--paths-from", str(fixture)],
        text=True,
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 0


def test_age_round_trip_missing_recipients_fails(tmp_path: Path) -> None:
    plain = tmp_path / "plain.txt"
    out = tmp_path / "out.age"
    plain.write_text("secret", encoding="utf-8")
    proc = subprocess.run(
        [
            "python",
            "scripts/x-private-encrypt",
            str(plain),
            str(out),
            "--recipients",
            str(tmp_path / "missing"),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 1


def test_age_round_trip(tmp_path: Path) -> None:
    if shutil.which("age") is None or shutil.which("age-keygen") is None:
        return
    identity = tmp_path / "identity.txt"
    keygen = subprocess.run(
        ["age-keygen", "-o", str(identity)], text=True, capture_output=True, check=True
    )
    recipient = [line for line in keygen.stderr.splitlines() if line.startswith("Public key:")][
        0
    ].split()[-1]
    recipients = tmp_path / "recipients.txt"
    recipients.write_text(recipient + "\n", encoding="utf-8")
    plain = tmp_path / "plain.txt"
    plain.write_text("secret", encoding="utf-8")
    encrypted = tmp_path / "plain.txt.age"
    decrypted = tmp_path / "decrypted.txt"
    assert (
        subprocess.run(
            [
                "python",
                "scripts/x-private-encrypt",
                str(plain),
                str(encrypted),
                "--recipients",
                str(recipients),
            ],
            check=False,
        ).returncode
        == 0
    )
    assert (
        subprocess.run(
            [
                "python",
                "scripts/x-private-decrypt",
                str(encrypted),
                str(decrypted),
                "--identity",
                str(identity),
            ],
            check=False,
        ).returncode
        == 0
    )
    assert decrypted.read_text(encoding="utf-8") == "secret"
