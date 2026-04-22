"""Secret scrubber for tool-reduction corpus logging."""

from __future__ import annotations

import re

# Each tuple: (kind_label, compiled_pattern, optional_replacement_fn)
# For most patterns, the full match is replaced with [REDACTED:<kind>].
# For patterns that must preserve a prefix (bearer, aws_secret, env_style, url_password),
# a replacement string with a backreference is used instead.

_PATTERNS: list[tuple[str, re.Pattern[str], str | None]] = []


def _add(kind: str, pattern: str, flags: int = 0, replacement: str | None = None) -> None:
    _PATTERNS.append((kind, re.compile(pattern, flags), replacement))


# GitHub tokens
_add("github", r"ghp_[A-Za-z0-9]{36,}")
_add("github", r"ghs_[A-Za-z0-9]{36,}")
_add("github", r"gho_[A-Za-z0-9]{36,}")
_add("github", r"ghu_[A-Za-z0-9]{36,}")
_add("github", r"ghr_[A-Za-z0-9]{36,}")
_add("github", r"github_pat_[A-Za-z0-9_]{82,}")

# Stripe keys
_add("stripe", r"sk_live_[A-Za-z0-9]{20,}")
_add("stripe", r"sk_test_[A-Za-z0-9]{20,}")
_add("stripe", r"pk_live_[A-Za-z0-9]{20,}")
_add("stripe", r"pk_test_[A-Za-z0-9]{20,}")
_add("stripe", r"rk_live_[A-Za-z0-9]{20,}")

# AWS access key IDs
_add("aws-access", r"AKIA[0-9A-Z]{16}")
_add("aws-access", r"ASIA[0-9A-Z]{16}")

# AWS secret access key (value after assignment keyword)
_add(
    "aws-secret",
    r"(?i)(aws_secret_access_key\s*=\s*)\S+",
    replacement=r"\1[REDACTED:aws-secret]",
)

# Google API key
_add("google-api", r"AIza[0-9A-Za-z_-]{35}")

# Google OAuth token
_add("google-oauth", r"ya29\.[0-9A-Za-z_-]+")

# Slack tokens
_add("slack", r"xox[baprs]-[0-9A-Za-z-]{10,}")

# JWT (three base64url segments starting with eyJ)
_add("jwt", r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")

# Bearer token in Authorization header
_add(
    "bearer",
    r"(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._-]+",
    replacement=r"\1[REDACTED:bearer]",
)

# SSH private key blocks (multi-line)
_add(
    "ssh-key",
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----",
    flags=re.MULTILINE,
)

# URL-embedded password (://user:password@)
_add(
    "url-password",
    r"(?i)(https?://[^/@:\s]+):([^/@\s]+)@",
    replacement=r"\1:[REDACTED:url-password]@",
)

# .env-style KEY=value where KEY contains TOKEN, SECRET, KEY, or PASSWORD
_add(
    "env-secret",
    r"(?im)^([A-Z_]*(?:TOKEN|SECRET|KEY|PASSWORD)[A-Z_]*)\s*=\s*\S+",
    replacement=r"\1=[REDACTED:env-secret]",
)


def scrub_secrets(text: str) -> str:
    """Replace known secret patterns with [REDACTED:<kind>] markers."""
    for kind, pattern, replacement in _PATTERNS:
        if replacement is not None:
            text = pattern.sub(replacement, text)
        else:
            text = pattern.sub(f"[REDACTED:{kind}]", text)
    return text
