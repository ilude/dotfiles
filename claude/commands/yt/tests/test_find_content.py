"""Unit tests for find_content CLI."""

import sys
from unittest.mock import MagicMock, patch

import pytest
from find_content import main


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

    def test_finds_matching_content(self, capsys):
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)

        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "items": [
                {
                    "id": "content_abc123",
                    "title": "Test Video Title",
                    "status": "completed",
                    "metadata": {"video_id": "dQw4w9WgXcQ"},
                }
            ]
        }
        mock_client.get.return_value = response

        with (
            patch.object(sys, "argv", ["find_content.py", "dQw4w9WgXcQ"]),
            patch("find_content.RequestSigner") as mock_signer_cls,
            patch("find_content.httpx.Client", return_value=mock_client),
            patch("find_content.Path") as mock_path_cls,
            patch("find_content.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("find_content.get_api_host", return_value="localhost:8000"),
            patch("find_content.extract_video_id", return_value="dQw4w9WgXcQ"),
        ):
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
        assert "Content ID: content_abc123" in captured.out
        assert "Title: Test Video Title" in captured.out
        assert "Status: completed" in captured.out

    def test_exits_1_when_video_not_found(self, capsys):
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)

        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "items": [
                {
                    "id": "content_other",
                    "title": "Different Video",
                    "status": "completed",
                    "metadata": {"video_id": "different_id"},
                }
            ]
        }
        mock_client.get.return_value = response

        with (
            patch.object(sys, "argv", ["find_content.py", "dQw4w9WgXcQ"]),
            patch("find_content.RequestSigner") as mock_signer_cls,
            patch("find_content.httpx.Client", return_value=mock_client),
            patch("find_content.Path") as mock_path_cls,
            patch("find_content.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("find_content.get_api_host", return_value="localhost:8000"),
            patch("find_content.extract_video_id", return_value="dQw4w9WgXcQ"),
        ):
            mock_path_inst = MagicMock()
            mock_path_inst.exists.return_value = True
            mock_path_cls.home.return_value.__truediv__ = MagicMock(return_value=mock_path_inst)
            mock_signer_cls.from_file.return_value = MagicMock()
            mock_signer_cls.from_file.return_value.sign_request.return_value = {
                "signature-input": "sig1=test",
                "signature": "sig1=:dGVzdA==:",
            }

            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1

        captured = capsys.readouterr()
        assert "No content found" in captured.err

    def test_exits_1_on_non_200(self, capsys):
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)

        response = MagicMock()
        response.status_code = 500
        response.text = "Internal Server Error"
        mock_client.get.return_value = response

        with (
            patch.object(sys, "argv", ["find_content.py", "dQw4w9WgXcQ"]),
            patch("find_content.RequestSigner") as mock_signer_cls,
            patch("find_content.httpx.Client", return_value=mock_client),
            patch("find_content.Path") as mock_path_cls,
            patch("find_content.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("find_content.get_api_host", return_value="localhost:8000"),
            patch("find_content.extract_video_id", return_value="dQw4w9WgXcQ"),
        ):
            mock_path_inst = MagicMock()
            mock_path_inst.exists.return_value = True
            mock_path_cls.home.return_value.__truediv__ = MagicMock(return_value=mock_path_inst)
            mock_signer_cls.from_file.return_value = MagicMock()
            mock_signer_cls.from_file.return_value.sign_request.return_value = {
                "signature-input": "sig1=test",
                "signature": "sig1=:dGVzdA==:",
            }

            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1

        captured = capsys.readouterr()
        assert "500" in captured.err

    def test_exits_1_on_invalid_video_id(self, capsys):
        with (
            patch.object(sys, "argv", ["find_content.py", "not-a-valid-url"]),
            patch("find_content.extract_video_id", side_effect=ValueError("Invalid video ID")),
        ):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1

        captured = capsys.readouterr()
        assert "Invalid video ID" in captured.err

    def test_exits_1_on_missing_ssh_key(self, capsys):
        with (
            patch.object(sys, "argv", ["find_content.py", "dQw4w9WgXcQ"]),
            patch("find_content.extract_video_id", return_value="dQw4w9WgXcQ"),
            patch("find_content.Path") as mock_path_cls,
        ):
            mock_path_inst = MagicMock()
            mock_path_inst.exists.return_value = False
            mock_path_cls.home.return_value.__truediv__ = MagicMock(return_value=mock_path_inst)

            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1

        captured = capsys.readouterr()
        assert "SSH key not found" in captured.err
