"""Tests for aggregate Onclave job statistics."""

import argparse
from unittest.mock import MagicMock, patch

from conftest import mock_onclave_client
from job_stats import run


def _stats() -> dict[str, float | int]:
    return {
        "total_jobs": 12,
        "completed_jobs": 8,
        "failed_jobs": 2,
        "cancelled_jobs": 2,
        "average_completion_seconds": 34.5,
    }


def test_stats_gets_and_renders_all_fields(capsys):
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = _stats()
    client.get.return_value = response

    with patch("job_stats.OnclaveClient", return_value=client):
        run(argparse.Namespace(json_output=False))

    client.get.assert_called_once_with("/jobs/stats")
    assert capsys.readouterr().out == (
        "total_jobs: 12\n"
        "completed_jobs: 8\n"
        "failed_jobs: 2\n"
        "cancelled_jobs: 2\n"
        "average_completion_seconds: 34.5\n"
    )


def test_stats_renders_json(capsys):
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = _stats()
    client.get.return_value = response

    with patch("job_stats.OnclaveClient", return_value=client):
        run(argparse.Namespace(json_output=True))

    assert capsys.readouterr().out == (
        "{\n"
        '  "total_jobs": 12,\n'
        '  "completed_jobs": 8,\n'
        '  "failed_jobs": 2,\n'
        '  "cancelled_jobs": 2,\n'
        '  "average_completion_seconds": 34.5\n'
        "}\n"
    )
