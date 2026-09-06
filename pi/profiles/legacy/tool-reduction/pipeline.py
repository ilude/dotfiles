"""
Pure pipeline functions ported from tokenjuice src/core/reduce.ts and src/core/text.ts.

Each function takes (lines: list[str], rule_dict: dict) and returns (lines, facts)
where facts is a dict of string->int counters. No I/O, no rule loading.

Semantics match tokenjuice exactly. See src/core/reduce.ts applyRule() for the
authoritative reference.
"""

import re
from typing import Optional

from regex_guard import (
    ReDoSRejected,
    js_flags_to_re,
    safe_compile,
    safe_search,
)

# --- ANSI stripping patterns (ported from text.ts) ---

_ANSI_OSC = re.compile(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)")
_ANSI_CSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
_ANSI_OSC_INCOMPLETE = re.compile(r"\x1b\][^\x07\x1b]*$")
_ANSI_CSI_INCOMPLETE = re.compile(r"\x1b\[[0-?]*[ -/]*$")
_ANSI_SINGLE = re.compile(r"\x1b[@-_]")  # ESC followed by one byte in 0x40-0x5F


def strip_ansi(text: str) -> str:
    """Remove ANSI escape sequences: CSI, OSC, DEC private, and bare ESC sequences."""
    text = _ANSI_OSC.sub("", text)
    text = _ANSI_CSI.sub("", text)
    text = _ANSI_OSC_INCOMPLETE.sub("", text)
    text = _ANSI_CSI_INCOMPLETE.sub("", text)
    text = _ANSI_SINGLE.sub("", text)
    text = text.replace("\x1b", "")
    return text


# --- Line normalization (ported from text.ts normalizeLines) ---

def normalize_lines(text: str) -> list[str]:
    """Split text into lines, normalizing CRLF and stripping trailing whitespace."""
    return [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]


# --- Core pipeline functions ---

def trim_empty_edges(lines: list[str], rule_dict: dict) -> tuple[list[str], dict]:
    """Remove leading and trailing blank lines (tokenjuice trimEmptyEdges)."""
    start = 0
    end = len(lines)
    while start < end and not lines[start].strip():
        start += 1
    while end > start and not lines[end - 1].strip():
        end -= 1
    return lines[start:end], {}


def dedupe_adjacent(lines: list[str], rule_dict: dict) -> tuple[list[str], dict]:
    """Remove consecutive duplicate lines (tokenjuice dedupeAdjacent)."""
    result: list[str] = []
    for line in lines:
        if not result or result[-1] != line:
            result.append(line)
    return result, {}


def _compile_patterns(patterns: list[str]) -> list[re.Pattern[str]]:
    """Compile a list of pattern strings, skipping any rejected by the ReDoS guard."""
    compiled: list[re.Pattern[str]] = []
    for p in patterns:
        try:
            compiled.append(safe_compile(p))
        except ReDoSRejected:
            # Skip unsafe patterns rather than crashing the pipeline
            pass
    return compiled


def skip_patterns(lines: list[str], rule_dict: dict) -> tuple[list[str], dict]:
    """Remove lines matching any skipPatterns entry (tokenjuice filters.skipPatterns)."""
    raw_patterns: list[str] = rule_dict.get("filters", {}).get("skipPatterns", [])
    if not raw_patterns:
        return lines, {}
    compiled = _compile_patterns(raw_patterns)
    result = [
        line for line in lines
        if not any(safe_search(p, line) is not None for p in compiled)
    ]
    return result, {}


def keep_patterns(lines: list[str], rule_dict: dict) -> tuple[list[str], dict]:
    """Keep only lines matching any keepPatterns entry; pass through unchanged if no matches.

    Matches tokenjuice semantics: if kept is empty, the original lines are preserved.
    """
    raw_patterns: list[str] = rule_dict.get("filters", {}).get("keepPatterns", [])
    if not raw_patterns:
        return lines, {}
    compiled = _compile_patterns(raw_patterns)
    kept = [
        line for line in lines
        if any(safe_search(p, line) is not None for p in compiled)
    ]
    if kept:
        return kept, {}
    return lines, {}


def extract_counters(lines: list[str], rule_dict: dict) -> tuple[list[str], dict]:
    """Count lines matching each counter pattern and return as facts dict.

    counterSource "preKeep" is handled by the caller (applyRule); here we always
    receive the lines that should be counted (post-skip, pre-keep for preKeep source,
    or post-keep for the default source). Lines are not modified.
    """
    counters: list[dict] = rule_dict.get("counters", [])
    if not counters:
        return lines, {}

    facts: dict[str, int] = {}
    for counter in counters:
        name: str = counter.get("name", "")
        pattern_str: str = counter.get("pattern", "")
        if not name or not pattern_str:
            continue
        re_flags = js_flags_to_re(counter.get("flags", ""))
        try:
            pat = safe_compile(pattern_str, re_flags)
        except ReDoSRejected:
            facts[name] = 0
            continue
        facts[name] = sum(1 for line in lines if safe_search(pat, line) is not None)

    return lines, facts


