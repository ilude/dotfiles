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


def _compile_rule_patterns(rule: dict) -> dict:
    """Pre-compile regex patterns in a rule dict. Returns a shallow copy with compiled entries."""
    rule = dict(rule)

    filters = rule.get("filters", {})
    if filters:
        rule["_compiled_skip"] = []
        for p in filters.get("skipPatterns", []):
            try:
                rule["_compiled_skip"].append(safe_compile(p))
            except ReDoSRejected:
                logger.warning("ReDoS guard rejected skipPattern %r in rule %r", p, rule.get("id"))

        rule["_compiled_keep"] = []
        for p in filters.get("keepPatterns", []):
            try:
                rule["_compiled_keep"].append(safe_compile(p))
            except ReDoSRejected:
                logger.warning("ReDoS guard rejected keepPattern %r in rule %r", p, rule.get("id"))

    counters = rule.get("counters", [])
    compiled_counters = []
    for counter in counters:
        cc = dict(counter)
        p = counter.get("pattern", "")
        if p:
            try:
                cc["_compiled"] = safe_compile(p)
            except ReDoSRejected:
                logger.warning(
                    "ReDoS guard rejected counter pattern %r in rule %r", p, rule.get("id")
                )
                cc["_compiled"] = None
        compiled_counters.append(cc)
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
        logger.warning("Failed to read rule index %s: %s. Falling back to full scan.", index_path, exc)
        return None
    rel_paths: list[str] = index.get("argv0_to_files", {}).get(argv0, [])
    return [builtin_dir / rel for rel in rel_paths]


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
    if user_dir is None:
        user_dir = Path.home() / ".config" / "pi" / "tool-reduction" / "rules"
    if project_dir is None:
        project_dir = Path.cwd() / ".pi" / "tool-reduction" / "rules"

    schema = _load_schema()

    # Maps rule id -> (rule_dict, source_path)
    merged: dict[str, tuple[dict, Path]] = {}

    # Determine builtin file list: narrow via index when argv0 is given, else full scan.
    if argv0 is not None:
        builtin_files = _builtin_files_for_argv0(builtin_dir, argv0)
        if builtin_files is None:
            builtin_files = _walk_json_files(builtin_dir)
    else:
        builtin_files = _walk_json_files(builtin_dir)

    layers: list[tuple[str, list[Path] | None]] = [
        ("builtin", builtin_files),
        ("user", None),
        ("project", None),
    ]
    walk_dirs = {"user": user_dir, "project": project_dir}

    for layer_name, layer_files in layers:
        if layer_files is None:
            layer_files = _walk_json_files(walk_dirs[layer_name])
        for json_path in layer_files:
            try:
                with open(json_path, encoding="utf-8") as f:
                    rule = json.load(f)
            except Exception as exc:
                logger.warning("Failed to read rule file %s: %s", json_path, exc)
                continue

            if jsonschema is not None:
                try:
                    jsonschema.validate(rule, schema)
                except jsonschema.ValidationError as exc:
                    logger.warning(
                        "Skipping malformed rule in %s: %s", json_path, exc.message
                    )
                    continue
            elif not isinstance(rule.get("id"), str):
                logger.warning("Skipping malformed rule in %s: missing string id", json_path)
                continue

            rule_id: str = rule["id"]

            if rule_id in merged and layer_name != "builtin":
                existing_path = merged[rule_id][1]
                logger.warning(
                    "Rule id %r shadowed: existing source %s overridden by %s",
                    rule_id,
                    existing_path,
                    json_path,
                )

            compiled = _compile_rule_patterns(rule)
            merged[rule_id] = (compiled, json_path)

    return [rule for rule, _path in merged.values()]


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

    argv0 = argv[0]

    for rule in rules:
        match_block = rule.get("match", {})
        if not match_block:
            continue

        argv0_list: list[str] = match_block.get("argv0", [])
        # Rules without argv0 (e.g. toolNames/commandIncludes-only rules) are not
        # argv-matchable. Skip rather than treating absent argv0 as a wildcard.
        if not argv0_list or argv0 not in argv0_list:
            continue

        # gitSubcommands acts as an implicit argvIncludes group: each token must
        # appear in argv. Without this check, rules like git-ls-files wildcard-match
        # all git invocations because they have no argvIncludes entry.
        git_subcmds: list[str] = match_block.get("gitSubcommands", [])
        if git_subcmds and not all(token in argv for token in git_subcmds):
            continue

        argv_includes: list[list[str]] = match_block.get("argvIncludes", [])
        if argv_includes:
            all_groups_match = all(
                all(token in argv for token in group)
                for group in argv_includes
            )
            if not all_groups_match:
                continue

        return rule["id"], 1.0

    return None, 0.0
