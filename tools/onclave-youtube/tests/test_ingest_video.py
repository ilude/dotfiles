"""Tests for Onclave video ingestion."""

import argparse
from unittest.mock import MagicMock, patch

import httpx
import pytest
from conftest import mock_onclave_client
from ingest_video import _load_local_payload, main, run


def test_loads_completed_local_cache(tmp_path):
    video_id = "dQw4w9WgXcQ"
    video_dir = tmp_path / ".dotfiles" / "yt" / video_id
    video_dir.mkdir(parents=True)
    (video_dir / ".complete").write_text('{"transcript": true}', encoding="utf-8")
    (video_dir / "transcript.txt").write_text("transcript text", encoding="utf-8")
    (video_dir / "metadata.json").write_text('{"title": "Test Video"}', encoding="utf-8")

    with patch("ingest_video.Path.home", return_value=tmp_path):
        payload = _load_local_payload(video_id)

    assert payload == {
        "url": f"https://youtube.com/watch?v={video_id}",
        "transcript_text": "transcript text",
        "transcript_format": "plain",
        "metadata": {"title": "Test Video"},
    }


def test_ingest_posts_video_url_and_shows_job(capsys):
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {
        "title": "Test Video",
        "content_id": "content_123",
        "content_type": "youtube",
        "job_id": "job_123",
    }
    client.post_json.return_value = response
    client.api_base = "https://onclave.example/api/v1"

    with patch("ingest_video.OnclaveClient", return_value=client):
        run(
            argparse.Namespace(
                video="dQw4w9WgXcQ", test=False, from_local=False, wait=False, verbose=False
            )
        )

    client.post_json.assert_called_once_with(
        "/ingest", {"url": "https://youtube.com/watch?v=dQw4w9WgXcQ"}
    )
    assert capsys.readouterr().out == (
        "Ingesting video: dQw4w9WgXcQ\n"
        "API: https://onclave.example/api/v1/ingest\n"
        "\n"
        "Video ID: dQw4w9WgXcQ\n"
        "Title: Test Video\n"
        "Content ID: content_123\n"
        "Content Type: youtube\n"
        "Job ID: job_123\n"
        "\n"
    )


def test_ingest_configuration_error_does_not_emit_progress(capsys):
    with (
        patch("ingest_video.OnclaveClient", side_effect=RuntimeError("invalid signing key")),
        pytest.raises(SystemExit) as exit_info,
    ):
        main(["dQw4w9WgXcQ"])

    captured = capsys.readouterr()
    assert exit_info.value.code == 1
    assert captured.out == ""
    assert captured.err == "Error: invalid signing key\n"


def test_ingest_request_errors_keep_their_error_prefix(capsys):
    client = mock_onclave_client()
    client.api_base = "https://onclave.example/api/v1"
    client.post_json.side_effect = httpx.RequestError("connection reset")

    with (
        patch("ingest_video.OnclaveClient", return_value=client),
        pytest.raises(SystemExit) as exit_info,
    ):
        main(["dQw4w9WgXcQ"])

    captured = capsys.readouterr()
    assert exit_info.value.code == 1
    assert captured.out == (
        "Ingesting video: dQw4w9WgXcQ\nAPI: https://onclave.example/api/v1/ingest\n\n"
    )
    assert captured.err == "Error: Request failed: connection reset\n"


def test_ingest_waits_for_returned_job():
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {"job_id": "job_123"}
    client.post_json.return_value = response

    with (
        patch("ingest_video.OnclaveClient", return_value=client),
        patch("ingest_video.poll_job") as poll_job,
    ):
        run(
            argparse.Namespace(
                video="dQw4w9WgXcQ", test=True, from_local=False, wait=True, verbose=True
            )
        )

    assert client.post_json.call_args.args[0] == "/ingest?tags=test"
    poll_job.assert_called_once_with(client, "job_123", verbose=True)
