"""Privacy checks for router.py JSONL logging."""

import json


def test_router_log_omits_excerpt_by_default(monkeypatch, tmp_path):
    import router

    log_path = tmp_path / "routing_log.jsonl"
    monkeypatch.setattr(router, "_logging_enabled", True)
    monkeypatch.setattr(router, "_log_full_prompt", False)
    monkeypatch.setattr(router, "_log_excerpt", False)
    monkeypatch.setattr(router, "_LOG_DIR", tmp_path)
    monkeypatch.setattr(router, "_LOG_PATH", log_path)

    prompt = "synthetic prompt with private details that must not be logged"
    result = {"primary": {"model_tier": "core", "effort": "medium"}, "confidence": 0.42}

    router._log(prompt, result, 123.4)

    entry = json.loads(log_path.read_text(encoding="utf-8"))
    assert entry["prompt_hash"]
    assert "prompt_excerpt" not in entry
    assert "prompt" not in entry
    assert prompt not in log_path.read_text(encoding="utf-8")


def test_router_log_excerpt_requires_explicit_opt_in(monkeypatch, tmp_path):
    import router

    log_path = tmp_path / "routing_log.jsonl"
    monkeypatch.setattr(router, "_logging_enabled", True)
    monkeypatch.setattr(router, "_log_full_prompt", False)
    monkeypatch.setattr(router, "_log_excerpt", True)
    monkeypatch.setattr(router, "_LOG_DIR", tmp_path)
    monkeypatch.setattr(router, "_LOG_PATH", log_path)

    prompt = "synthetic prompt opted into excerpt logging"
    result = {"primary": {"model_tier": "core", "effort": "medium"}, "confidence": 0.42}

    router._log(prompt, result, 123.4)

    entry = json.loads(log_path.read_text(encoding="utf-8"))
    assert entry["prompt_excerpt"] == prompt
    assert "prompt" not in entry
