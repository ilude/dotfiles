#!/usr/bin/env python
"""Subprocess adapter around the actual Claude damage-control engines."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
HOOK_DIR = ROOT / "claude" / "hooks" / "damage-control"
POLICY_PATH = HOOK_DIR / "patterns.yaml"
FIXTURES_PATH = HOOK_DIR / "tests" / "test_fixtures.yaml"
if str(HOOK_DIR) not in sys.path:
    sys.path.insert(0, str(HOOK_DIR))


def load_hook(name: str, filename: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, HOOK_DIR / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_policy() -> dict[str, Any]:
    with POLICY_PATH.open(encoding="utf-8") as stream:
        return yaml.safe_load(stream) or {}


def inventory() -> list[dict[str, Any]]:
    policy = load_policy()
    rows: list[dict[str, Any]] = []
    list_sections = [
        "bashToolPatterns",
        "zeroAccessPaths",
        "zeroAccessExclusions",
        "writeConfirmPaths",
        "readConfirmPaths",
        "readOnlyPaths",
        "noDeletePaths",
        "contentScanPaths",
        "injectionPatterns",
        "secretPatterns",
    ]
    for section in list_sections:
        for index, value in enumerate(policy.get(section, [])):
            pattern = value.get("pattern") if isinstance(value, dict) else value
            rows.append(
                {
                    "id": f"{section}:{index:04d}",
                    "section": section,
                    "index": index,
                    "pattern": pattern,
                    "exfil": bool(value.get("exfil")) if isinstance(value, dict) else False,
                }
            )
    for context in sorted(policy.get("contexts", {})):
        rows.append(
            {
                "id": f"contexts:{context}",
                "section": "contexts",
                "pattern": context,
            }
        )
    ast = policy.get("astAnalysis", {})
    for key in ("safeCommands", "dangerousCommands"):
        for index, command in enumerate(ast.get(key, [])):
            rows.append(
                {
                    "id": f"astAnalysis.{key}:{index:04d}",
                    "section": f"astAnalysis.{key}",
                    "index": index,
                    "pattern": command,
                }
            )
    return rows


def fixtures() -> list[dict[str, str]]:
    with FIXTURES_PATH.open(encoding="utf-8") as stream:
        suites = yaml.safe_load(stream) or {}
    rows: list[dict[str, str]] = []
    for suite, groups in suites.items():
        if not isinstance(groups, dict):
            continue
        for expected in ("blocked", "ask", "allowed"):
            for index, fixture in enumerate(groups.get(expected, [])):
                rows.append(
                    {
                        "id": f"{suite}:{expected}:{index:03d}",
                        "tool": fixture.get("tool", "Bash"),
                        "command": fixture.get("command", ""),
                        "expected": {
                            "blocked": "block",
                            "ask": "ask",
                            "allowed": "allow",
                        }[expected],
                    }
                )
    return rows


def bash_decision(command: str, hook: ModuleType, config: dict[str, Any]) -> dict[str, Any]:
    blocked, ask, reason, matched, _unwrapped, _semantic = hook.check_command(command, config)
    yaml_match = re.fullmatch(r"yaml_pattern_(\d+)", matched or "")
    return {
        "outcome": "block" if blocked else "ask" if ask else "allow",
        "reason": reason,
        "matchedRuleId": f"bashToolPatterns:{int(yaml_match.group(1)):04d}" if yaml_match else None,
        "engineMatch": matched or None,
    }


def main() -> None:
    request = json.load(sys.stdin)
    mode = request.get("mode")
    if mode == "inventory":
        result: Any = inventory()
    elif mode == "fixtures":
        result = fixtures()
    elif mode in {"evaluate", "evaluate_batch"}:
        tool = request.get("tool", "Bash")
        if tool != "Bash":
            raise ValueError(f"unsupported oracle tool: {tool}")
        hook = load_hook("damage_control_bash_oracle", "bash-tool-damage-control.py")
        config = hook.compile_config(load_policy())
        if mode == "evaluate":
            result = bash_decision(str(request.get("command", "")), hook, config)
        else:
            result = [
                bash_decision(str(command), hook, config) for command in request.get("commands", [])
            ]
    else:
        raise ValueError(f"unsupported mode: {mode}")
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
