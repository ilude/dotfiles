import importlib.machinery
import importlib.util
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


SCRIPT = Path(__file__).with_name("claude-status")
loader = importlib.machinery.SourceFileLoader("claude_status", str(SCRIPT))
spec = importlib.util.spec_from_loader("claude_status", loader)
status = importlib.util.module_from_spec(spec)
spec.loader.exec_module(status)


def test_bedrock_session_first_snapshot_and_delta(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.setenv("PI_CODING_AGENT_DIR", str(tmp_path / "pi"))
    monkeypatch.setenv("CLAUDE_CODE_USE_BEDROCK", "1")
    data = {"session_id": "s1", "cost": {"total_cost_usd": 2.0}, "rate_limits": {}}
    status.usage_suffix(data)
    state = json.loads((tmp_path / ".claude" / "bedrock-status-usage.json").read_text())
    assert state["version"] == 1
    assert state["sessions"]["s1"]["cost"] == 2.0
    assert sum(item["amount"] for item in state["increments"]) == 2.0
    data["cost"]["total_cost_usd"] = 3.5
    status.usage_suffix(data)
    state = json.loads((tmp_path / ".claude" / "bedrock-status-usage.json").read_text())
    assert sum(item["amount"] for item in state["increments"]) == 3.5
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda _: status.usage_suffix(data), range(8)))
    state = json.loads((tmp_path / ".claude" / "bedrock-status-usage.json").read_text())
    assert sum(item["amount"] for item in state["increments"]) == 3.5


def test_status_consumes_shared_pi_subtotal(tmp_path, monkeypatch):
    import datetime
    import subprocess

    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.delenv("CLAUDE_CODE_USE_BEDROCK", raising=False)
    month = datetime.datetime.now().astimezone().strftime("%Y-%m")
    line = status.usage_suffix({"rate_limits": {}})
    helper = SCRIPT.parent.parent / "pi" / "profiles" / "default" / "scripts" / "bedrock-status-subtotal.mjs"
    result = subprocess.run(["node", str(helper.parents[1] / "node_modules" / "tsx" / "dist" / "cli.mjs"), str(helper), month], capture_output=True, text=True, check=True)
    subtotal = json.loads(result.stdout)
    assert f"bedrock: ${subtotal['cost'] + subtotal['baseline']:.2f} est." in line


def test_malformed_existing_state_is_preserved(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.setenv("CLAUDE_CODE_USE_BEDROCK", "1")
    state_file = tmp_path / ".claude" / "bedrock-status-usage.json"
    state_file.parent.mkdir()
    state_file.write_text("invalid JSON")
    status.usage_suffix({"session_id": "s1", "cost": {"total_cost_usd": 3}})
    assert state_file.read_text() == "invalid JSON"


def test_pi_style_context_and_right_aligned_usage():
    data = {"context_window": {"used_percentage": 56, "total_input_tokens": 153000, "context_window_size": 272000}}
    assert status.context_label(data) == "56% 153k/272k"
    assert status.align_right("repo | model", "claude: 5h 42% | wk 17%", 60).endswith("claude: 5h 42% | wk 17%")
    assert len(status.align_right("a very long repository and model", "claude: 5h 42% | wk 17%", 40)) == 40
    quota, bedrock = status.usage_details({"rate_limits": {}})
    assert quota == "claude: 5h -- | wk --"
    assert bedrock.startswith("bedrock:")


def test_live_effort_overrides_saved_settings(tmp_path, monkeypatch, capsys):
    import io
    import sys

    settings = tmp_path / ".claude" / "settings.json"
    settings.parent.mkdir()
    settings.write_text(json.dumps({"effortLevel": "low"}))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps({"model": {"display_name": "Sonnet"}, "effort": {"level": "high"}})))
    monkeypatch.setattr(status, "run", lambda *args, **kwargs: "")
    monkeypatch.setattr(status, "usage_details", lambda data: ("claude: 5h 42% | wk 17%", "bedrock: $2.00 est."))
    status.main()
    assert "[\x1b[36mhigh\x1b[37m]" in capsys.readouterr().out


def test_footer_shows_one_provider_specific_line(monkeypatch, capsys):
    import io
    import sys

    monkeypatch.setattr(status, "run", lambda *args, **kwargs: "")
    monkeypatch.setattr(status, "usage_details", lambda data: ("claude: 5h 42% | wk 17%", "bedrock: $2.00 est."))
    payload = json.dumps({"model": {"display_name": "Sonnet"}})
    monkeypatch.setattr(sys, "stdin", io.StringIO(payload))
    monkeypatch.setenv("CLAUDE_CODE_USE_BEDROCK", "1")
    monkeypatch.setenv("DOTFILES_CLAUDE_PROVIDER", "subscription")
    status.main()
    assert capsys.readouterr().out.count("\n") == 1
    monkeypatch.setattr(sys, "stdin", io.StringIO(payload))
    monkeypatch.setenv("DOTFILES_CLAUDE_PROVIDER", "bedrock")
    status.main()
    line = capsys.readouterr().out
    assert line.count("\n") == 1
    assert "bedrock: $2.00 est." in line
    assert "claude: 5h" not in line


def test_subscription_displays_limits_without_writing(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.setenv("PI_CODING_AGENT_DIR", str(tmp_path / "pi"))
    monkeypatch.setenv("CLAUDE_CODE_USE_BEDROCK", "1")
    monkeypatch.setenv("DOTFILES_CLAUDE_PROVIDER", "subscription")
    line = status.usage_suffix({"session_id": "subscription", "cost": {"total_cost_usd": 8}, "rate_limits": {"five_hour": {"used_percentage": 42, "resets_at": 1700000000}, "seven_day": {"used_percentage": 17, "resets_at": 1700000000}}})
    assert "5h 42%" in line and "wk 17%" in line
    assert not (tmp_path / ".claude" / "bedrock-status-usage.json").exists()
