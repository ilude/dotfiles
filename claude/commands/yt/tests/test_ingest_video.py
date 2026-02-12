"""Unit tests for ingest_video CLI."""

import sys
from unittest.mock import MagicMock, patch

import pytest

from ingest_video import main, poll_job


@pytest.fixture
def mock_signer():
    """Create a mock RequestSigner."""
    signer = MagicMock()
    signer.sign_request.return_value = {
        "signature-input": "sig1=test",
        "signature": "sig1=:dGVzdA==:",
    }
    return signer


@pytest.fixture
def mock_response_success():
    """Create a mock httpx response for successful ingest."""
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "video_id": "dQw4w9WgXcQ",
        "title": "Test Video",
        "transcript_length": 1234,
        "chunks_created": 5,
        "file_path": "youtube/test.md",
        "job_id": "job_abc123",
    }
    return response


class TestMain:
    """Tests for main CLI function."""

    def test_main_shows_job_id(self, capsys, mock_response_success):
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = mock_response_success

        with patch.object(sys, "argv", ["ingest_video.py", "dQw4w9WgXcQ"]), \
             patch("ingest_video.RequestSigner") as mock_signer_cls, \
             patch("ingest_video.httpx.Client", return_value=mock_client), \
             patch("ingest_video.Path") as mock_path_cls, \
             patch("ingest_video.get_api_base", return_value="http://localhost:8000/api/v1"), \
             patch("ingest_video.get_api_host", return_value="localhost:8000"):
            mock_path_inst = MagicMock()
            mock_path_inst.exists.return_value = True
            mock_path_cls.home.return_value.__truediv__ = MagicMock(return_value=mock_path_inst)
            mock_signer_cls.from_file.return_value = MagicMock()
            mock_signer_cls.from_file.return_value.sign_request.return_value = {
                "signature-input": "sig1=test",
                "signature": "sig1=:dGVzdA==:",
            }

            main()

        captured = capsys.readouterr()
        assert "Job ID: job_abc123" in captured.out

    def test_main_does_not_access_summary(self, capsys):
        """Response without summary field should not cause KeyError."""
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "video_id": "dQw4w9WgXcQ",
            "title": "Test Video",
            "transcript_length": 100,
            "chunks_created": 2,
            "file_path": "youtube/test.md",
            "job_id": "job_123",
        }

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = response

        with patch.object(sys, "argv", ["ingest_video.py", "dQw4w9WgXcQ"]), \
             patch("ingest_video.RequestSigner") as mock_signer_cls, \
             patch("ingest_video.httpx.Client", return_value=mock_client), \
             patch("ingest_video.Path") as mock_path_cls, \
             patch("ingest_video.get_api_base", return_value="http://localhost:8000/api/v1"), \
             patch("ingest_video.get_api_host", return_value="localhost:8000"):
            mock_path_inst = MagicMock()
            mock_path_inst.exists.return_value = True
            mock_path_cls.home.return_value.__truediv__ = MagicMock(return_value=mock_path_inst)
            mock_signer_cls.from_file.return_value = MagicMock()
            mock_signer_cls.from_file.return_value.sign_request.return_value = {
                "signature-input": "sig1=test",
                "signature": "sig1=:dGVzdA==:",
            }

            # Should not raise KeyError
            main()

    def test_main_argparse_has_wait_and_verbose(self):
        """Verify --wait and --verbose flags are in argparse."""
        with patch.object(sys, "argv", ["ingest_video.py", "--help"]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 0


class TestPollJob:
    """Tests for poll_job function."""

    def test_poll_job_until_completed(self, capsys, mock_signer):
        mock_client = MagicMock()

        # First call: processing, second call: completed
        resp_processing = MagicMock()
        resp_processing.status_code = 200
        resp_processing.json.return_value = {"status": "processing"}

        resp_completed = MagicMock()
        resp_completed.status_code = 200
        resp_completed.json.return_value = {"status": "completed"}

        mock_client.get.side_effect = [resp_processing, resp_completed]

        with patch("ingest_video.time.sleep"):
            poll_job(mock_client, mock_signer, "http://localhost:8000/api/v1",
                     "localhost:8000", "job_123")

        captured = capsys.readouterr()
        assert "Status: processing" in captured.out
        assert "Status: completed" in captured.out
        assert "Final status: completed" in captured.out

    def test_poll_job_until_failed(self, capsys, mock_signer):
        mock_client = MagicMock()

        resp_processing = MagicMock()
        resp_processing.status_code = 200
        resp_processing.json.return_value = {"status": "processing"}

        resp_failed = MagicMock()
        resp_failed.status_code = 200
        resp_failed.json.return_value = {"status": "failed"}

        mock_client.get.side_effect = [resp_processing, resp_failed]

        with patch("ingest_video.time.sleep"):
            poll_job(mock_client, mock_signer, "http://localhost:8000/api/v1",
                     "localhost:8000", "job_123")

        captured = capsys.readouterr()
        assert "Status: failed" in captured.out
        assert "Final status: failed" in captured.out

    def test_poll_job_verbose(self, capsys, mock_signer):
        mock_client = MagicMock()

        resp_completed = MagicMock()
        resp_completed.status_code = 200
        resp_completed.json.return_value = {
            "status": "completed",
            "result": "success",
            "duration": "5s",
        }
        mock_client.get.return_value = resp_completed

        with patch("ingest_video.time.sleep"):
            poll_job(mock_client, mock_signer, "http://localhost:8000/api/v1",
                     "localhost:8000", "job_123", verbose=True)

        # Verify verbose=true is appended to URL
        call_args = mock_client.get.call_args
        url = call_args[0][0]
        assert "?verbose=true" in url

        captured = capsys.readouterr()
        assert "result: success" in captured.out
        assert "duration: 5s" in captured.out

    def test_poll_job_error_exits(self, mock_signer):
        mock_client = MagicMock()

        resp_error = MagicMock()
        resp_error.status_code = 500
        resp_error.text = "Internal Server Error"
        mock_client.get.return_value = resp_error

        with patch("ingest_video.time.sleep"):
            with pytest.raises(SystemExit) as exc_info:
                poll_job(mock_client, mock_signer, "http://localhost:8000/api/v1",
                         "localhost:8000", "job_123")
            assert exc_info.value.code == 1
