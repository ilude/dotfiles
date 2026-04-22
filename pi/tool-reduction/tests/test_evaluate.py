"""Tests for evaluate.py -- eval harness for the tool-output reduction pipeline."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

_HERE = Path(__file__).parent
_FIXTURES = _HERE / "fixtures"
_TOOL_REDUCTION = _HERE.parent
_EVALUATE = _TOOL_REDUCTION / "evaluate.py"

sys.path.insert(0, str(_TOOL_REDUCTION))


def _run_evaluate(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(_EVALUATE), *args],
        capture_output=True,
        text=True,
    )


def _write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        for r in records:
            fh.write(json.dumps(r) + "\n")


def _make_corpus(
    tmp_path: Path,
    *,
    n_reduced: int,
    n_passthrough: int,
    bytes_before: int = 1000,
    bytes_after_reduced: int = 400,
    rule_id: str = "git/status",
    filename: str = "corpus.jsonl",
) -> Path:
    records = []
    for _ in range(n_reduced):
        records.append({
            "argv": ["git", "status"],
            "exit_code": 0,
            "bytes_before": bytes_before,
            "bytes_after": bytes_after_reduced,
            "rule_id": rule_id,
            "reduction_applied": True,
            "stdout_sample": "x" * bytes_before,
            "stderr_sample": "",
        })
    for _ in range(n_passthrough):
        records.append({
            "argv": ["git", "status"],
            "exit_code": 0,
            "bytes_before": bytes_before,
            "bytes_after": bytes_before,
            "rule_id": None,
            "reduction_applied": False,
            "stdout_sample": "y" * bytes_before,
            "stderr_sample": "",
        })
    p = tmp_path / filename
    _write_jsonl(p, records)
    return p


def _make_labeled(
    tmp_path: Path,
    *,
    n_total: int,
    n_lost_signal: int,
    filename: str = "labeled.jsonl",
) -> Path:
    records = []
    for i in range(n_total):
        records.append({
            "argv": ["git", "status"],
            "exit_code": 0,
            "bytes_before": 1000,
            "bytes_after": 400,
            "rule_id": "git/status",
            "reduction_applied": True,
            "stdout_sample": f"sample {i}",
            "stderr_sample": "",
            "lost_signal": i < n_lost_signal,
            "labeler": "tester",
            "label_notes": None,
        })
    p = tmp_path / filename
    _write_jsonl(p, records)
    return p


# ---- test_report_runs_on_synthetic ----------------------------------------

def test_report_runs_on_synthetic():
    """CLI run on corpus-synthetic.jsonl prints expected metric fields."""
    corpus = _FIXTURES / "corpus-synthetic.jsonl"
    result = _run_evaluate("--corpus", str(corpus))

    assert result.returncode in (0, 1), f"unexpected exit code: {result.returncode}"
    out = result.stdout

    assert "Bytes saved" in out, f"missing 'Bytes saved' in output:\n{out}"
    assert "Passthrough rate" in out, f"missing 'Passthrough rate' in output:\n{out}"
    assert "Rule hit distribution" in out, f"missing 'Rule hit distribution' in output:\n{out}"
    # JSON summary line must be parseable
    json_line = [ln for ln in out.splitlines() if ln.startswith("{")]
    assert json_line, f"no JSON summary line found in output:\n{out}"
    summary = json.loads(json_line[0])
    assert "bytes_saved_pct" in summary
    assert "passthrough_rate" in summary
    assert "rule_hits" in summary
    assert summary["total_records"] > 0


def test_report_runs_on_synthetic_with_labeled():
    """CLI run with both --corpus and --labeled prints FP rate."""
    corpus = _FIXTURES / "corpus-synthetic.jsonl"
    labeled = _FIXTURES / "corpus-labeled-sample.jsonl"
    result = _run_evaluate("--corpus", str(corpus), "--labeled", str(labeled))

    assert result.returncode in (0, 1)
    out = result.stdout
    assert "False-positive rate" in out
    json_line = [ln for ln in out.splitlines() if ln.startswith("{")]
    assert json_line
    summary = json.loads(json_line[0])
    assert summary["false_positive_rate"] is not None


# ---- test_gates_pass -------------------------------------------------------

def test_gates_pass(tmp_path):
    """--min-reduction 0.30 --max-fp 0.02 exits 0 when both thresholds are met."""
    # 60% bytes saved, 1% FP rate -- both pass
    corpus = _make_corpus(tmp_path, n_reduced=90, n_passthrough=10,
                          bytes_before=1000, bytes_after_reduced=400)
    labeled = _make_labeled(tmp_path, n_total=100, n_lost_signal=1)

    result = _run_evaluate(
        "--corpus", str(corpus),
        "--labeled", str(labeled),
        "--min-reduction", "0.30",
        "--max-fp", "0.02",
    )
    assert result.returncode == 0, (
        f"expected exit 0 (both gates pass), got {result.returncode}\n"
        f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    out = result.stdout
    assert "PASSED" in out


# ---- test_gates_fail_reduction ---------------------------------------------

def test_gates_fail_reduction(tmp_path):
    """--min-reduction 0.30 exits 1 when corpus has only 10% reduction."""
    # 10% bytes saved (1000 -> 900), below 0.30 threshold
    corpus = _make_corpus(tmp_path, n_reduced=80, n_passthrough=20,
                          bytes_before=1000, bytes_after_reduced=920)

    result = _run_evaluate(
        "--corpus", str(corpus),
        "--min-reduction", "0.30",
    )
    assert result.returncode == 1, (
        f"expected exit 1 (reduction gate fail), got {result.returncode}\n"
        f"stdout:\n{result.stdout}"
    )
    out = result.stdout
    assert "REJECTED" in out


# ---- test_gates_fail_fp ----------------------------------------------------

def test_gates_fail_fp(tmp_path):
    """--max-fp 0.02 exits 1 when labeled corpus has 5% lost_signal rate."""
    # 60% bytes saved -- reduction gate passes
    corpus = _make_corpus(tmp_path, n_reduced=90, n_passthrough=10,
                          bytes_before=1000, bytes_after_reduced=400)
    # 5% FP rate -- FP gate fails
    labeled = _make_labeled(tmp_path, n_total=100, n_lost_signal=5)

    result = _run_evaluate(
        "--corpus", str(corpus),
        "--labeled", str(labeled),
        "--min-reduction", "0.30",
        "--max-fp", "0.02",
    )
    assert result.returncode == 1, (
        f"expected exit 1 (FP gate fail), got {result.returncode}\n"
        f"stdout:\n{result.stdout}"
    )
    out = result.stdout
    assert "REJECTED" in out


# ---- test_no_labeled_skips_fp_gate -----------------------------------------

def test_no_labeled_skips_fp_gate(tmp_path):
    """Without --labeled, FP gate is noted as skipped and exit code depends only on reduction."""
    # 60% bytes saved -- reduction gate passes; no labeled data supplied
    corpus = _make_corpus(tmp_path, n_reduced=90, n_passthrough=10,
                          bytes_before=1000, bytes_after_reduced=400)

    result = _run_evaluate(
        "--corpus", str(corpus),
        "--min-reduction", "0.30",
        "--max-fp", "0.02",
    )
    # Reduction gate passes, FP gate skipped -- should exit 0
    assert result.returncode == 0, (
        f"expected exit 0 (FP skipped, reduction passes), got {result.returncode}\n"
        f"stdout:\n{result.stdout}"
    )
    out = result.stdout
    assert "SKIP" in out or "no labeled" in out.lower(), (
        f"expected SKIP or 'no labeled' note in output:\n{out}"
    )

    json_line = [ln for ln in out.splitlines() if ln.startswith("{")]
    assert json_line
    summary = json.loads(json_line[0])
    assert summary["false_positive_rate"] is None


def test_no_labeled_skips_fp_gate_reduction_fails(tmp_path):
    """Without --labeled, exit 1 when reduction gate fails even though FP is skipped."""
    corpus = _make_corpus(tmp_path, n_reduced=80, n_passthrough=20,
                          bytes_before=1000, bytes_after_reduced=950)

    result = _run_evaluate(
        "--corpus", str(corpus),
        "--min-reduction", "0.30",
        "--max-fp", "0.02",
    )
    assert result.returncode == 1, (
        f"expected exit 1 (reduction fails, FP skipped), got {result.returncode}\n"
        f"stdout:\n{result.stdout}"
    )


# ---- additional metric accuracy tests -------------------------------------

def test_passthrough_rate_computed_correctly(tmp_path):
    """Passthrough rate equals n_passthrough / total."""
    corpus = _make_corpus(tmp_path, n_reduced=70, n_passthrough=30,
                          bytes_before=1000, bytes_after_reduced=500)
    result = _run_evaluate("--corpus", str(corpus))
    json_line = [ln for ln in result.stdout.splitlines() if ln.startswith("{")]
    summary = json.loads(json_line[0])
    assert abs(summary["passthrough_rate"] - 0.30) < 1e-6


def test_rule_hits_counted(tmp_path):
    """Rule hit distribution counts each rule_id correctly."""
    records = [
        {"argv": ["git", "status"], "exit_code": 0, "bytes_before": 500, "bytes_after": 200,
         "rule_id": "git/status", "reduction_applied": True, "stdout_sample": "", "stderr_sample": ""},
        {"argv": ["git", "status"], "exit_code": 0, "bytes_before": 500, "bytes_after": 200,
         "rule_id": "git/status", "reduction_applied": True, "stdout_sample": "", "stderr_sample": ""},
        {"argv": ["pnpm", "install"], "exit_code": 0, "bytes_before": 800, "bytes_after": 250,
         "rule_id": "node/pnpm-install", "reduction_applied": True, "stdout_sample": "", "stderr_sample": ""},
        {"argv": ["unknown"], "exit_code": 0, "bytes_before": 100, "bytes_after": 100,
         "rule_id": None, "reduction_applied": False, "stdout_sample": "", "stderr_sample": ""},
    ]
    p = tmp_path / "corpus.jsonl"
    _write_jsonl(p, records)

    result = _run_evaluate("--corpus", str(p))
    out = result.stdout
    assert "git/status" in out
    assert "node/pnpm-install" in out
    assert "(none)" in out
    json_line = [ln for ln in out.splitlines() if ln.startswith("{")]
    summary = json.loads(json_line[0])
    assert summary["rule_hits"]["git/status"] == 2
    assert summary["rule_hits"]["node/pnpm-install"] == 1
    assert summary["rule_hits"]["(none)"] == 1


def test_multiple_corpus_paths(tmp_path):
    """--corpus can be supplied multiple times and records are combined."""
    a = _make_corpus(tmp_path, n_reduced=10, n_passthrough=0,
                     bytes_before=1000, bytes_after_reduced=400, filename="a.jsonl")
    b = _make_corpus(tmp_path, n_reduced=10, n_passthrough=0,
                     bytes_before=1000, bytes_after_reduced=400, filename="b.jsonl")
    result = _run_evaluate("--corpus", str(a), "--corpus", str(b))
    json_line = [ln for ln in result.stdout.splitlines() if ln.startswith("{")]
    summary = json.loads(json_line[0])
    assert summary["total_records"] == 20
