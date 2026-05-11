from pathlib import Path

DOTFILES = Path(__file__).parent.parent
SCRIPT = DOTFILES / "scripts" / "agent-browser-brave"
SKILL = DOTFILES / "pi" / "skills" / "pi-skills" / "browser-tools" / "SKILL.md"
PI_README = DOTFILES / "pi" / "README.md"


def test_wrapper_documents_safe_defaults_and_real_profile_warning():
    text = SCRIPT.read_text(encoding="utf-8")
    assert "agent-browser" in text
    assert "127.0.0.1" in text
    assert "free_port" in text
    assert "profileMode" in text
    assert "I UNDERSTAND THIS CONTROLS MY REAL BRAVE PROFILE" in text
    assert "--confirm-real-profile" in text
    assert "--real-brave-default" in text
    assert "default Brave profile directory" in text
    assert "brave_identity" in text


def test_wrapper_does_not_use_broad_browser_kills():
    combined = "\n".join(
        path.read_text(encoding="utf-8") for path in [SCRIPT, SKILL, PI_README]
    ).lower()
    forbidden = [
        "taskkill /im brave",
        "taskkill.*im brave",
        "taskkill /im chrome",
        "pkill brave",
        "pkill chrome",
        "killall brave",
        "killall chrome",
    ]
    for pattern in forbidden:
        assert pattern not in combined


def test_canonical_pi_guidance_exists_and_rejects_default_profile_recipe():
    skill = SKILL.read_text(encoding="utf-8")
    assert "scripts/agent-browser-brave --check" in skill
    assert "scripts/agent-browser-brave --open https://example.com --title --snapshot" in skill
    assert "scripts/agent-browser-brave --close-owned" in skill
    assert "Do **not** use `agent-browser --profile Default` as the Brave recipe" in skill
    assert "--real-brave-default" in skill
    assert "default Brave profile display name is `Work`" in skill
    assert "default profile directory remains `Default`" in skill
    assert "bounded attempts" in skill
    assert "report partial results" in skill
    assert "auth-required" in skill
    assert "scripts/agent-browser-brave" in PI_README.read_text(encoding="utf-8")


def test_no_install_flow_or_lockfile_changes_required_by_v1_docs():
    assert not (DOTFILES / "package-lock.json").exists()
    docs = SKILL.read_text(encoding="utf-8")
    assert "Brewfile" not in docs
    assert "wsl/packages" not in docs
