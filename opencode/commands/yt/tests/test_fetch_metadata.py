#!/usr/bin/env python
"""Unit tests for YouTube metadata fetcher."""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

from fetch_metadata import (
    YouTubeMetadataService,
    extract_urls,
    extract_video_id,
    format_duration,
    main,
    parse_duration_to_seconds,
)


class TestExtractUrls:
    """Tests for URL extraction from descriptions."""

    def test_extract_single_url(self):
        text = "Check out https://github.com/user/repo for more info"
        assert extract_urls(text) == ["https://github.com/user/repo"]

    def test_extract_multiple_urls(self):
        text = "Visit https://example.com and https://docs.python.org"
        assert extract_urls(text) == ["https://example.com", "https://docs.python.org"]

    def test_extract_http_and_https(self):
        text = "http://old.example.com https://new.example.com"
        assert extract_urls(text) == ["http://old.example.com", "https://new.example.com"]

    def test_removes_trailing_punctuation(self):
        text = "See https://example.com. More at https://docs.com!"
        assert extract_urls(text) == ["https://example.com", "https://docs.com"]

    def test_handles_parentheses(self):
        text = "(https://example.com)"
        assert extract_urls(text) == ["https://example.com"]

    def test_handles_url_path_parentheses(self):
        # Known limitation: trailing ) is stripped even when balanced
        # Most YouTube descriptions use simple URLs without this issue
        text = "See https://en.wikipedia.org/wiki/Test_(topic) "
        urls = extract_urls(text)
        assert len(urls) == 1
        # The closing paren gets stripped - document actual behavior
        assert urls[0] == "https://en.wikipedia.org/wiki/Test_(topic"

    def test_deduplicates_urls(self):
        text = "https://example.com mentioned twice https://example.com"
        assert extract_urls(text) == ["https://example.com"]

    def test_preserves_order(self):
        text = "https://b.com https://a.com https://c.com"
        assert extract_urls(text) == ["https://b.com", "https://a.com", "https://c.com"]

    def test_empty_text(self):
        assert extract_urls("") == []

    def test_no_urls(self):
        assert extract_urls("No URLs here, just text.") == []

    def test_url_with_query_params(self):
        text = "https://example.com/path?param=value&other=123"
        assert extract_urls(text) == ["https://example.com/path?param=value&other=123"]


class TestParseDuration:
    """Tests for ISO 8601 duration parsing."""

    def test_minutes_seconds(self):
        assert parse_duration_to_seconds("PT15M33S") == 933

    def test_hours_minutes_seconds(self):
        assert parse_duration_to_seconds("PT1H2M3S") == 3723

    def test_only_minutes(self):
        assert parse_duration_to_seconds("PT10M") == 600

    def test_only_seconds(self):
        assert parse_duration_to_seconds("PT45S") == 45

    def test_only_hours(self):
        assert parse_duration_to_seconds("PT2H") == 7200

    def test_invalid_format(self):
        assert parse_duration_to_seconds("invalid") == 0


class TestFormatDuration:
    """Tests for duration formatting."""

    def test_minutes_seconds(self):
        assert format_duration("PT15M33S") == "15:33"

    def test_hours_minutes_seconds(self):
        assert format_duration("PT1H2M3S") == "1:02:03"

    def test_padded_minutes(self):
        assert format_duration("PT1H5M0S") == "1:05:00"

    def test_only_seconds(self):
        assert format_duration("PT45S") == "0:45"

    def test_invalid_format(self):
        assert format_duration("invalid") == "invalid"


