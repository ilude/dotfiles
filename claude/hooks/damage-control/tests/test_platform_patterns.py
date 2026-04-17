#!/usr/bin/env python
# /// script
# requires-python = ">=3.8"
# dependencies = ["pytest"]
# ///
"""Tests for platform-aware YAML command patterns."""

import importlib.util
from pathlib import Path

import pytest

HOOK_DIR = Path(__file__).parent.parent


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, HOOK_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bash_tool = load_module("bash_tool", "bash-tool-damage-control.py")
check_command = bash_tool.check_command


@pytest.fixture
def platform_config():
    return {
        "bashToolPatterns": [
            {
                "pattern": r"\bdocker\s+compose\s+down\b",
                "reason": "docker compose down",
                "ask": True,
                "platforms": ["linux"],
            },
            {
                "pattern": r"\bdocker\s+down\b",
                "reason": "docker down",
                "ask": True,
                "platforms": ["linux"],
            },
        ],
        "zeroAccessPaths": [],
        "readOnlyPaths": [],
        "noDeletePaths": [],
    }


@pytest.mark.parametrize("platform_name", ["linux", "linux2"])
def test_linux_prompts_for_docker_down(monkeypatch, platform_config, platform_name):
    monkeypatch.setattr(bash_tool.sys, "platform", platform_name)

    blocked, ask, reason, *_ = check_command("docker compose down", platform_config)

    assert blocked is False
    assert ask is True
    assert reason == "docker compose down"


@pytest.mark.parametrize("platform_name", ["win32", "darwin"])
def test_non_linux_allows_docker_compose_down(monkeypatch, platform_config, platform_name):
    monkeypatch.setattr(bash_tool.sys, "platform", platform_name)

    blocked, ask, reason, *_ = check_command("docker compose down", platform_config)

    assert blocked is False
    assert ask is False
    assert reason == ""


@pytest.mark.parametrize("platform_name", ["linux", "linux2"])
def test_linux_prompts_for_docker_down_alias(monkeypatch, platform_config, platform_name):
    monkeypatch.setattr(bash_tool.sys, "platform", platform_name)

    blocked, ask, reason, *_ = check_command("docker down", platform_config)

    assert blocked is False
    assert ask is True
    assert reason == "docker down"
