"""Tests for Onclave reprocessing."""

import argparse
from unittest.mock import MagicMock, patch

from conftest import mock_onclave_client
from reprocess import run


def test_reprocess_posts_force_path_and_shows_job(capsys):
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {
        "content_id": "content_123",
        "status": "queued",
        "job_id": "job_123",
    }
    client.post.return_value = response

    with patch("reprocess.OnclaveClient", return_value=client):
        run(argparse.Namespace(content_id="content_123", force=True, wait=False, verbose=False))

    client.post.assert_called_once_with("/content/content_123/reprocess?force=true")
    assert "Job ID: job_123" in capsys.readouterr().out


def test_reprocess_waits_for_job():
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {
        "content_id": "content_123",
        "status": "queued",
        "job_id": "job_123",
    }
    client.post.return_value = response

    with (
        patch("reprocess.OnclaveClient", return_value=client),
        patch("reprocess.poll_job") as poll_job,
    ):
        run(argparse.Namespace(content_id="content_123", force=False, wait=True, verbose=True))

    poll_job.assert_called_once_with(client, "job_123", verbose=True)


def test_already_completed_returns_without_polling():
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {"content_id": "content_123", "status": "already_completed"}
    client.post.return_value = response

    with patch("reprocess.OnclaveClient", return_value=client):
        run(argparse.Namespace(content_id="content_123", force=False, wait=False, verbose=False))
