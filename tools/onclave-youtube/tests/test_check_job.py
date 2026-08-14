"""Tests for Onclave job operations."""

from unittest.mock import MagicMock, patch

import pytest
from check_job import cancel_job, get_job
from job_utils import poll_job


def test_get_job_displays_status(capsys):
    client = MagicMock()
    response = MagicMock(status_code=200)
    response.json.return_value = {"status": "completed"}
    client.get.return_value = response

    get_job(client, "job_123")

    client.get.assert_called_once_with("/jobs/job_123")
    assert "Status: completed" in capsys.readouterr().out


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
