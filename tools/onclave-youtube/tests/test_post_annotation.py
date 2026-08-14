"""Tests for posting Onclave annotations."""

import argparse
from unittest.mock import MagicMock, patch

import httpx
import pytest
from conftest import mock_onclave_client
from post_annotation import main, run


def test_posts_annotation_body(tmp_path, capsys):
    text_file = tmp_path / "note.txt"
    text_file.write_text("annotation body", encoding="utf-8")
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {"id": "annotation_123", "title": "Note", "tags": ["test"]}
    client.post_json.return_value = response

    with patch("post_annotation.OnclaveClient", return_value=client):
        run(
            argparse.Namespace(
                content_id="content_123", title="Note", text_file=str(text_file), tags=["test"]
            )
        )

    assert client.post_json.call_args.args[0] == "/content/content_123/annotations"
    assert client.post_json.call_args.args[1] == {
        "text": "annotation body",
        "title": "Note",
        "source_type": "screenshot",
        "tags": ["test"],
    }
    assert "ID: annotation_123" in capsys.readouterr().out


def test_missing_annotation_file_fails(tmp_path):
    with patch("post_annotation.OnclaveClient") as onclave_client:
        try:
            run(
                argparse.Namespace(
                    content_id="content_123",
                    title="Note",
                    text_file=str(tmp_path / "missing.txt"),
                    tags=[],
                )
            )
        except SystemExit:
            pass
        else:
            raise AssertionError("expected missing text file to fail")
    onclave_client.assert_not_called()


def test_annotation_request_errors_keep_their_error_prefix(tmp_path, capsys):
    text_file = tmp_path / "note.txt"
    text_file.write_text("annotation body", encoding="utf-8")
    client = mock_onclave_client()
    client.post_json.side_effect = httpx.RequestError("connection reset")

    with (
        patch("post_annotation.OnclaveClient", return_value=client),
        pytest.raises(SystemExit) as exit_info,
    ):
        main(["content_123", "Note", str(text_file)])

    captured = capsys.readouterr()
    assert exit_info.value.code == 1
    assert captured.out == ""
    assert captured.err == "Error: Request failed: connection reset\n"
