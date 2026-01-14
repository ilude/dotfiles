#!/usr/bin/env python
"""Unit tests for YouTube transcript fetcher."""

import json
import os
import subprocess
import sys
from unittest.mock import MagicMock, patch

import pytest

from fetch_transcript import (
    YouTubeTranscriptService,
    extract_video_id,
    main,
)


class TestExtractVideoId:
    """Tests for video ID extraction."""

    def test_extract_from_watch_url(self):
        url = "https://youtube.com/watch?v=dQw4w9WgXcQ"
        assert extract_video_id(url) == "dQw4w9WgXcQ"

    def test_extract_from_www_watch_url(self):
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        assert extract_video_id(url) == "dQw4w9WgXcQ"

    def test_extract_from_short_url(self):
        url = "https://youtu.be/dQw4w9WgXcQ"
        assert extract_video_id(url) == "dQw4w9WgXcQ"

    def test_extract_from_url_with_params(self):
        url = "https://youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLtest"
        assert extract_video_id(url) == "dQw4w9WgXcQ"

    def test_extract_raw_video_id(self):
        """Should return raw 11-char ID as-is."""
        video_id = "dQw4w9WgXcQ"
        assert extract_video_id(video_id) == "dQw4w9WgXcQ"

    def test_extract_video_id_with_underscores(self):
        url = "https://youtube.com/watch?v=abc_def-123"
        assert extract_video_id(url) == "abc_def-123"

    def test_invalid_url_raises_error(self):
        with pytest.raises(ValueError, match="Could not extract video ID"):
            extract_video_id("not-a-valid-url")

    def test_empty_string_raises_error(self):
        with pytest.raises(ValueError, match="Could not extract video ID"):
            extract_video_id("")

    def test_short_id_raises_error(self):
        """IDs must be exactly 11 characters."""
        with pytest.raises(ValueError, match="Could not extract video ID"):
            extract_video_id("abc123")


class TestYouTubeTranscriptService:
    """Tests for the transcript service."""

    def test_init_without_proxy(self):
        """Service should work without proxy credentials."""
        with patch.dict(os.environ, {}, clear=True):
            service = YouTubeTranscriptService()
            assert not service.is_proxy_configured()

    def test_init_with_proxy_env_vars(self):
        """Service should configure proxy from env vars."""
        env = {
            "WEBSHARE_PROXY_USERNAME": "testuser",
            "WEBSHARE_PROXY_PASSWORD": "testpass",
        }
        with patch.dict(os.environ, env, clear=True):
            service = YouTubeTranscriptService()
            assert service.is_proxy_configured()

    def test_init_with_explicit_credentials(self):
        """Service should accept explicit credentials."""
        service = YouTubeTranscriptService(
            proxy_username="testuser",
            proxy_password="testpass",
        )
        assert service.is_proxy_configured()

    def test_init_proxy_disabled(self):
        """Service should respect use_proxy=False."""
        service = YouTubeTranscriptService(
            proxy_username="testuser",
            proxy_password="testpass",
            use_proxy=False,
        )
        assert not service.is_proxy_configured()

    def test_init_proxy_disabled_via_env(self):
        """Service should respect YOUTUBE_TRANSCRIPT_USE_PROXY=false."""
        env = {
            "WEBSHARE_PROXY_USERNAME": "testuser",
            "WEBSHARE_PROXY_PASSWORD": "testpass",
            "YOUTUBE_TRANSCRIPT_USE_PROXY": "false",
        }
        with patch.dict(os.environ, env, clear=True):
            service = YouTubeTranscriptService()
            assert not service.is_proxy_configured()

    def test_fetch_transcript_combines_snippets(self):
        """Transcript should be combined from snippets."""
        mock_snippet1 = MagicMock()
        mock_snippet1.text = "Hello"
        mock_snippet2 = MagicMock()
        mock_snippet2.text = "World"

        mock_fetched = MagicMock()
        mock_fetched.snippets = [mock_snippet1, mock_snippet2]

        with patch("youtube_transcript_api.YouTubeTranscriptApi") as mock_api_class:
            mock_api = MagicMock()
            mock_api.fetch.return_value = mock_fetched
            mock_api_class.return_value = mock_api

            service = YouTubeTranscriptService(use_proxy=False)
            result = service.fetch_transcript("test123test")

            assert result == "Hello World"
            mock_api.fetch.assert_called_once_with("test123test", languages=["en"])

    def test_fetch_timed_transcript_returns_segments(self):
        """Timed transcript should include start and duration."""
        mock_snippet = MagicMock()
        mock_snippet.text = "Hello"
        mock_snippet.start = 1.5
        mock_snippet.duration = 2.0

        mock_fetched = MagicMock()
        mock_fetched.snippets = [mock_snippet]

        with patch("youtube_transcript_api.YouTubeTranscriptApi") as mock_api_class:
            mock_api = MagicMock()
            mock_api.fetch.return_value = mock_fetched
            mock_api_class.return_value = mock_api

            service = YouTubeTranscriptService(use_proxy=False)
            result = service.fetch_timed_transcript("test123test")

            assert len(result) == 1
            assert result[0]["text"] == "Hello"
            assert result[0]["start"] == 1.5
            assert result[0]["duration"] == 2.0

    def test_fetch_transcript_custom_languages(self):
        """Should pass custom languages to API."""
        mock_fetched = MagicMock()
        mock_fetched.snippets = []

        with patch("youtube_transcript_api.YouTubeTranscriptApi") as mock_api_class:
            mock_api = MagicMock()
            mock_api.fetch.return_value = mock_fetched
            mock_api_class.return_value = mock_api

            service = YouTubeTranscriptService(use_proxy=False)
            service.fetch_transcript("test123test", languages=["de", "en"])

            mock_api.fetch.assert_called_once_with("test123test", languages=["de", "en"])


