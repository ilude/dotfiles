"""Unit tests for get_content CLI."""

import sys
from unittest.mock import MagicMock, patch

import pytest
from get_content import fetch_transcript, main


class TestFetchTranscript:
    """Unit tests for the fetch_transcript() function."""

    def test_returns_text_on_200(self):
        mock_client = MagicMock()
        mock_signer = MagicMock()
        mock_signer.sign_request.return_value = {"signature": "sig1=:dGVzdA==:"}

        resp = MagicMock()
        resp.status_code = 200
        resp.text = "Hello, this is the transcript."
        mock_client.get.return_value = resp

        result = fetch_transcript(mock_client, mock_signer, "http://localhost:8000/api/v1", "localhost:8000", "abc123")

        assert result == "Hello, this is the transcript."

    def test_returns_empty_on_non_200(self):
        mock_client = MagicMock()
        mock_signer = MagicMock()
        mock_signer.sign_request.return_value = {"signature": "sig1=:dGVzdA==:"}

        resp = MagicMock()
        resp.status_code = 404
        mock_client.get.return_value = resp

        result = fetch_transcript(mock_client, mock_signer, "http://localhost:8000/api/v1", "localhost:8000", "abc123")

        assert result == ""


class TestMain:
    """Tests for main() CLI function."""

    def test_json_flag_prints_json(self, capsys):
        content_resp = MagicMock()
        content_resp.status_code = 200
        content_resp.json.return_value = {"id": "abc123", "title": "Test Video", "content_type": "youtube"}

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = [content_resp]

        with (
            patch.object(sys, "argv", ["get_content.py", "abc123", "--json"]),
            patch("get_content.RequestSigner") as mock_signer_cls,
            patch("get_content.httpx.Client", return_value=mock_client),
            patch("get_content.Path") as mock_path_cls,
            patch("get_content.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("get_content.get_api_host", return_value="localhost:8000"),
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
        assert '"title": "Test Video"' in captured.out
        assert '"content_type": "youtube"' in captured.out

    def test_transcript_only_prints_transcript(self, capsys):
        content_resp = MagicMock()
        content_resp.status_code = 200
        content_resp.json.return_value = {"id": "abc123", "title": "Test Video", "content_type": "youtube"}

        download_resp = MagicMock()
        download_resp.status_code = 200
        download_resp.text = "This is the full transcript."

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = [content_resp, download_resp]

        with (
            patch.object(sys, "argv", ["get_content.py", "abc123", "--transcript-only"]),
            patch("get_content.RequestSigner") as mock_signer_cls,
            patch("get_content.httpx.Client", return_value=mock_client),
            patch("get_content.Path") as mock_path_cls,
            patch("get_content.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("get_content.get_api_host", return_value="localhost:8000"),
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
        assert "This is the full transcript." in captured.out

    def test_transcript_only_exits_1_when_empty(self, capsys):
        content_resp = MagicMock()
        content_resp.status_code = 200
        content_resp.json.return_value = {"id": "abc123", "title": "Test Video", "content_type": "youtube"}

        download_resp = MagicMock()
        download_resp.status_code = 404
        download_resp.text = ""

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = [content_resp, download_resp]

        with (
            patch.object(sys, "argv", ["get_content.py", "abc123", "--transcript-only"]),
            patch("get_content.RequestSigner") as mock_signer_cls,
            patch("get_content.httpx.Client", return_value=mock_client),
            patch("get_content.Path") as mock_path_cls,
            patch("get_content.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("get_content.get_api_host", return_value="localhost:8000"),
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
        assert "No transcript available." in captured.err

    def test_default_prints_metadata_and_transcript(self, capsys):
        content_resp = MagicMock()
        content_resp.status_code = 200
        content_resp.json.return_value = {
            "title": "My Test Video",
            "content_type": "youtube",
            "metadata": {"video_id": "dQw4w9WgXcQ"},
            "summary": "A test summary.",
        }

        download_resp = MagicMock()
        download_resp.status_code = 200
        download_resp.text = "Transcript body here."

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = [content_resp, download_resp]

        with (
            patch.object(sys, "argv", ["get_content.py", "abc123"]),
            patch("get_content.RequestSigner") as mock_signer_cls,
            patch("get_content.httpx.Client", return_value=mock_client),
            patch("get_content.Path") as mock_path_cls,
            patch("get_content.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("get_content.get_api_host", return_value="localhost:8000"),
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
        assert "Title: My Test Video" in captured.out
        assert "Content Type: youtube" in captured.out
        assert "Transcript body here." in captured.out

    def test_default_prints_no_transcript_message(self, capsys):
        content_resp = MagicMock()
        content_resp.status_code = 200
        content_resp.json.return_value = {
            "title": "My Test Video",
            "content_type": "youtube",
            "metadata": {},
        }

        download_resp = MagicMock()
        download_resp.status_code = 404
        download_resp.text = ""

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = [content_resp, download_resp]

        with (
            patch.object(sys, "argv", ["get_content.py", "abc123"]),
            patch("get_content.RequestSigner") as mock_signer_cls,
            patch("get_content.httpx.Client", return_value=mock_client),
            patch("get_content.Path") as mock_path_cls,
            patch("get_content.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("get_content.get_api_host", return_value="localhost:8000"),
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
        assert "No transcript text available." in captured.out

    def test_404_exits_1(self, capsys):
        content_resp = MagicMock()
        content_resp.status_code = 404
        content_resp.text = "not found"

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = [content_resp]

        with (
            patch.object(sys, "argv", ["get_content.py", "abc123"]),
            patch("get_content.RequestSigner") as mock_signer_cls,
            patch("get_content.httpx.Client", return_value=mock_client),
            patch("get_content.Path") as mock_path_cls,
            patch("get_content.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("get_content.get_api_host", return_value="localhost:8000"),
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
        assert "Content not found" in captured.err

    def test_non_200_exits_1(self, capsys):
        content_resp = MagicMock()
        content_resp.status_code = 500
        content_resp.text = "Internal Server Error"

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = [content_resp]

        with (
            patch.object(sys, "argv", ["get_content.py", "abc123"]),
            patch("get_content.RequestSigner") as mock_signer_cls,
            patch("get_content.httpx.Client", return_value=mock_client),
            patch("get_content.Path") as mock_path_cls,
            patch("get_content.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("get_content.get_api_host", return_value="localhost:8000"),
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
        assert "API returned 500" in captured.err

    def test_missing_ssh_key_exits_1(self, capsys):
        with (
            patch.object(sys, "argv", ["get_content.py", "abc123"]),
            patch("get_content.Path") as mock_path_cls,
            patch("get_content.get_api_base", return_value="http://localhost:8000/api/v1"),
            patch("get_content.get_api_host", return_value="localhost:8000"),
        ):
            # Path.home() / ".ssh" / "id_ed25519" chains two __truediv__ calls;
            # configure the final object so exists() returns False.
            mock_path_inst = MagicMock()
            mock_path_inst.exists.return_value = False
            mock_path_inst.__truediv__ = MagicMock(return_value=mock_path_inst)
            mock_path_cls.home.return_value.__truediv__ = MagicMock(return_value=mock_path_inst)

            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 1
        captured = capsys.readouterr()
        assert "SSH key not found" in captured.err
