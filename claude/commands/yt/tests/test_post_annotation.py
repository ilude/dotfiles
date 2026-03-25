"""Unit tests for post_annotation CLI."""

import json
import sys
from unittest.mock import MagicMock, patch

import pytest
from post_annotation import main


@pytest.fixture
def mock_signer():
    """Create a mock RequestSigner."""
    signer = MagicMock()
    signer.sign_request.return_value = {
        "signature-input": "sig1=test",
        "signature": "sig1=:dGVzdA==:",
    }
    return signer


class TestMain:
    """Tests for main CLI function."""

    def _make_mock_client(self, response):
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = response
        return mock_client

    def _base_patches(
        self, mock_client, mock_signer_cls, mock_path_cls, text_exists=True, ssh_exists=True
    ):
        """Set up standard Path and signer mocks."""
        # Mock Path(text_file)
        mock_text_path = MagicMock()
        mock_text_path.exists.return_value = text_exists
        mock_text_path.read_text.return_value = "annotation body text"
        mock_path_cls.return_value = mock_text_path

        # Mock Path.home() / ".ssh" / "id_ed25519"
        mock_ssh_path = MagicMock()
        mock_ssh_path.exists.return_value = ssh_exists
        mock_path_cls.home.return_value.__truediv__.return_value.__truediv__.return_value = (
            mock_ssh_path
        )

        mock_signer_cls.from_file.return_value = mock_signer_cls.instance
        mock_signer_cls.instance.sign_request.return_value = {
            "signature-input": "sig1=test",
            "signature": "sig1=:dGVzdA==:",
        }

        return mock_text_path, mock_ssh_path

    def test_successful_post_prints_result(self, capsys):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "id": "anno_abc123",
            "title": "My Screenshot",
            "tags": ["python", "testing"],
        }
        mock_client = self._make_mock_client(response)

        with (
            patch.object(
                sys, "argv",
                ["post_annotation.py", "content_123", "My Screenshot", "note.txt",
                 "--tags", "python", "testing"],
            ),
            patch("post_annotation.RequestSigner") as mock_signer_cls,
            patch("post_annotation.httpx.Client", return_value=mock_client),
            patch("post_annotation.Path") as mock_path_cls,
            patch("post_annotation.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("post_annotation.get_api_host", return_value="localhost:8000"),
        ):
            self._base_patches(mock_client, mock_signer_cls, mock_path_cls)
            main()

        captured = capsys.readouterr()
        assert "ID: anno_abc123" in captured.out
        assert "Title: My Screenshot" in captured.out
        assert "Tags: ['python', 'testing']" in captured.out

    def test_request_body_contains_fields(self, capsys):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {"id": "anno_1", "title": "Test", "tags": []}
        mock_client = self._make_mock_client(response)

        with (
            patch.object(
                sys, "argv",
                ["post_annotation.py", "content_456", "Test Title", "body.txt", "--tags", "tag1"],
            ),
            patch("post_annotation.RequestSigner") as mock_signer_cls,
            patch("post_annotation.httpx.Client", return_value=mock_client),
            patch("post_annotation.Path") as mock_path_cls,
            patch("post_annotation.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("post_annotation.get_api_host", return_value="localhost:8000"),
        ):
            self._base_patches(mock_client, mock_signer_cls, mock_path_cls)
            main()

        call_args = mock_client.post.call_args
        body_bytes = call_args.kwargs["content"]
        body = json.loads(body_bytes)

        assert body["text"] == "annotation body text"
        assert body["title"] == "Test Title"
        assert body["source_type"] == "screenshot"
        assert body["tags"] == ["tag1"]

    def test_signer_receives_body_bytes(self, capsys):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {"id": "anno_2", "title": "T", "tags": []}
        mock_client = self._make_mock_client(response)

        with (
            patch.object(sys, "argv", ["post_annotation.py", "content_789", "T", "file.txt"]),
            patch("post_annotation.RequestSigner") as mock_signer_cls,
            patch("post_annotation.httpx.Client", return_value=mock_client),
            patch("post_annotation.Path") as mock_path_cls,
            patch("post_annotation.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("post_annotation.get_api_host", return_value="localhost:8000"),
        ):
            self._base_patches(mock_client, mock_signer_cls, mock_path_cls)
            main()

        sign_call = mock_signer_cls.from_file.return_value.sign_request.call_args
        body_bytes_arg = sign_call[0][3]
        assert isinstance(body_bytes_arg, bytes)
        body = json.loads(body_bytes_arg)
        assert body["text"] == "annotation body text"

    def test_non_200_exits_1(self):
        response = MagicMock()
        response.status_code = 500
        response.text = "Internal Server Error"
        mock_client = self._make_mock_client(response)

        with (
            patch.object(sys, "argv", ["post_annotation.py", "content_123", "Title", "file.txt"]),
            patch("post_annotation.RequestSigner") as mock_signer_cls,
            patch("post_annotation.httpx.Client", return_value=mock_client),
            patch("post_annotation.Path") as mock_path_cls,
            patch("post_annotation.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("post_annotation.get_api_host", return_value="localhost:8000"),
        ):
            self._base_patches(mock_client, mock_signer_cls, mock_path_cls)
            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 1

    def test_missing_text_file_exits_1(self):
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)

        with (
            patch.object(
                sys, "argv",
                ["post_annotation.py", "content_123", "Title", "missing.txt"],
            ),
            patch("post_annotation.RequestSigner") as mock_signer_cls,
            patch("post_annotation.httpx.Client", return_value=mock_client),
            patch("post_annotation.Path") as mock_path_cls,
            patch("post_annotation.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("post_annotation.get_api_host", return_value="localhost:8000"),
        ):
            self._base_patches(mock_client, mock_signer_cls, mock_path_cls, text_exists=False)
            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 1

    def test_missing_ssh_key_exits_1(self):
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)

        with (
            patch.object(sys, "argv", ["post_annotation.py", "content_123", "Title", "file.txt"]),
            patch("post_annotation.RequestSigner") as mock_signer_cls,
            patch("post_annotation.httpx.Client", return_value=mock_client),
            patch("post_annotation.Path") as mock_path_cls,
            patch("post_annotation.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("post_annotation.get_api_host", return_value="localhost:8000"),
        ):
            self._base_patches(mock_client, mock_signer_cls, mock_path_cls, ssh_exists=False)
            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 1