class TestCLI:
    """Tests for command-line interface."""

    def test_cli_basic_transcript(self, capsys):
        """CLI should output transcript text."""
        mock_snippet = MagicMock()
        mock_snippet.text = "Test transcript"

        mock_fetched = MagicMock()
        mock_fetched.snippets = [mock_snippet]

        with patch("youtube_transcript_api.YouTubeTranscriptApi") as mock_api_class:
            mock_api = MagicMock()
            mock_api.fetch.return_value = mock_fetched
            mock_api_class.return_value = mock_api

            with patch.object(sys, "argv", ["fetch_transcript.py", "dQw4w9WgXcQ"]):
                main()

            captured = capsys.readouterr()
            assert "Test transcript" in captured.out

    def test_cli_json_output(self, capsys):
        """CLI --json should output valid JSON."""
        mock_snippet = MagicMock()
        mock_snippet.text = "Test"

        mock_fetched = MagicMock()
        mock_fetched.snippets = [mock_snippet]

        with patch("youtube_transcript_api.YouTubeTranscriptApi") as mock_api_class:
            mock_api = MagicMock()
            mock_api.fetch.return_value = mock_fetched
            mock_api_class.return_value = mock_api

            with patch.object(sys, "argv", ["fetch_transcript.py", "dQw4w9WgXcQ", "--json"]):
                main()

            captured = capsys.readouterr()
            result = json.loads(captured.out)
            assert result["video_id"] == "dQw4w9WgXcQ"
            assert result["transcript"] == "Test"

    def test_cli_timed_output(self, capsys):
        """CLI --timed should show timestamps."""
        mock_snippet = MagicMock()
        mock_snippet.text = "Hello"
        mock_snippet.start = 5.5
        mock_snippet.duration = 2.0

        mock_fetched = MagicMock()
        mock_fetched.snippets = [mock_snippet]

        with patch("youtube_transcript_api.YouTubeTranscriptApi") as mock_api_class:
            mock_api = MagicMock()
            mock_api.fetch.return_value = mock_fetched
            mock_api_class.return_value = mock_api

            with patch.object(sys, "argv", ["fetch_transcript.py", "dQw4w9WgXcQ", "--timed"]):
                main()

            captured = capsys.readouterr()
            assert "[5.5s]" in captured.out
            assert "Hello" in captured.out

    def test_cli_invalid_url_exits_1(self):
        """CLI should exit 1 on invalid URL."""
        with patch.object(sys, "argv", ["fetch_transcript.py", "invalid"]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
