"""Tests for Onclave channel listing."""

import argparse
from unittest.mock import MagicMock, patch

import pytest
from channel_videos import run
from conftest import mock_onclave_client


def test_channel_listing_uses_onclave(capsys):
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {"videos": [{"title": "Test Video", "url": "https://youtu.be/id"}]}
    client.get.return_value = response

    with patch("channel_videos.OnclaveClient", return_value=client):
        run(argparse.Namespace(channel="@example", limit=50, json_output=False))

    assert "/youtube/channel?" in client.get.call_args.args[0]
    assert "via Onclave" in capsys.readouterr().out


def test_channel_listing_fails_without_local_fallback():
    client = mock_onclave_client()
    client.get.return_value = MagicMock(status_code=503, text="unavailable")

    with patch("channel_videos.OnclaveClient", return_value=client), pytest.raises(SystemExit):
        run(argparse.Namespace(channel="@example", limit=50, json_output=False))
