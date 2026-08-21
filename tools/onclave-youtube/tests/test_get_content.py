"""Tests for Onclave content retrieval."""

import argparse
from unittest.mock import MagicMock, patch

import pytest
from conftest import mock_onclave_client
from get_content import fetch_transcript, run


def test_fetch_transcript_returns_download_text():
    client = MagicMock()
    response = MagicMock(status_code=200, text="Transcript text")
    client.get.return_value = response

    assert fetch_transcript(client, "content_123") == "Transcript text"
    client.get.assert_called_once_with("/content/content_123/download")


def test_content_json_output(capsys):
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {"id": "content_123", "title": "Test Video"}
    client.get.return_value = response

    with patch("get_content.OnclaveClient", return_value=client):
        run(argparse.Namespace(content_id="content_123", json_output=True, transcript_only=False))

    assert '"title": "Test Video"' in capsys.readouterr().out


def test_human_output_renders_structured_summary_v1_deterministically(capsys):
    client = mock_onclave_client()
    content_response = MagicMock(status_code=200)
    content_response.json.return_value = {
        "id": "content_123",
        "title": "Test Video",
        "summary": "Legacy summary",
        "structured_summary": {
            "version": 1,
            "overview": "Structured overview",
            "key_points": ["First point", "Second point"],
        },
    }
    client.get.side_effect = [content_response, MagicMock(status_code=200, text="Transcript")]

    with patch("get_content.OnclaveClient", return_value=client):
        run(argparse.Namespace(content_id="content_123", json_output=False, transcript_only=False))

    assert capsys.readouterr().out == (
        "Title: Test Video\n"
        "Content Type: N/A\n"
        "\nSummary: Legacy summary\n"
        "\nStructured Summary: Structured overview\n"
        "- First point\n"
        "- Second point\n"
        "\nTranscript\n"
    )


def test_human_output_omits_absent_structured_summary(capsys):
    client = mock_onclave_client()
    content_response = MagicMock(status_code=200)
    content_response.json.return_value = {"id": "content_123", "title": "Test Video"}
    client.get.side_effect = [content_response, MagicMock(status_code=200, text="Transcript")]

    with patch("get_content.OnclaveClient", return_value=client):
        run(argparse.Namespace(content_id="content_123", json_output=False, transcript_only=False))

    output = capsys.readouterr().out
    assert "Structured Summary:" not in output
    assert output.endswith("\nTranscript\n")


def test_transcript_only_fails_when_download_is_missing():
    client = mock_onclave_client()
    content_response = MagicMock(status_code=200)
    content_response.json.return_value = {"id": "content_123"}
    client.get.side_effect = [content_response, MagicMock(status_code=404, text="")]

    with patch("get_content.OnclaveClient", return_value=client), pytest.raises(SystemExit):
        run(argparse.Namespace(content_id="content_123", json_output=False, transcript_only=True))
