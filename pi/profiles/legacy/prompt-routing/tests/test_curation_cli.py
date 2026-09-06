"""CLI tests for curation pipeline."""

import json
import subprocess
import sys
from pathlib import Path

import pytest
from curation_pipeline import cleanup_output_dir, repo_root, safe_output_dir

SCRIPT = Path(__file__).parent.parent / "curation_pipeline.py"


def run_cli(*args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=repo_root(),
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def test_fixture_cli_writes_outputs_and_prompt_safe_summary():
    output = "pi/prompt-routing/experiments/curation/pytest-fixture"
    cleanup_output_dir(output, dry_run=False) if safe_output_dir(output).exists() else None

    proc = run_cli(
        "run",
        "--fixture",
        "--limit-per-source",
        "1",
        "--output-dir",
        output,
    )

    assert proc.returncode == 0, proc.stderr + proc.stdout
    out_dir = repo_root() / output
    assert (out_dir / "candidates.jsonl").exists()
    assert (out_dir / "manifest.json").exists()
    assert (out_dir / "summary.md").exists()
    summary = (out_dir / "summary.md").read_text(encoding="utf-8")
    assert "What is a Python list comprehension?" not in summary
    manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["counts_by_source"]) == 3


def test_output_confinement_rejects_external_path(tmp_path):
    with pytest.raises(ValueError):
        safe_output_dir(str(tmp_path / "outside"))


def test_scan_and_cleanup_are_confined():
    output = "pi/prompt-routing/experiments/curation/pytest-scan"
    run_proc = run_cli("run", "--fixture", "--limit-per-source", "1", "--output-dir", output)
    assert run_proc.returncode == 0

    scan_proc = run_cli("scan", "--output-dir", output)
    assert scan_proc.returncode == 0
    assert "scan passed" in scan_proc.stdout

    dry_proc = run_cli("cleanup", "--output-dir", output, "--dry-run")
    assert dry_proc.returncode == 0
    assert safe_output_dir(output).exists()