def head_tail(lines: list[str], rule_dict: dict) -> tuple[list[str], dict]:
    """Apply head/tail truncation from rule summarize config (tokenjuice headTail).

    Uses failure.head/tail when exit_code is non-zero and failure.preserveOnFailure
    is set. Falls back to summarize.head/tail (defaults: head=6, tail=6).
    Inserts an omission marker line when truncation occurs.
    """
    exit_code: Optional[int] = rule_dict.get("_exit_code")
    failure = rule_dict.get("failure", {})
    preserve_on_failure: bool = bool(failure.get("preserveOnFailure", False))

    if exit_code and exit_code != 0 and preserve_on_failure:
        head_n: int = failure.get("head", 6)
        tail_n: int = failure.get("tail", 12)
    else:
        summarize = rule_dict.get("summarize", {})
        head_n = summarize.get("head", 6)
        tail_n = summarize.get("tail", 6)

    total = len(lines)
    if total <= head_n + tail_n:
        return lines, {}

    omitted = total - head_n - tail_n
    result = (
        lines[:head_n]
        + [f"... {omitted} lines omitted ..."]
        + lines[-tail_n:]
    )
    return result, {}


def apply_on_empty(lines: list[str], rule_dict: dict) -> tuple[list[str], dict]:
    """If lines is empty, replace with the onEmpty message (tokenjuice rule.onEmpty).

    Returns a single-element list with the message, or the original lines unchanged.
    """
    if lines:
        return lines, {}
    on_empty: Optional[str] = rule_dict.get("onEmpty")
    if on_empty:
        return [on_empty], {}
    return lines, {}


def preserve_on_failure(lines: list[str], rule_dict: dict) -> tuple[list[str], dict]:
    """When exit_code is non-zero and preserveOnFailure is set, ensure lines are kept.

    In tokenjuice, preserveOnFailure modifies the head/tail parameters used in
    headTail rather than bypassing the pipeline entirely. This function is a no-op
    pass-through -- the actual preservation logic lives in head_tail() which reads
    the failure config. Included for API completeness.
    """
    return lines, {}


def apply_rule(lines: list[str], rule_dict: dict) -> tuple[list[str], dict]:
    """Run the full tokenjuice applyRule pipeline on a list of lines.

    Pipeline order matches reduce.ts applyRule():
      1. strip_ansi (if transforms.stripAnsi)
      2. skip_patterns
      3. snapshot counter_lines for preKeep counters
      4. keep_patterns
      5. trim_empty_edges (if transforms.trimEmptyEdges)
      6. dedupe_adjacent (if transforms.dedupeAdjacent)
      7. extract_counters (applied to counter_lines or post-keep lines per counterSource)
      8. apply_on_empty
      9. head_tail

    Returns (final_lines, facts).
    """
    transforms = rule_dict.get("transforms", {})
    facts: dict[str, int] = {}

    if transforms.get("stripAnsi"):
        text = "\n".join(lines)
        lines = normalize_lines(strip_ansi(text))

    lines, _ = skip_patterns(lines, rule_dict)

    # Snapshot for preKeep counters (tokenjuice counterSource == "preKeep")
    counter_source = rule_dict.get("counterSource", "postKeep")
    counter_lines = list(lines)

    lines, _ = keep_patterns(lines, rule_dict)

    if transforms.get("trimEmptyEdges"):
        counter_lines_trimmed, _ = trim_empty_edges(counter_lines, rule_dict)
        counter_lines = counter_lines_trimmed
        lines, _ = trim_empty_edges(lines, rule_dict)

    if transforms.get("dedupeAdjacent"):
        counter_lines, _ = dedupe_adjacent(counter_lines, rule_dict)
        lines, _ = dedupe_adjacent(lines, rule_dict)

    # Build a rule_dict slice for counters with the right source lines baked in
    # by passing the appropriate line list to extract_counters
    lines_for_counters = counter_lines if counter_source == "preKeep" else lines
    _, counter_facts = extract_counters(lines_for_counters, rule_dict)
    facts.update(counter_facts)

    lines, _ = apply_on_empty(lines, rule_dict)
    lines, _ = head_tail(lines, rule_dict)

    return lines, facts
