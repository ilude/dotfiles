from __future__ import annotations

import json
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "brave-tab-capture"


def command(command_id: int, body: bytes) -> bytes:
    return struct.pack("<H", len(body) + 1) + bytes([command_id]) + body


def aligned(data: bytes) -> bytes:
    return data + (b"\x00" * ((4 - (len(data) % 4)) % 4))


def chromium_string(value: str, encoding: str = "utf-8") -> bytes:
    if encoding == "utf-16le":
        encoded = value.encode(encoding)
        length = len(value)
    else:
        encoded = value.encode(encoding)
        length = len(encoded)
    return struct.pack("<I", length) + aligned(encoded)


def update_navigation(tab_id: int, nav_index: int, url: str, title: str) -> bytes:
    body = (
        struct.pack("<III", 0, tab_id, nav_index)
        + chromium_string(url)
        + chromium_string(title, "utf-16le")
    )
    return command(6, body)


def write_session(path: Path) -> None:
    data = b"SNSS" + struct.pack("<I", 1)
    data += command(0, struct.pack("<II", 9, 101))
    data += command(2, struct.pack("<II", 101, 0))
    data += update_navigation(101, 0, "https://example.com/a?x=1#frag", "Example A")
    data += command(7, struct.pack("<II", 101, 0))
    path.write_bytes(data)


def run_capture(tmp_path: Path) -> subprocess.CompletedProcess[str]:
    user_data = tmp_path / "User Data"
    sessions = user_data / "Default" / "Sessions"
    sessions.mkdir(parents=True)
    write_session(sessions / "Session_1")
    write_session(sessions / "Tabs_1")
    notes_root = tmp_path / "private" / "browser-tabs" / "brave"
    attachments_root = tmp_path / "private" / "_attachments" / "browser-tabs" / "brave"
    index_path = tmp_path / "private" / "_indexes" / "browser-tabs.md"
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--session-only",
            "--user-data-dir",
            str(user_data),
            "--notes-root",
            str(notes_root),
            "--attachments-root",
            str(attachments_root),
            "--index-path",
            str(index_path),
            "--timestamp",
            "fixture",
            "--json",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )


def test_session_capture_writes_obsidian_note_attachments_and_index(tmp_path: Path) -> None:
    proc = run_capture(tmp_path)
    summary = json.loads(proc.stdout)

    assert summary["method"] == "session"
    assert summary["tabCount"] == 1
    assert summary["lockedFiles"] == 0

    private_root = tmp_path / "private"
    note_path = private_root / "browser-tabs" / "brave" / "fixture.md"
    attachments_dir = private_root / "_attachments" / "browser-tabs" / "brave" / "fixture"
    index_path = private_root / "_indexes" / "browser-tabs.md"
    assert summary["notePath"] == str(note_path)
    assert summary["attachmentsDir"] == str(attachments_dir)
    assert summary["indexPath"] == str(index_path)

    capture = json.loads((attachments_dir / "brave-tabs-full.json").read_text(encoding="utf-8"))
    assert capture["tabs"] == [
        {
            "profile": "Default",
            "windowId": 9,
            "tabId": 101,
            "tabIndex": 0,
            "selectedNavigationIndex": 0,
            "pinned": False,
            "title": "Example A",
            "url": "https://example.com/a?x=1#frag",
            "source": "session",
        }
    ]
    assert (attachments_dir / "manifest.json").exists()
    assert (attachments_dir / "session-files" / "Default__Session_1").exists()
    assert (attachments_dir / "session-files" / "Default__Tabs_1").exists()

    markdown = note_path.read_text(encoding="utf-8")
    assert markdown.startswith("---\ntitle: Brave tabs capture fixture\n")
    assert "type: browser-tabs" in markdown
    assert "tags:\n  - private/browser-tabs\n  - browser/brave" in markdown
    assert "[Example A](https://example.com/a?x=1#frag)" in markdown
    assert "../../_attachments/browser-tabs/brave/fixture/brave-tabs-full.json" in markdown

    index = index_path.read_text(encoding="utf-8")
    assert "# Browser tabs" in index
    assert "[[fixture]] - 1 tabs, session, 0 locked files" in index


def test_migrate_existing_capture_layout(tmp_path: Path) -> None:
    private_root = tmp_path / "private"
    legacy_dir = private_root / "browser-tabs" / "brave" / "fixture"
    legacy_dir.mkdir(parents=True)
    legacy_capture = {
        "capturedAt": "2026-06-06T10:45:09-04:00",
        "method": "session",
        "tabs": [
            {
                "profile": "Default",
                "windowId": 9,
                "tabId": 101,
                "tabIndex": 0,
                "selectedNavigationIndex": 0,
                "pinned": False,
                "title": "Example A",
                "url": "https://example.com/a?x=1#frag",
                "source": "session",
            }
        ],
        "manifest": [],
        "parseErrors": [],
    }
    (legacy_dir / "brave-tabs-full.json").write_text(
        json.dumps(legacy_capture), encoding="utf-8"
    )
    (legacy_dir / "brave-tabs-full.md").write_text("# old\n", encoding="utf-8")
    (legacy_dir / "Default__Session_1").write_bytes(b"session")

    notes_root = private_root / "browser-tabs" / "brave"
    attachments_root = private_root / "_attachments" / "browser-tabs" / "brave"
    index_path = private_root / "_indexes" / "browser-tabs.md"
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--migrate-existing",
            "--notes-root",
            str(notes_root),
            "--attachments-root",
            str(attachments_root),
            "--index-path",
            str(index_path),
            "--json",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    summary = json.loads(proc.stdout)
    assert summary["migrated"] == 1
    assert summary["conflicts"] == []
    assert not legacy_dir.exists()
    assert (notes_root / "fixture.md").exists()
    assert (attachments_root / "fixture" / "brave-tabs-full.json").exists()
    assert (attachments_root / "fixture" / "manifest.json").exists()
    assert (attachments_root / "fixture" / "session-files" / "Default__Session_1").exists()
    assert "[[fixture]] - 1 tabs, session, 0 locked files" in index_path.read_text(
        encoding="utf-8"
    )


def test_browser_tab_capture_skill_points_to_private_vault() -> None:
    skill = (ROOT / "pi/skills/browser-tab-capture/SKILL.md").read_text(encoding="utf-8")
    assert "scripts/brave-tab-capture --json" in skill
    assert "private/browser-tabs/brave/<timestamp>.md" in skill
    assert "private/_attachments/browser-tabs/brave/<timestamp>/" in skill
    assert "private/_indexes/browser-tabs.md" in skill
    assert "--migrate-existing" in skill


def test_private_store_skill_defines_obsidian_vault_contract() -> None:
    skill = (ROOT / "pi/skills/private-store/SKILL.md").read_text(encoding="utf-8")
    assert "private/` is the local plaintext Obsidian-compatible vault" in skill
    assert "private/_attachments/<domain>/" in skill
    assert "private/_indexes/" in skill
    assert "YAML frontmatter" in skill
    assert "one H1 matching `title`" in skill


def test_handoff_prompt_uses_private_vault_contract() -> None:
    prompt = (ROOT / "pi/prompts/handoff.md").read_text(encoding="utf-8")
    assert "private/handoffs/" in prompt
    assert "YAML frontmatter" in prompt
    assert "private/_attachments/handoffs/<timestamp>/" in prompt
    assert "private/_indexes/handoffs.md" in prompt
    assert "pre-commit hook packs diverged `private/`" in prompt
    assert "Do not rely on hooks" not in prompt
