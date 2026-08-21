"""Tests for Onclave job operations."""

from unittest.mock import MagicMock, patch

import pytest
from check_job import cancel_job, get_job, list_jobs
from job_utils import format_stages, poll_job


def test_get_job_displays_status(capsys):
    client = MagicMock()
    response = MagicMock(status_code=200)
    response.json.return_value = {"status": "completed"}
    client.get.return_value = response

    get_job(client, "job_123")

    client.get.assert_called_once_with("/jobs/job_123")
    assert "Status: completed" in capsys.readouterr().out


def test_detail_renders_known_stages_in_canonical_order(capsys):
    client = MagicMock()
    response = MagicMock(status_code=200)
    response.json.return_value = {
        "status": "processing",
        "stages": [
            {"name": "persist", "status": "pending"},
            {"name": "context_fetch", "status": "completed"},
            {"name": "llm_call", "status": "processing"},
            {"name": "unknown", "status": "ignored"},
        ],
    }
    client.get.return_value = response

    get_job(client, "job_123")

    assert capsys.readouterr().out == (
        "Job: job_123\n"
        "Status: processing\n"
        "Stages: context_fetch=completed, llm_call=processing, persist=pending\n"
    )


def test_stage_parser_is_additive_and_tolerates_missing_or_malformed_values():
    assert format_stages({"status": "completed"}) is None
    assert format_stages({"stages": {"parse": {"status": "completed"}, "bad": None}}) == "parse"
    assert format_stages({"pipeline_stages": ["embedding", 3, {"stage": "chunking"}]}) == "chunking, embedding"


def test_list_renders_stages_and_preserves_legacy_jobs(capsys):
    client = MagicMock()
    response = MagicMock(status_code=200)
    response.json.return_value = {
        "jobs": [
            {"job_id": "job_new", "status": "completed", "stages": ["persist", "parse"]},
            {"job_id": "job_old", "status": "failed"},
        ],
        "total": 2,
    }
    client.get.return_value = response

    list_jobs(client)

    assert client.get.call_args.args == ("/jobs",)
    assert capsys.readouterr().out == (
        "Job: job_new\n"
        "Status: completed\n"
        "Stages: parse, persist\n"
        "Job: job_old\n"
        "Status: failed\n"
    )


def test_cancel_job_posts_to_cancel_endpoint(capsys):
    client = MagicMock()
    response = MagicMock(status_code=200)
    response.json.return_value = {"status": "cancelled"}
    client.post.return_value = response

    cancel_job(client, "job_123")

    client.post.assert_called_once_with("/jobs/job_123/cancel")
    assert "cancelled" in capsys.readouterr().out


def test_poll_job_uses_shared_client(capsys):
    client = MagicMock()
    processing = MagicMock(status_code=200)
    processing.json.return_value = {"status": "processing"}
    completed = MagicMock(status_code=200)
    completed.json.return_value = {"status": "completed"}
    client.get.side_effect = [processing, completed]

    with patch("job_utils.time.sleep"):
        poll_job(client, "job_123")

    assert client.get.call_count == 2
    assert "Final status: completed" in capsys.readouterr().out


def test_get_job_fails_for_missing_job():
    client = MagicMock()
    client.get.return_value = MagicMock(status_code=404)

    with pytest.raises(SystemExit):
        get_job(client, "missing")