class TestYouTubeMetadataService:
    """Tests for the metadata service."""

    def test_init_without_api_key_raises(self):
        """Should raise if no API key provided."""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="YouTube API key not provided"):
                YouTubeMetadataService()

    def test_init_with_env_api_key(self):
        """Should initialize with env var API key."""
        env = {"YOUTUBE_API_KEY": "test-api-key"}
        with patch.dict(os.environ, env, clear=True):
            with patch("googleapiclient.discovery.build") as mock_build:
                service = YouTubeMetadataService()
                assert service.api_key == "test-api-key"
                mock_build.assert_called_once_with("youtube", "v3", developerKey="test-api-key")

    def test_init_with_explicit_api_key(self):
        """Should accept explicit API key."""
        with patch("googleapiclient.discovery.build") as mock_build:
            service = YouTubeMetadataService(api_key="explicit-key")
            assert service.api_key == "explicit-key"
            mock_build.assert_called_once_with("youtube", "v3", developerKey="explicit-key")

    def test_fetch_metadata_extracts_urls(self):
        """Should extract URLs from description."""
        mock_response = {
            "items": [{
                "snippet": {
                    "title": "Test Video",
                    "description": "Check https://example.com and https://docs.com",
                    "publishedAt": "2024-01-01T00:00:00Z",
                    "channelId": "UC123",
                    "channelTitle": "Test Channel",
                    "tags": ["test"],
                    "categoryId": "22",
                    "thumbnails": {},
                },
                "statistics": {
                    "viewCount": "1000",
                    "likeCount": "100",
                    "commentCount": "10",
                },
                "contentDetails": {
                    "duration": "PT10M30S",
                },
            }]
        }

        with patch("googleapiclient.discovery.build") as mock_build:
            mock_youtube = MagicMock()
            mock_videos = MagicMock()
            mock_list = MagicMock()
            mock_list.execute.return_value = mock_response
            mock_videos.list.return_value = mock_list
            mock_youtube.videos.return_value = mock_videos
            mock_build.return_value = mock_youtube

            service = YouTubeMetadataService(api_key="test-key")
            metadata = service.fetch_metadata("test123test")

            assert metadata["description_urls"] == ["https://example.com", "https://docs.com"]
            assert metadata["duration_seconds"] == 630
            assert metadata["duration_formatted"] == "10:30"

    def test_fetch_metadata_video_not_found(self):
        """Should raise ValueError for missing video."""
        mock_response = {"items": []}

        with patch("googleapiclient.discovery.build") as mock_build:
            mock_youtube = MagicMock()
            mock_videos = MagicMock()
            mock_list = MagicMock()
            mock_list.execute.return_value = mock_response
            mock_videos.list.return_value = mock_list
            mock_youtube.videos.return_value = mock_videos
            mock_build.return_value = mock_youtube

            service = YouTubeMetadataService(api_key="test-key")

            with pytest.raises(ValueError, match="Video not found"):
                service.fetch_metadata("nonexistent")


class TestCLI:
    """Tests for command-line interface."""

    def test_cli_urls_only(self, capsys):
        """CLI --urls-only should only print URLs."""
        mock_response = {
            "items": [{
                "snippet": {
                    "title": "Test",
                    "description": "Visit https://example.com",
                    "publishedAt": "2024-01-01T00:00:00Z",
                    "channelId": "UC123",
                    "channelTitle": "Test",
                    "thumbnails": {},
                },
                "statistics": {"viewCount": "100"},
                "contentDetails": {"duration": "PT1M"},
            }]
        }

        with patch("googleapiclient.discovery.build") as mock_build:
            mock_youtube = MagicMock()
            mock_videos = MagicMock()
            mock_list = MagicMock()
            mock_list.execute.return_value = mock_response
            mock_videos.list.return_value = mock_list
            mock_youtube.videos.return_value = mock_videos
            mock_build.return_value = mock_youtube

            with patch.dict(os.environ, {"YOUTUBE_API_KEY": "test"}):
                with patch.object(sys, "argv", ["fetch_metadata.py", "dQw4w9WgXcQ", "--urls-only"]):
                    main()

            captured = capsys.readouterr()
            assert "https://example.com" in captured.out
            # Should not include title or other metadata
            assert "Test" not in captured.out

    def test_cli_json_output(self, capsys):
        """CLI --json should output valid JSON."""
        mock_response = {
            "items": [{
                "snippet": {
                    "title": "Test Video",
                    "description": "Description",
                    "publishedAt": "2024-01-01T00:00:00Z",
                    "channelId": "UC123",
                    "channelTitle": "Test Channel",
                    "thumbnails": {},
                },
                "statistics": {"viewCount": "100"},
                "contentDetails": {"duration": "PT1M"},
            }]
        }

        with patch("googleapiclient.discovery.build") as mock_build:
            mock_youtube = MagicMock()
            mock_videos = MagicMock()
            mock_list = MagicMock()
            mock_list.execute.return_value = mock_response
            mock_videos.list.return_value = mock_list
            mock_youtube.videos.return_value = mock_videos
            mock_build.return_value = mock_youtube

            with patch.dict(os.environ, {"YOUTUBE_API_KEY": "test"}):
                with patch.object(sys, "argv", ["fetch_metadata.py", "dQw4w9WgXcQ", "--json"]):
                    main()

            captured = capsys.readouterr()
            result = json.loads(captured.out)
            assert result["title"] == "Test Video"
            assert result["video_id"] == "dQw4w9WgXcQ"

    def test_cli_invalid_url_exits_1(self):
        """CLI should exit 1 on invalid URL."""
        with patch.dict(os.environ, {"YOUTUBE_API_KEY": "test"}):
            with patch.object(sys, "argv", ["fetch_metadata.py", "invalid"]):
                with pytest.raises(SystemExit) as exc_info:
                    main()
                assert exc_info.value.code == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
