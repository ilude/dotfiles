"""Tests for rebuilding embeddings through the Onclave API."""

import argparse
from unittest.mock import MagicMock, patch

from conftest import mock_onclave_client
from reindex_embeddings import _reindex_one, run


def test_reindex_one_posts_embedding_only_path():
    client = MagicMock()
    response = MagicMock(status_code=200)
    response.json.return_value = {
        "content_id": "content_123",
        "status": "completed",
        "chunk_count": 12,
        "model": "intfloat/e5-large-v2",
    }
    client.post.return_value = response

    assert _reindex_one(client, "content_123") == (12, "intfloat/e5-large-v2")
    client.post.assert_called_once_with("/content/content_123/reindex-embeddings")


def test_single_content_reports_completed_reindex(capsys):
    client = mock_onclave_client()
    response = MagicMock(status_code=200)
    response.json.return_value = {
        "content_id": "content_123",
        "status": "completed",
        "chunk_count": 12,
        "model": "intfloat/e5-large-v2",
    }
    client.post.return_value = response

    with patch("reindex_embeddings.OnclaveClient", return_value=client):
        run(argparse.Namespace(content_id="content_123", all=False, concurrency=4))

    output = capsys.readouterr().out
    assert "Chunks: 12" in output
    assert "Model: intfloat/e5-large-v2" in output


def test_all_content_uses_bounded_bulk_reindex(capsys):
    with (
        patch("reindex_embeddings._list_content_ids", return_value=["one", "two"]),
        patch(
            "reindex_embeddings._reindex_all",
            return_value=(2, 24, {"intfloat/e5-large-v2"}),
        ) as reindex_all,
    ):
        run(argparse.Namespace(content_id=None, all=True, concurrency=3))

    reindex_all.assert_called_once_with(["one", "two"], 3)
    output = capsys.readouterr().out
    assert "Reindexed videos: 2" in output
    assert "Chunks: 24" in output
