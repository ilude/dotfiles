"""Tests for resolving YouTube IDs through Onclave."""

from unittest.mock import MagicMock, patch

import pytest
from conftest import mock_onclave_client
from find_content import run


def test_finds_matching_content(capsys):
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {
        "items": [
            {
                "id": "content_123",
                "title": "Test Video",
                "status": "completed",
                "metadata": {"video_id": "dQw4w9WgXcQ"},
            }
        ]
    }
    client.get.return_value = response

    with patch("find_content.OnclaveClient", return_value=client):
        run("dQw4w9WgXcQ")

    assert "offset=0" in client.get.call_args.args[0]
    assert "Content ID: content_123" in capsys.readouterr().out


def test_searches_later_pages():
    client = mock_onclave_client()
    first_page = MagicMock(status_code=200)
    first_page.json.return_value = {
        "items": [{"metadata": {"video_id": f"other_{index}"}} for index in range(100)],
        "total": 101,
    }
    second_page = MagicMock(status_code=200)
    second_page.json.return_value = {
        "items": [{"id": "content_123", "metadata": {"video_id": "dQw4w9WgXcQ"}}],
        "total": 101,
    }
    client.get.side_effect = [first_page, second_page]

    with patch("find_content.OnclaveClient", return_value=client):
        run("dQw4w9WgXcQ")

    assert "offset=100" in client.get.call_args_list[1].args[0]


def test_fails_when_content_is_not_found():
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {"items": []}
    client.get.return_value = response

    with patch("find_content.OnclaveClient", return_value=client), pytest.raises(SystemExit):
        run("dQw4w9WgXcQ")
