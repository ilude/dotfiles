"""Tests for Onclave search."""

import argparse
import json
from unittest.mock import MagicMock, patch

import httpx
import pytest
from conftest import mock_onclave_client
from search import main, run


def test_search_posts_query_and_renders_results(capsys):
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {
        "total": 1,
        "results": [{"score": 0.9123, "id": "content_123", "snippet": "Result text"}],
    }
    client.post_json.return_value = response

    with patch("search.OnclaveClient", return_value=client):
        run(argparse.Namespace(query=["test", "query"], limit=3, json_output=False))

    assert client.post_json.call_args.args == ("/search", {"query": "test query", "limit": 3})
    assert "content_123" in capsys.readouterr().out


def test_search_main_reports_client_configuration_errors(capsys):
    with (
        patch("search.OnclaveClient", side_effect=RuntimeError("invalid signing key")),
        pytest.raises(SystemExit) as exit_info,
    ):
        main(["test query"])

    captured = capsys.readouterr()
    assert exit_info.value.code == 1
    assert captured.out == ""
    assert captured.err == "Error: invalid signing key\n"


def test_search_request_errors_keep_their_error_prefix(capsys):
    client = mock_onclave_client()
    client.post_json.side_effect = httpx.RequestError("connection reset")

    with (
        patch("search.OnclaveClient", return_value=client),
        pytest.raises(SystemExit) as exit_info,
    ):
        main(["test query"])

    captured = capsys.readouterr()
    assert exit_info.value.code == 1
    assert captured.out == "Searching: test query\n\n"
    assert captured.err == "Error: Request failed: connection reset\n"


def test_search_outputs_json(capsys):
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {"total": 0, "results": []}
    client.post_json.return_value = response

    with patch("search.OnclaveClient", return_value=client):
        run(argparse.Namespace(query=["test"], limit=6, json_output=True))

    assert json.loads(capsys.readouterr().out.split("\n", 2)[-1]) == {"total": 0, "results": []}
