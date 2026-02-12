"""Unit tests for api_config module."""

import os
from unittest.mock import patch

import pytest

from api_config import extract_video_id, get_api_base, get_api_host, load_secrets_file


class TestLoadSecretsFile:
    """Tests for load_secrets_file."""

    def test_load_secrets_file_from_dotfiles_env(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("MY_TEST_VAR=hello_world\n")

        with patch("api_config.Path.home", return_value=tmp_path / "fake_home"):
            # File won't exist at fake path, so create .dotfiles/.env there
            dotfiles = tmp_path / "fake_home" / ".dotfiles"
            dotfiles.mkdir(parents=True)
            secrets = dotfiles / ".env"
            secrets.write_text("LOAD_TEST_VAR=from_secrets\n")

            with patch.dict(os.environ, {}, clear=True):
                load_secrets_file()
                assert os.environ["LOAD_TEST_VAR"] == "from_secrets"

    def test_load_secrets_file_does_not_overwrite_existing(self, tmp_path):
        dotfiles = tmp_path / ".dotfiles"
        dotfiles.mkdir()
        secrets = dotfiles / ".env"
        secrets.write_text("EXISTING_VAR=new_value\n")

        with patch("api_config.Path.home", return_value=tmp_path):
            with patch.dict(os.environ, {"EXISTING_VAR": "original"}, clear=True):
                load_secrets_file()
                assert os.environ["EXISTING_VAR"] == "original"

    def test_load_secrets_file_handles_missing_file(self, tmp_path):
        with patch("api_config.Path.home", return_value=tmp_path):
            # No .dotfiles dir at all - should not raise
            load_secrets_file()

    def test_load_secrets_file_skips_comments_and_empty(self, tmp_path):
        dotfiles = tmp_path / ".dotfiles"
        dotfiles.mkdir()
        secrets = dotfiles / ".env"
        secrets.write_text("# This is a comment\n\nVALID_VAR=yes\n\n# Another comment\n")

        with patch("api_config.Path.home", return_value=tmp_path):
            with patch.dict(os.environ, {}, clear=True):
                load_secrets_file()
                assert os.environ["VALID_VAR"] == "yes"
                assert "This is a comment" not in os.environ

    def test_load_secrets_file_handles_export_prefix(self, tmp_path):
        dotfiles = tmp_path / ".dotfiles"
        dotfiles.mkdir()
        secrets = dotfiles / ".env"
        secrets.write_text("export EXPORTED_VAR=exported_value\n")

        with patch("api_config.Path.home", return_value=tmp_path):
            with patch.dict(os.environ, {}, clear=True):
                load_secrets_file()
                assert os.environ["EXPORTED_VAR"] == "exported_value"

    def test_load_secrets_file_strips_quotes(self, tmp_path):
        dotfiles = tmp_path / ".dotfiles"
        dotfiles.mkdir()
        secrets = dotfiles / ".env"
        secrets.write_text('QUOTED_VAR="quoted_value"\nSINGLE_Q=\'single\'\n')

        with patch("api_config.Path.home", return_value=tmp_path):
            with patch.dict(os.environ, {}, clear=True):
                load_secrets_file()
                assert os.environ["QUOTED_VAR"] == "quoted_value"
                assert os.environ["SINGLE_Q"] == "single"

    def test_load_secrets_file_fallback_to_dot_secrets(self, tmp_path):
        dotfiles = tmp_path / ".dotfiles"
        dotfiles.mkdir()
        # No .env, but .secrets exists
        secrets = dotfiles / ".secrets"
        secrets.write_text("FALLBACK_VAR=from_secrets\n")

        with patch("api_config.Path.home", return_value=tmp_path):
            with patch.dict(os.environ, {}, clear=True):
                load_secrets_file()
                assert os.environ["FALLBACK_VAR"] == "from_secrets"


class TestGetApiBase:
    """Tests for get_api_base."""

    def test_get_api_base_returns_env_var(self):
        with patch.dict(os.environ, {"MENOS_API_BASE": "http://custom:9000/api/v1"}):
            with patch("api_config.load_secrets_file"):
                assert get_api_base() == "http://custom:9000/api/v1"

    def test_get_api_base_returns_default(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch("api_config.load_secrets_file"):
                result = get_api_base()
                assert result == "http://192.168.16.241:8000/api/v1"


class TestGetApiHost:
    """Tests for get_api_host."""

    def test_get_api_host_extracts_netloc(self):
        with patch("api_config.get_api_base", return_value="http://myhost:8000/api/v1"):
            assert get_api_host() == "myhost:8000"

    def test_get_api_host_extracts_default_netloc(self):
        with patch("api_config.get_api_base", return_value="http://192.168.16.241:8000/api/v1"):
            assert get_api_host() == "192.168.16.241:8000"


class TestExtractVideoId:
    """Tests for extract_video_id."""

    def test_extract_video_id_watch_url(self):
        assert extract_video_id("https://youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_extract_video_id_short_url(self):
        assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_extract_video_id_embed_url(self):
        assert extract_video_id("https://youtube.com/embed/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_extract_video_id_shorts_url(self):
        assert extract_video_id("https://youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_extract_video_id_raw_id(self):
        assert extract_video_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_extract_video_id_with_params(self):
        url = "https://youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLtest"
        assert extract_video_id(url) == "dQw4w9WgXcQ"

    def test_extract_video_id_invalid_raises(self):
        with pytest.raises(ValueError, match="Could not extract video ID"):
            extract_video_id("not-a-valid-url-or-id")

    def test_extract_video_id_empty_raises(self):
        with pytest.raises(ValueError, match="Could not extract video ID"):
            extract_video_id("")

    def test_extract_video_id_www_watch_url(self):
        assert extract_video_id("https://www.youtube.com/watch?v=abc_def-123") == "abc_def-123"
