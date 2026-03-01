"""Unit tests for reprocess CLI."""

import sys
from unittest.mock import MagicMock, patch

import pytest
from reprocess import main


@pytest.fixture
def mock_signer():
    """Create a mock RequestSigner."""
    signer = MagicMock()
    signer.sign_request.return_value = {
        "signature-input": "sig1=test",
        "signature": "sig1=:dGVzdA==:",
    }
    return signer


def _make_client(response):
    """Build a mock httpx.Client context manager returning the given response."""
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post.return_value = response
    return mock_client


def _base_patches(argv, mock_client):
    """Return the standard set of patches used by every test."""
    return (
        patch.object(sys, "argv", argv),
        patch("reprocess.RequestSigner") as _signer_cls,
        patch("reprocess.httpx.Client", return_value=mock_client),
        patch("reprocess.Path") as _path_cls,
        patch("reprocess.get_api_base", return_value="http://localhost:8000/api/v1"),
        patch("reprocess.get_api_host", return_value="localhost:8000"),
    )


def _setup_signer_and_path(mock_signer_cls, mock_path_cls):
    """Wire up the mock signer and Path stubs shared by all tests."""
    mock_path_inst = MagicMock()
    mock_path_inst.exists.return_value = True
    mock_path_cls.home.return_value.__truediv__ = MagicMock(return_value=mock_path_inst)
    mock_signer_cls.from_file.return_value = MagicMock()
    mock_signer_cls.from_file.return_value.sign_request.return_value = {
        "signature-input": "sig1=test",
        "signature": "sig1=:dGVzdA==:",
    }


class TestMain:
    """Tests for main CLI function."""

    def test_successful_reprocess(self, capsys):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "content_id": "abc123",
            "status": "queued",
            "job_id": "job_xyz789",
        }
        mock_client = _make_client(response)

        with (
            patch.object(sys, "argv", ["reprocess.py", "abc123"]),
            patch("reprocess.RequestSigner") as mock_signer_cls,
            patch("reprocess.httpx.Client", return_value=mock_client),
            patch("reprocess.Path") as mock_path_cls,
            patch("reprocess.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("reprocess.get_api_host", return_value="localhost:8000"),
        ):
            _setup_signer_and_path(mock_signer_cls, mock_path_cls)
            main()

        captured = capsys.readouterr()
        assert "Content ID: abc123" in captured.out
        assert "Status: queued" in captured.out
        assert "Job ID: job_xyz789" in captured.out

    def test_force_adds_query_param(self, capsys):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "content_id": "abc123",
            "status": "queued",
            "job_id": "job_xyz789",
        }
        mock_client = _make_client(response)

        with (
            patch.object(sys, "argv", ["reprocess.py", "abc123", "--force"]),
            patch("reprocess.RequestSigner") as mock_signer_cls,
            patch("reprocess.httpx.Client", return_value=mock_client),
            patch("reprocess.Path") as mock_path_cls,
            patch("reprocess.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("reprocess.get_api_host", return_value="localhost:8000"),
        ):
            _setup_signer_and_path(mock_signer_cls, mock_path_cls)
            main()

        url_called = mock_client.post.call_args[0][0]
        assert "?force=true" in url_called

    def test_wait_calls_poll_job(self, capsys):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "content_id": "abc123",
            "status": "queued",
            "job_id": "job_xyz789",
        }
        mock_client = _make_client(response)

        with (
            patch.object(sys, "argv", ["reprocess.py", "abc123", "--wait"]),
            patch("reprocess.RequestSigner") as mock_signer_cls,
            patch("reprocess.httpx.Client", return_value=mock_client),
            patch("reprocess.Path") as mock_path_cls,
            patch("reprocess.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("reprocess.get_api_host", return_value="localhost:8000"),
            patch("reprocess.poll_job") as mock_poll,
        ):
            _setup_signer_and_path(mock_signer_cls, mock_path_cls)
            main()

        mock_poll.assert_called_once()
        call_kwargs = mock_poll.call_args
        assert call_kwargs[1].get("verbose") is False or "job_xyz789" in str(call_kwargs)

    def test_already_completed_without_force_exits_0(self, capsys):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "content_id": "abc123",
            "status": "already_completed",
            "job_id": None,
        }
        mock_client = _make_client(response)

        with (
            patch.object(sys, "argv", ["reprocess.py", "abc123"]),
            patch("reprocess.RequestSigner") as mock_signer_cls,
            patch("reprocess.httpx.Client", return_value=mock_client),
            patch("reprocess.Path") as mock_path_cls,
            patch("reprocess.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("reprocess.get_api_host", return_value="localhost:8000"),
        ):
            _setup_signer_and_path(mock_signer_cls, mock_path_cls)
            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 0
        captured = capsys.readouterr()
        assert "already processed" in captured.out

    def test_404_exits_1(self, capsys):
        response = MagicMock()
        response.status_code = 404
        mock_client = _make_client(response)

        with (
            patch.object(sys, "argv", ["reprocess.py", "missing_id"]),
            patch("reprocess.RequestSigner") as mock_signer_cls,
            patch("reprocess.httpx.Client", return_value=mock_client),
            patch("reprocess.Path") as mock_path_cls,
            patch("reprocess.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("reprocess.get_api_host", return_value="localhost:8000"),
        ):
            _setup_signer_and_path(mock_signer_cls, mock_path_cls)
            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 1

    def test_non_200_exits_1(self, capsys):
        response = MagicMock()
        response.status_code = 500
        response.text = "Internal Server Error"
        mock_client = _make_client(response)

        with (
            patch.object(sys, "argv", ["reprocess.py", "abc123"]),
            patch("reprocess.RequestSigner") as mock_signer_cls,
            patch("reprocess.httpx.Client", return_value=mock_client),
            patch("reprocess.Path") as mock_path_cls,
            patch("reprocess.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("reprocess.get_api_host", return_value="localhost:8000"),
        ):
            _setup_signer_and_path(mock_signer_cls, mock_path_cls)
            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 1
