"""Unit tests for search CLI."""

import json
import sys
from unittest.mock import MagicMock, patch

import pytest
from search import main


@pytest.fixture
def mock_signer():
    """Create a mock RequestSigner."""
    signer = MagicMock()
    signer.sign_request.return_value = {
        "signature-input": "sig1=test",
        "signature": "sig1=:dGVzdA==:",
    }
    return signer


def _make_mock_client(response):
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.post.return_value = response
    return mock_client


def _patch_search(mock_client):
    return (
        patch("search.RequestSigner"),
        patch("search.httpx.Client", return_value=mock_client),
        patch("search.Path"),
        patch("search.get_api_base", return_value="http://localhost:8000/api/v1"),
        patch("search.get_api_host", return_value="localhost:8000"),
    )


def _setup_signer_mock(mock_signer_cls):
    mock_path_inst = MagicMock()
    mock_path_inst.exists.return_value = True
    mock_signer_cls.home.return_value.__truediv__ = MagicMock(return_value=mock_path_inst)
    mock_signer_cls.from_file.return_value = MagicMock()
    mock_signer_cls.from_file.return_value.sign_request.return_value = {
        "signature-input": "sig1=test",
        "signature": "sig1=:dGVzdA==:",
    }


class TestMain:
    """Tests for search main CLI function."""

    def test_successful_search_prints_results(self, capsys):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "total": 2,
            "results": [
                {"score": 0.9123, "id": "abc123", "snippet": "First result snippet text here"},
                {"score": 0.8456, "id": "def456", "snippet": "Second result snippet text here"},
            ],
        }
        mock_client = _make_mock_client(response)

        patch_signer, patch_client, patch_path, patch_base, patch_host = _patch_search(mock_client)
        with (
            patch.object(sys, "argv", ["search.py", "test", "query"]),
            patch_signer as mock_signer_cls,
            patch_client,
            patch_path as mock_path_cls,
            patch_base,
            patch_host,
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
        assert "Found 2 results:" in captured.out
        assert "0.9123" in captured.out
        assert "abc123" in captured.out
        assert "First result snippet" in captured.out
        assert "0.8456" in captured.out
        assert "def456" in captured.out

    def test_multi_word_query_joined(self, capsys):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {"total": 0, "results": []}
        mock_client = _make_mock_client(response)

        patch_signer, patch_client, patch_path, patch_base, patch_host = _patch_search(mock_client)
        with (
            patch.object(sys, "argv", ["search.py", "how", "does", "auth", "work"]),
            patch_signer as mock_signer_cls,
            patch_client,
            patch_path as mock_path_cls,
            patch_base,
            patch_host,
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

        call_args = mock_client.post.call_args
        body = json.loads(call_args.kwargs["content"])
        assert body["query"] == "how does auth work"

    def test_limit_flag(self, capsys):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {"total": 0, "results": []}
        mock_client = _make_mock_client(response)

        patch_signer, patch_client, patch_path, patch_base, patch_host = _patch_search(mock_client)
        with (
            patch.object(sys, "argv", ["search.py", "test", "--limit", "3"]),
            patch_signer as mock_signer_cls,
            patch_client,
            patch_path as mock_path_cls,
            patch_base,
            patch_host,
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

        call_args = mock_client.post.call_args
        body = json.loads(call_args.kwargs["content"])
        assert body["limit"] == 3

    def test_json_flag_prints_raw(self, capsys):
        api_data = {"total": 1, "results": [{"score": 0.75, "id": "xyz789", "snippet": "some text"}]}
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = api_data
        mock_client = _make_mock_client(response)

        patch_signer, patch_client, patch_path, patch_base, patch_host = _patch_search(mock_client)
        with (
            patch.object(sys, "argv", ["search.py", "query", "--json"]),
            patch_signer as mock_signer_cls,
            patch_client,
            patch_path as mock_path_cls,
            patch_base,
            patch_host,
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
        # Output starts with "Searching: ...\n\n" before the JSON block
        json_part = captured.out.split("\n", 2)[-1].strip()
        parsed = json.loads(json_part)
        assert parsed == api_data

    def test_non_200_exits_1(self, capsys):
        response = MagicMock()
        response.status_code = 500
        response.text = "Internal Server Error"
        mock_client = _make_mock_client(response)

        patch_signer, patch_client, patch_path, patch_base, patch_host = _patch_search(mock_client)
        with (
            patch.object(sys, "argv", ["search.py", "test"]),
            patch_signer as mock_signer_cls,
            patch_client,
            patch_path as mock_path_cls,
            patch_base,
            patch_host,
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

    def test_request_body_contains_query_and_limit(self, capsys):
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {"total": 0, "results": []}
        mock_client = _make_mock_client(response)

        patch_signer, patch_client, patch_path, patch_base, patch_host = _patch_search(mock_client)
        with (
            patch.object(sys, "argv", ["search.py", "hello", "world", "--limit", "5"]),
            patch_signer as mock_signer_cls,
            patch_client,
            patch_path as mock_path_cls,
            patch_base,
            patch_host,
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

        call_args = mock_client.post.call_args
        body = json.loads(call_args.kwargs["content"])
        assert body["query"] == "hello world"
        assert body["limit"] == 5
