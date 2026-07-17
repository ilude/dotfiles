#!/usr/bin/env python
"""Subprocess adapter around the actual Claude damage-control engines."""

from __future__ import annotations

import importlib.util
import json
import os
import re
import shlex
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


def materialize_path(pattern: str) -> str:
    path = os.path.expanduser(pattern)
    path = re.sub(r"\[[^\]]+\]", "x", path)
    path = path.replace("*", "fixture").replace("?", "x")
    if pattern.endswith(("/", os.sep)):
        path = os.path.join(path, "fixture.txt")
    return path


def fixtures() -> list[dict[str, Any]]:
    with FIXTURES_PATH.open(encoding="utf-8") as stream:
        suites = yaml.safe_load(stream) or {}
    rows: list[dict[str, Any]] = []
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
    policy = load_policy()
    for section, tool, expected in (
        ("zeroAccessPaths", "Edit", "block"),
        ("readOnlyPaths", "Edit", "block"),
        ("writeConfirmPaths", "Edit", "ask"),
        ("noDeletePaths", "Bash", "block"),
    ):
        for index, pattern in enumerate(policy.get(section, [])):
            materialized = materialize_path(pattern)
            rows.append(
                {
                    "id": f"generated:{section}:{index:04d}",
                    "tool": tool,
                    "command": f"rm -- {shlex.quote(materialized)}" if tool == "Bash" else "",
                    "filePath": materialized if tool == "Edit" else "",
                    "expected": expected,
                    "targetRuleId": f"{section}:{index:04d}",
                }
            )
    ast = policy.get("astAnalysis", {})
    for section, expected in (("safeCommands", "allow"), ("dangerousCommands", "ask")):
        for index, command in enumerate(ast.get(section, [])):
            rows.append(
                {
                    "id": f"generated:astAnalysis.{section}:{index:04d}",
                    "tool": "Ast",
                    "command": command
                    if section == "safeCommands"
                    else f'{command} "$UNSAFE_INPUT"',
                    "expected": expected,
                    "targetRuleId": f"astAnalysis.{section}:{index:04d}",
                }
            )
    return rows


def _bash_path_rule_id(
    command: str, matched: str, hook: ModuleType, config: dict[str, Any]
) -> str | None:
    mapping = {
        "readonly_path": ("readOnlyPaths_compiled", hook.READ_ONLY_BLOCKED, "readOnlyPaths"),
        "nodelete_path": ("noDeletePaths_compiled", hook.NO_DELETE_BLOCKED, "noDeletePaths"),
    }
    details = mapping.get(matched)
    if details is None:
        return None
    config_key, blocked_commands, section = details
    for index, path_obj in enumerate(config.get(config_key, [])):
        blocked, _reason = hook.check_path_patterns(command, path_obj, blocked_commands, section)
        if blocked:
            return f"{section}:{index:04d}"
    return None


def bash_decision(command: str, hook: ModuleType, config: dict[str, Any]) -> dict[str, Any]:
    blocked, ask, reason, matched, _unwrapped, _semantic = hook.check_command(command, config)
    yaml_match = re.fullmatch(r"yaml_pattern_(\d+)", matched or "")
    matched_rule_id = f"bashToolPatterns:{int(yaml_match.group(1)):04d}" if yaml_match else None
    if matched_rule_id is None:
        matched_rule_id = _bash_path_rule_id(command, matched or "", hook, config)
    return {
        "outcome": "block" if blocked else "ask" if ask else "allow",
        "reason": reason,
        "matchedRuleId": matched_rule_id,
        "engineMatch": matched or None,
    }


def edit_decision(file_path: str, hook: ModuleType, config: dict[str, Any]) -> dict[str, Any]:
    reason = hook._check_write_confirm(file_path, config)
    if reason:
        index = next(
            index
            for index, pattern in enumerate(config.get("writeConfirmPaths", []))
            if hook.match_path(file_path, pattern)
        )
        return {
            "outcome": "ask",
            "reason": reason,
            "matchedRuleId": f"writeConfirmPaths:{index:04d}",
        }
    blocked, reason = hook.check_path(file_path, config)
    if not blocked:
        return {"outcome": "allow", "reason": "", "matchedRuleId": None}
    exclusions = config.get("zeroAccessExclusions", [])
    if not any(hook.match_path(file_path, pattern) for pattern in exclusions):
        for index, pattern in enumerate(config.get("zeroAccessPaths", [])):
            if hook.match_path(file_path, pattern):
                return {
                    "outcome": "block",
                    "reason": reason,
                    "matchedRuleId": f"zeroAccessPaths:{index:04d}",
                }
    for index, pattern in enumerate(config.get("readOnlyPaths", [])):
        if hook.match_path(file_path, pattern):
            return {
                "outcome": "block",
                "reason": reason,
                "matchedRuleId": f"readOnlyPaths:{index:04d}",
            }
    return {"outcome": "block", "reason": reason, "matchedRuleId": None}


def ast_decision(
    command: str,
    target_rule_id: str | None,
    hook: ModuleType,
    policy: dict[str, Any],
) -> dict[str, Any]:
    analyzer = hook.ASTAnalyzer()
    result = analyzer.analyze_command_ast(command, policy)
    decision = result.get("decision", "allow")
    return {
        "outcome": "block" if decision == "block" else "ask" if decision == "ask" else "allow",
        "reason": result.get("reason", ""),
        "matchedRuleId": target_rule_id,
    }


def main() -> None:
    request = json.load(sys.stdin)
    mode = request.get("mode")
    if mode == "inventory":
        result: Any = inventory()
    elif mode == "fixtures":
        result = fixtures()
    elif mode in {"evaluate", "evaluate_batch"}:
        policy = load_policy()
        bash_hook = load_hook("damage_control_bash_oracle", "bash-tool-damage-control.py")
        bash_config = bash_hook.compile_config(policy)
        edit_hook = load_hook("damage_control_edit_oracle", "edit-tool-damage-control.py")
        ast_hook = load_hook("damage_control_ast_oracle", "ast_analyzer.py")
        if mode == "evaluate":
            tool = request.get("tool", "Bash")
            if tool == "Bash":
                result = bash_decision(str(request.get("command", "")), bash_hook, bash_config)
            elif tool == "Edit":
                result = edit_decision(str(request.get("filePath", "")), edit_hook, policy)
            elif tool == "Ast":
                result = ast_decision(
                    str(request.get("command", "")),
                    request.get("targetRuleId"),
                    ast_hook,
                    policy,
                )
            else:
                raise ValueError(f"unsupported oracle tool: {tool}")
        else:
            vectors = request.get("vectors") or [
                {"tool": "Bash", "command": command} for command in request.get("commands", [])
            ]
            result = [
                bash_decision(str(vector.get("command", "")), bash_hook, bash_config)
                if vector.get("tool", "Bash") == "Bash"
                else edit_decision(str(vector.get("filePath", "")), edit_hook, policy)
                if vector.get("tool") == "Edit"
                else ast_decision(
                    str(vector.get("command", "")),
                    vector.get("targetRuleId"),
                    ast_hook,
                    policy,
                )
                for vector in vectors
            ]
    else:
        raise ValueError(f"unsupported mode: {mode}")
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
