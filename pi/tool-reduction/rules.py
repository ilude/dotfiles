"""
3-layer rule loader and argv matcher for pi tool-output reduction.

Layer order (last wins by rule id): builtin < user < project.
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional

try:
    import jsonschema
except ImportError:  # keep reducer usable from bare system Python
    jsonschema = None

from regex_guard import ReDoSRejected, safe_compile

logger = logging.getLogger(__name__)

_SCHEMA_PATH = Path(__file__).parent / "rule.schema.json"
_INDEX_FILENAME = "_index.json"


def _load_schema() -> dict:
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def _compile_filters(patterns: list[str], label: str, rule_id: str | None) -> list:
    compiled = []
    for pattern in patterns:
        try:
            compiled.append(safe_compile(pattern))
        except ReDoSRejected:
            logger.warning("ReDoS guard rejected %s %r in rule %r", label, pattern, rule_id)
    return compiled


def _compile_counters(counters: list[dict], rule_id: str | None) -> list[dict]:
    compiled = []
    for counter in counters:
        result = dict(counter)
        pattern = counter.get("pattern", "")
        if pattern:
            try:
                result["_compiled"] = safe_compile(pattern)
            except ReDoSRejected:
                logger.warning(
                    "ReDoS guard rejected counter pattern %r in rule %r", pattern, rule_id
                )
                result["_compiled"] = None
        compiled.append(result)
    return compiled


def _compile_rule_patterns(rule: dict) -> dict:
    """Pre-compile regex patterns in a rule dict. Returns a shallow copy with compiled entries."""
    rule = dict(rule)
    filters = rule.get("filters", {})
    if filters:
        rule["_compiled_skip"] = _compile_filters(
            filters.get("skipPatterns", []), "skipPattern", rule.get("id")
        )
        rule["_compiled_keep"] = _compile_filters(
            filters.get("keepPatterns", []), "keepPattern", rule.get("id")
        )
    compiled_counters = _compile_counters(rule.get("counters", []), rule.get("id"))
    if compiled_counters:
        rule["_compiled_counters"] = compiled_counters
    return rule


def _walk_json_files(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(p for p in directory.rglob("*.json") if p.name != _INDEX_FILENAME)


def _index_is_fresh(index_path: Path, builtin_dir: Path) -> bool:
    """Return True if _index.json exists and is newer than all rule files in builtin_dir."""
    if not index_path.exists():
        return False
    index_mtime = index_path.stat().st_mtime
    for rule_path in builtin_dir.rglob("*.json"):
        if rule_path.name == _INDEX_FILENAME:
            continue
        if os.stat(rule_path).st_mtime > index_mtime:
            return False
    return True


def _builtin_files_for_argv0(builtin_dir: Path, argv0: str) -> list[Path] | None:
    """Return the subset of builtin rule paths for argv0 using the index, or None on miss/stale."""
    index_path = builtin_dir / _INDEX_FILENAME
    if not _index_is_fresh(index_path, builtin_dir):
        logger.warning(
            "Rule index %s is missing or stale. Run `python pi/tool-reduction/build_index.py` "
            "to rebuild. Falling back to full scan.",
            index_path,
        )
        return None
    try:
        with open(index_path, encoding="utf-8") as f:
            index = json.load(f)
    except Exception as exc:
        logger.warning(
            "Failed to read rule index %s: %s. Falling back to full scan.", index_path, exc
        )
        return None
    rel_paths: list[str] = index.get("argv0_to_files", {}).get(argv0, [])
    return [builtin_dir / rel for rel in rel_paths]


def _builtin_rule_files(builtin_dir: Path, argv0: Optional[str]) -> list[Path]:
    if argv0 is None:
        return _walk_json_files(builtin_dir)
    files = _builtin_files_for_argv0(builtin_dir, argv0)
    if files is None:
        files = _walk_json_files(builtin_dir)
    fallback_path = builtin_dir / "generic" / "fallback.json"
    if fallback_path.exists() and fallback_path not in files:
        files.append(fallback_path)
    return files


def _read_valid_rule(json_path: Path, schema: dict) -> dict | None:
    try:
        with open(json_path, encoding="utf-8") as file:
            rule = json.load(file)
    except Exception as exc:
        logger.warning("Failed to read rule file %s: %s", json_path, exc)
        return None
    if jsonschema is not None:
        try:
            jsonschema.validate(rule, schema)
        except jsonschema.ValidationError as exc:
            logger.warning("Skipping malformed rule in %s: %s", json_path, exc.message)
            return None
    elif not isinstance(rule.get("id"), str):
        logger.warning("Skipping malformed rule in %s: missing string id", json_path)
        return None
    return rule


def _merge_layer(
    merged: dict[str, tuple[dict, Path]], layer_name: str, files: list[Path], schema: dict
) -> None:
    for json_path in files:
        rule = _read_valid_rule(json_path, schema)
        if rule is None:
            continue
        rule_id: str = rule["id"]
        if rule_id in merged and layer_name != "builtin":
            logger.warning(
                "Rule id %r shadowed: existing source %s overridden by %s",
                rule_id,
                merged[rule_id][1],
                json_path,
            )
        merged[rule_id] = (_compile_rule_patterns(rule), json_path)


def load_rules(
    builtin_dir: Path,
    user_dir: Optional[Path] = None,
    project_dir: Optional[Path] = None,
    argv0: Optional[str] = None,
) -> list[dict]:
    """Load and merge rules from up to three directory layers.

    Merges by rule id with last-wins semantics: builtin < user < project.
    Validates each rule against the schema; malformed rules are skipped with a WARN log.
    Pre-compiles regex patterns via regex_guard.safe_compile for ReDoS protection.

    When argv0 is provided and _index.json is fresh, only the subset of builtin
    rules tagged to that argv0 are opened (hot-path optimization -- avoids opening
    all 107 rule files per call on Windows where Defender intercepts each open).
    If the index is missing or stale, a WARN is logged and a full scan is used.
    When argv0 is None, all builtin rules are loaded (batch/eval use cases).

    Args:
        builtin_dir: Directory containing built-in rules (lowest priority).
        user_dir: Optional user-level override directory.
            Defaults to ~/.config/pi/tool-reduction/rules if None.
        project_dir: Optional project-level override directory.
            Defaults to ./.pi/tool-reduction/rules if None.
        argv0: If provided, use the argv0 index to load only matching builtin rules.

    Returns:
        List of compiled rule dicts ordered arbitrarily (use classify_argv to match).
    """
    user_dir = user_dir or Path.home() / ".config" / "pi" / "tool-reduction" / "rules"
    project_dir = project_dir or Path.cwd() / ".pi" / "tool-reduction" / "rules"
    schema = _load_schema()
    merged: dict[str, tuple[dict, Path]] = {}
    layers = (
        ("builtin", _builtin_rule_files(builtin_dir, argv0)),
        ("user", _walk_json_files(user_dir)),
        ("project", _walk_json_files(project_dir)),
    )
    for layer_name, files in layers:
        _merge_layer(merged, layer_name, files, schema)
    return [rule for rule, _path in merged.values()]


def _contains_tokens(argv: list[str], tokens: list[str]) -> bool:
    return all(token in argv for token in tokens)


def _contains_groups(argv: list[str], groups: list[list[str]]) -> bool:
    return all(_contains_tokens(argv, group) for group in groups)


def _rule_matches_argv(rule: dict, argv: list[str]) -> bool:
    match_block = rule.get("match", {})
    if not match_block:
        return False
    argv0_list: list[str] = match_block.get("argv0", [])
    if not argv0_list or argv[0] not in argv0_list:
        return False
    git_subcmds: list[str] = match_block.get("gitSubcommands", [])
    if git_subcmds and not _contains_tokens(argv, git_subcmds):
        return False
    argv_includes: list[list[str]] = match_block.get("argvIncludes", [])
    return not argv_includes or _contains_groups(argv, argv_includes)


def classify_argv(argv: list[str], rules: list[dict]) -> tuple[Optional[str], float]:
    """Match argv against loaded rules.

    For each rule, checks:
    - match.argv0: argv[0] must appear in the argv0 list.
    - match.argvIncludes: each inner token group must have ALL tokens present in argv.

    First match wins. Returns (rule_id, 1.0) on match, (None, 0.0) on no match.

    Args:
        argv: Command argument vector (argv[0] is the command name).
        rules: Rules list as returned by load_rules.

    Returns:
        (rule_id, confidence) where confidence is 1.0 on match or 0.0 on no match.
    """
    if not argv:
        return None, 0.0

    fallback_rule_id: Optional[str] = None
    for rule in rules:
        if not rule.get("match") and rule.get("id") == "generic/fallback":
            fallback_rule_id = rule["id"]
        if _rule_matches_argv(rule, argv):
            return rule["id"], 1.0

    if fallback_rule_id is not None:
        return fallback_rule_id, 1.0
    return None, 0.0
