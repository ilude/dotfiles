from pathlib import Path

DOTFILES = Path(__file__).parent.parent
SCRIPT = DOTFILES / "scripts" / "agent-browser-brave"
PI_README = DOTFILES / "pi" / "README.md"


def test_wrapper_documents_safe_defaults_and_real_profile_warning():
    text = SCRIPT.read_text(encoding="utf-8")
    assert "agent-browser" in text
    assert "127.0.0.1" in text
    assert "free_port" in text
    assert "profileMode" in text
    assert "real Brave profile mode can control logged-in sites" in text
    assert "--confirm-real-profile" not in text
    assert "--real-brave-default" in text
    assert "default Brave profile directory" in text
    assert "brave_identity" in text


FORBIDDEN_BROWSER_KILLS = [
    "taskkill /im brave",
    "taskkill.*im brave",
    "taskkill /im chrome",
    "pkill brave",
    "pkill chrome",
    "killall brave",
    "killall chrome",
]


def test_tracked_wrapper_and_docs_do_not_use_broad_browser_kills():
    combined = "\n".join(path.read_text(encoding="utf-8") for path in [SCRIPT, PI_README]).lower()
    for pattern in FORBIDDEN_BROWSER_KILLS:
        assert pattern not in combined


def test_pi_readme_documents_wrapper():
    assert "scripts/agent-browser-brave" in PI_README.read_text(encoding="utf-8")
