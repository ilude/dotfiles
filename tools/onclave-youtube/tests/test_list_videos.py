"""Unit tests for list_videos CLI."""

import sys
from unittest.mock import MagicMock, patch

import pytest
from list_videos import _fmt_date, main


@pytest.fixture
def mock_signer():
    """Create a mock RequestSigner."""
    signer = MagicMock()
    signer.sign_request.return_value = {
        "signature-input": "sig1=test",
        "signature": "sig1=:dGVzdA==:",
    }
    return signer


def _make_item(i, created_at="2024-01-15T10:30:00Z", published_at="2024-01-10T00:00:00Z"):
    return {
        "title": f"Video Title {i}",
        "metadata": {"video_id": f"vid{i:03d}", "published_at": published_at},
        "chunk_count": i * 2,
        "created_at": created_at,
        "tags": [],
    }


def _run_main(
    argv, mock_client, *, api_base="http://localhost:8000/api/v1", api_host="localhost:8000"
):
    """Patch all external dependencies and call main()."""
    with (
        patch.object(sys, "argv", argv),
        patch("list_videos.RequestSigner") as mock_signer_cls,
        patch("list_videos.httpx.Client", return_value=mock_client),
        patch("list_videos.Path") as mock_path_cls,
        patch("list_videos.get_api_base", return_value=api_base),
        patch("list_videos.get_api_host", return_value=api_host),
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


def _make_mock_client(items, total=None):
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "items": items,
        "total": total if total is not None else len(items),
    }
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.return_value = response
    return mock_client


class TestFmtDate:
    def test_formats_iso_string(self):
        assert _fmt_date("2024-01-15T10:30:00Z") == "2024-01-15"

    def test_returns_na_for_none(self):
        assert _fmt_date(None) == "n/a"

    def test_returns_na_for_empty(self):
        assert _fmt_date("") == "n/a"


class TestMain:
    def test_default_lists_videos(self, capsys):
        items = [_make_item(1), _make_item(2)]
        mock_client = _make_mock_client(items)

        _run_main(["list_videos.py"], mock_client)

        captured = capsys.readouterr()
        assert "Video Title 1" in captured.out
        assert "Video Title 2" in captured.out
        assert "Showing 2 of 2" in captured.out

    def test_all_flag_excludes_tags_param(self, capsys):
        mock_client = _make_mock_client([_make_item(1)])

        _run_main(["list_videos.py", "--all"], mock_client)

        url = mock_client.get.call_args[0][0]
        assert "&exclude_tags=" in url

    def test_test_flag_adds_tags_param(self, capsys):
        mock_client = _make_mock_client([_make_item(1)])

        _run_main(["list_videos.py", "--test"], mock_client)

        url = mock_client.get.call_args[0][0]
        assert "&tags=test&exclude_tags=" in url

    def test_custom_limit(self, capsys):
        items = [_make_item(i, created_at=f"2024-01-{i:02d}T00:00:00Z") for i in range(1, 11)]
        mock_client = _make_mock_client(items, total=10)

        _run_main(["list_videos.py", "5"], mock_client)

        captured = capsys.readouterr()
        assert "Showing 5 of 10" in captured.out

    def test_no_items_prints_message(self, capsys):
        mock_client = _make_mock_client([])

        _run_main(["list_videos.py"], mock_client)

        captured = capsys.readouterr()
        assert "No videos found." in captured.out

    def test_non_200_exits_1(self):
        response = MagicMock()
        response.status_code = 500
        response.text = "Internal Server Error"
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = response

        with pytest.raises(SystemExit) as exc_info:
            _run_main(["list_videos.py"], mock_client)
        assert exc_info.value.code == 1
