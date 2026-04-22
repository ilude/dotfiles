import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from scrub import scrub_secrets


# -- positive fixtures: one per secret kind --

@pytest.mark.parametrize("kind,text", [
    ("github", "token ghp_" + "A" * 36),
    ("github", "token ghs_" + "B" * 36),
    ("github", "token gho_" + "C" * 36),
    ("github", "token ghu_" + "D" * 36),
    ("github", "token ghr_" + "E" * 36),
    ("github", "github_pat_" + "F" * 82),
    ("stripe", "key sk_live_" + "G" * 20),
    ("stripe", "key sk_test_" + "H" * 20),
    ("stripe", "key pk_live_" + "I" * 20),
    ("stripe", "key pk_test_" + "J" * 20),
    ("stripe", "key rk_live_" + "K" * 20),
    ("aws-access", "AKIA" + "A1B2C3D4E5F6G7H8"),
    ("aws-access", "ASIA" + "A1B2C3D4E5F6G7H8"),
    ("aws-secret", "aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
    ("google-api", "AIza" + "a" * 35),
    ("google-oauth", "ya29.sometoken-abcABC123_-"),
    ("slack", "xoxb-1234567890-abcdefghij"),
    ("slack", "xoxa-1234567890-abcdefghij"),
    ("slack", "xoxp-1234567890-abcdefghij"),
    ("slack", "xoxr-1234567890-abcdefghij"),
    ("slack", "xoxs-1234567890-abcdefghij"),
    ("jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"),
    ("bearer", "Authorization: Bearer mySecretToken123"),
    ("ssh-key", "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQ\n-----END RSA PRIVATE KEY-----"),
    ("url-password", "https://user:s3cr3tpass@example.com/repo"),
    ("env-secret", "MY_API_TOKEN=supersecret123"),
    ("env-secret", "DB_PASSWORD=hunter2"),
    ("env-secret", "APP_SECRET=abc123xyz"),
    ("env-secret", "ENCRYPTION_KEY=base64encodedkey=="),
])
def test_positive_redacted(kind: str, text: str) -> None:
    result = scrub_secrets(text)
    assert "[REDACTED:" in result, f"Expected redaction in: {result!r}"
    # The original secret value should not appear verbatim after the keyword/prefix
    # (spot-check: raw text changed)
    assert result != text


# -- negative control: plain text must pass through unchanged --

def test_negative_plain_text_unchanged() -> None:
    plain = "This is a normal log line with no secrets. exit code 0. files changed: 3."
    assert scrub_secrets(plain) == plain


def test_negative_short_token_not_redacted() -> None:
    # "ghp_" with only 5 chars after -- below the 36-char minimum
    short = "ghp_short"
    assert scrub_secrets(short) == short


def test_negative_partial_aws_key_not_redacted() -> None:
    # AKIA prefix but only 10 chars -- not 16
    short = "AKIA1234567890"
    assert scrub_secrets(short) == short
