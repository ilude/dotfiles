"""Tests for reduce.py orchestrator CLI."""

import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import corpus as corpus_mod
import reduce
from reduce import CompactResult, reduce_execution

_ROOT = Path(__file__).parent.parent
_FIXTURES = Path(__file__).parent / "fixtures"
_GIT_STATUS_SAMPLE = (_FIXTURES / "git-status-sample.txt").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_rules_module(rules: list[dict]):
    """Return a minimal rules-module duck-type with the given rule list."""

    class _FakeRules:
        @staticmethod
        def load_rules(**kwargs):
            return rules

        @staticmethod
        def classify_argv(argv, rules_list):
            for rule in rules_list:
                match = rule.get("match", {})
                argv0_list = match.get("argv0", [])
                if argv and argv[0] in argv0_list:
                    includes = match.get("argvIncludes", [])
                    if all(
                        any(tok in argv for tok in group) for group in includes
                    ):
                        return (rule["id"], 1.0)
            return (None, 0.0)

    return _FakeRules()


def _load_git_status_rule() -> dict:
    rule_path = _ROOT / "rules" / "builtin" / "git" / "status.json"
    return json.loads(rule_path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# test_git_status_compacts
# ---------------------------------------------------------------------------

def test_git_status_compacts(tmp_path):
    rule = _load_git_status_rule()
    fake_rules = _make_rules_module([rule])

    with patch.object(reduce, "_load_rules_module", return_value=fake_rules), \
         patch("corpus.log_reduction"):
        result = reduce_execution(
            argv=["git", "status"],
            exit_code=0,
            stdout=_GIT_STATUS_SAMPLE,
            stderr="",
        )

    assert isinstance(result, CompactResult)
    assert result.rule_id == "git/status", f"expected git/status, got {result.rule_id}"
    assert result.bytes_after < result.bytes_before, (
        f"expected compaction: before={result.bytes_before}, after={result.bytes_after}"
    )
    assert result.reduction_applied is True


# ---------------------------------------------------------------------------
# test_unknown_command_passthrough
# ---------------------------------------------------------------------------

def test_unknown_command_passthrough():
    # Use an empty rule list so no rule can match -- tests the passthrough path
    # regardless of what rules T5 loads from builtin.
    empty_rules = _make_rules_module([])

    with patch.object(reduce, "_load_rules_module", return_value=empty_rules), \
         patch("corpus.log_reduction"):
        result = reduce_execution(
            argv=["xyznonexistent"],
            exit_code=0,
            stdout="some output line",
            stderr="",
        )

    assert result.reduction_applied is False
    assert result.rule_id is None
    assert result.inline_text == "some output line"


# ---------------------------------------------------------------------------
# test_corpus_logged
# ---------------------------------------------------------------------------

def test_corpus_logged(tmp_path):
    corpus_file = tmp_path / "corpus-test.jsonl"
    rule = _load_git_status_rule()
    fake_rules = _make_rules_module([rule])

    with patch.object(reduce, "_load_rules_module", return_value=fake_rules), \
         patch.object(corpus_mod, "default_path", return_value=corpus_file):
        reduce_execution(
            argv=["git", "status"],
            exit_code=0,
            stdout=_GIT_STATUS_SAMPLE,
            stderr="",
        )

    lines = corpus_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1, f"expected 1 corpus record, got {len(lines)}"
    record = json.loads(lines[0])
    assert "argv" in record
    assert "bytes_before" in record
    assert "reduction_applied" in record
    assert "ts" in record, "corpus record must include ts field"
    from datetime import datetime
    datetime.fromisoformat(record["ts"])  # raises ValueError if ts is malformed


# ---------------------------------------------------------------------------
# test_scrub_in_corpus
# ---------------------------------------------------------------------------

def test_scrub_in_corpus(tmp_path):
    corpus_file = tmp_path / "corpus-scrub.jsonl"
    # Use a bare token on its own line (not KEY=value) so the github pattern fires,
    # not the env-secret pattern.
    fake_token = "ghp_FAKETOKENFAKETOKENFAKETOKENFAKETOKEN12"
    stdout_with_secret = f"some output\n{fake_token}\nmore output"

    empty_rules = _make_rules_module([])

    with patch.object(reduce, "_load_rules_module", return_value=empty_rules), \
         patch.object(corpus_mod, "default_path", return_value=corpus_file):
        reduce_execution(
            argv=["xyznonexistent"],
            exit_code=0,
            stdout=stdout_with_secret,
            stderr="",
        )

    lines = corpus_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    stored_stdout = record.get("stdout_sample", "")
    assert fake_token not in stored_stdout, "raw token must not appear in corpus"
    assert "[REDACTED:github]" in stored_stdout, "expected redaction marker in corpus"


# ---------------------------------------------------------------------------
# test_cli_roundtrip
# ---------------------------------------------------------------------------

def test_cli_roundtrip(tmp_path):
    reduce_script = str(_ROOT / "reduce.py")
    request = {
        "argv": ["xyznonexistent"],
        "exit_code": 0,
        "stdout": "hello from cli",
        "stderr": "",
    }
    env = {**os.environ, "PYTHONPATH": str(_ROOT)}

    proc = subprocess.run(
        [sys.executable, reduce_script],
        input=json.dumps(request),
        capture_output=True,
        text=True,
        timeout=30,
        env=env,
    )

    assert proc.returncode == 0, f"reduce.py exited {proc.returncode}: {proc.stderr}"
    response = json.loads(proc.stdout.strip())

    assert "inline_text" in response
    assert "facts" in response
    assert "rule_id" in response
    assert "bytes_before" in response
    assert "bytes_after" in response
    assert "reduction_applied" in response

    assert response["reduction_applied"] is False
    assert response["inline_text"] == "hello from cli"
