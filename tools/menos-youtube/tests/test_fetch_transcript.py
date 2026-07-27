"""Tests for deterministic local transcript proxy configuration."""

import pytest
from fetch_transcript import YouTubeTranscriptService


def test_proxy_enabled_requires_credentials(monkeypatch):
    monkeypatch.delenv("WEBSHARE_PROXY_USERNAME", raising=False)
    monkeypatch.delenv("WEBSHARE_PROXY_PASSWORD", raising=False)

    with pytest.raises(ValueError, match="Webshare proxy credentials are required"):
        YouTubeTranscriptService(use_proxy=True)


def test_proxy_can_be_explicitly_disabled(monkeypatch):
    monkeypatch.delenv("WEBSHARE_PROXY_USERNAME", raising=False)
    monkeypatch.delenv("WEBSHARE_PROXY_PASSWORD", raising=False)

    service = YouTubeTranscriptService(use_proxy=False)

    assert service.is_proxy_configured() is False
