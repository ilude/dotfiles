"""Unit tests for check_job CLI."""

import sys
from unittest.mock import MagicMock, patch

import pytest

from check_job import cancel_job, get_job, main, poll_job


@pytest.fixture
def mock_signer():
    """Create a mock RequestSigner."""
    signer = MagicMock()
    signer.sign_request.return_value = {
        "signature-input": "sig1=test",
        "signature": "sig1=:dGVzdA==:",
    }
    return signer


class TestGetJob:
    """Tests for get_job function."""

    def test_status_display_minimal(self, capsys, mock_signer):
        mock_client = MagicMock()
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"status": "completed", "job_id": "job_123"}
        mock_client.get.return_value = resp

        get_job(mock_client, mock_signer, "http://localhost:8000/api/v1",
                "localhost:8000", "job_123")

        captured = capsys.readouterr()
        assert "Job: job_123" in captured.out
        assert "Status: completed" in captured.out

    def test_status_display_verbose(self, capsys, mock_signer):
        mock_client = MagicMock()
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {
            "status": "completed",
            "job_id": "job_123",
            "error": None,
            "duration": "3.5s",
        }
        mock_client.get.return_value = resp

        get_job(mock_client, mock_signer, "http://localhost:8000/api/v1",
                "localhost:8000", "job_123", verbose=True)

        # Verify verbose=true is appended to URL
        call_args = mock_client.get.call_args
        url = call_args[0][0]
        assert "?verbose=true" in url

        captured = capsys.readouterr()
        assert "status: completed" in captured.out
        assert "duration: 3.5s" in captured.out

    def test_not_found_exits_1(self, mock_signer):
        mock_client = MagicMock()
        resp = MagicMock()
        resp.status_code = 404
        mock_client.get.return_value = resp

        with pytest.raises(SystemExit) as exc_info:
            get_job(mock_client, mock_signer, "http://localhost:8000/api/v1",
                    "localhost:8000", "nonexistent_job")
        assert exc_info.value.code == 1


class TestPollJob:
    """Tests for poll_job function."""

    def test_wait_polls_until_terminal(self, capsys, mock_signer):
        mock_client = MagicMock()

        resp_processing = MagicMock()
        resp_processing.status_code = 200
        resp_processing.json.return_value = {"status": "processing"}

        resp_completed = MagicMock()
        resp_completed.status_code = 200
        resp_completed.json.return_value = {"status": "completed"}

        mock_client.get.side_effect = [resp_processing, resp_completed]

        with patch("check_job.time.sleep"):
            poll_job(mock_client, mock_signer, "http://localhost:8000/api/v1",
                     "localhost:8000", "job_123")

        captured = capsys.readouterr()
        assert "Status: processing" in captured.out
        assert "Status: completed" in captured.out
        assert "Final status: completed" in captured.out
        assert mock_client.get.call_count == 2

    def test_poll_verbose_shows_all_fields(self, capsys, mock_signer):
        mock_client = MagicMock()

        resp_completed = MagicMock()
        resp_completed.status_code = 200
        resp_completed.json.return_value = {
            "status": "completed",
            "result": "ok",
        }
        mock_client.get.return_value = resp_completed

        with patch("check_job.time.sleep"):
            poll_job(mock_client, mock_signer, "http://localhost:8000/api/v1",
                     "localhost:8000", "job_123", verbose=True)

        captured = capsys.readouterr()
        assert "result: ok" in captured.out


class TestCancelJob:
    """Tests for cancel_job function."""

    def test_cancel_sends_post(self, capsys, mock_signer):
        mock_client = MagicMock()
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"status": "cancelled", "job_id": "job_123"}
        mock_client.post.return_value = resp

        cancel_job(mock_client, mock_signer, "http://localhost:8000/api/v1",
                   "localhost:8000", "job_123")

        # Verify POST to cancel endpoint
        call_args = mock_client.post.call_args
        url = call_args[0][0]
        assert "/jobs/job_123/cancel" in url

        captured = capsys.readouterr()
        assert "status: cancelled" in captured.out

    def test_cancel_not_found_exits_1(self, mock_signer):
        mock_client = MagicMock()
        resp = MagicMock()
        resp.status_code = 404
        mock_client.post.return_value = resp

        with pytest.raises(SystemExit) as exc_info:
            cancel_job(mock_client, mock_signer, "http://localhost:8000/api/v1",
                       "localhost:8000", "nonexistent_job")
        assert exc_info.value.code == 1


class TestMainCLI:
    """Tests for main() CLI dispatch."""

    def test_main_argparse_has_all_flags(self):
        with patch.object(sys, "argv", ["check_job.py", "--help"]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 0
