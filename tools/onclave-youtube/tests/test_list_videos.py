"""Tests for Onclave video listing."""

import argparse
from unittest.mock import MagicMock, patch

from conftest import mock_onclave_client
from list_videos import _fmt_date, run


def test_formats_iso_string():
    assert _fmt_date("2024-01-15T10:30:00Z") == "2024-01-15"


def test_lists_most_recent_videos(capsys):
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {
        "items": [
            {
                "title": "Test Video",
                "metadata": {"video_id": "dQw4w9WgXcQ"},
                "created_at": "2024-01-15T10:30:00Z",
            }
        ],
        "total": 1,
    }
    client.get.return_value = response

    with patch("list_videos.OnclaveClient", return_value=client):
        run(argparse.Namespace(limit=10, all=False, test=False))

    assert "content_type=youtube" in client.get.call_args.args[0]
    assert "Test Video" in capsys.readouterr().out


def test_list_tags_test_content_when_requested():
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {"items": [], "total": 0}
    client.get.return_value = response

    with patch("list_videos.OnclaveClient", return_value=client):
        run(argparse.Namespace(limit=10, all=False, test=True))

    assert "tags=test" in client.get.call_args.args[0]
