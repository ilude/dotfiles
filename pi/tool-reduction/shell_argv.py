"""Light shell-shape normalization for reducer rule classification."""

from __future__ import annotations

import re

_TOKEN_RE = re.compile(r"&&|[;|]|\"(?:\\.|[^\"])*\"|'[^']*'|[^\s;&|]+")
_ENV_ASSIGNMENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=.*$")


def _tokenize(argv: list[str]) -> list[str]:
    command = " ".join(argv)
    return [
        token[1:-1] if len(token) >= 2 and token[0] == token[-1] and token[0] in "\"'" else token
        for token in _TOKEN_RE.findall(command)
    ]


def _after_last(tokens: list[str], operator: str) -> list[str]:
    try:
        index = len(tokens) - 1 - tokens[::-1].index(operator)
    except ValueError:
        return tokens
    return tokens[index + 1 :]


def normalize_shell_argv(argv: list[str]) -> list[str]:
    """Normalize measured shell leaders without attempting full shell parsing."""
    tokens = _tokenize(argv)

    if tokens and tokens[0] == "set" and ";" in tokens:
        tokens = tokens[tokens.index(";") + 1 :]

    while tokens and tokens[0] == "cd":
        separators = [i for i, token in enumerate(tokens) if token in {"&&", ";"}]
        if not separators:
            return []
        tokens = tokens[separators[0] + 1 :]

    tokens = _after_last(tokens, "&&")
    tokens = _after_last(tokens, "|")

    if tokens and tokens[0] == "env":
        tokens = tokens[1:]
    while tokens and _ENV_ASSIGNMENT_RE.match(tokens[0]):
        tokens = tokens[1:]
    return tokens
