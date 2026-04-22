"""Tests for pipeline.py and regex_guard.py."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from pipeline import (
    apply_on_empty,
    apply_rule,
    dedupe_adjacent,
    extract_counters,
    head_tail,
    keep_patterns,
    normalize_lines,
    preserve_on_failure,
    skip_patterns,
    strip_ansi,
    trim_empty_edges,
)
from regex_guard import ReDoSRejected, safe_compile, safe_search


# ---------------------------------------------------------------------------
# strip_ansi
# ---------------------------------------------------------------------------

class TestStripAnsi:
    def test_csi_color_codes(self):
        # CSI sequences: ESC [ ... m
        assert strip_ansi("\x1b[31mred\x1b[0m") == "red"

    def test_csi_bold(self):
        assert strip_ansi("\x1b[1mbold\x1b[0m") == "bold"

    def test_osc_title(self):
        # OSC sequences: ESC ] ... BEL
        assert strip_ansi("\x1b]0;title\x07content") == "content"

    def test_osc_with_st_terminator(self):
        # OSC with ST (ESC \) terminator
        assert strip_ansi("\x1b]0;title\x1b\\content") == "content"

    def test_dec_private_sequence(self):
        # DEC private: ESC [ ? ... h/l  -- these are CSI sequences with ? parameter
        assert strip_ansi("\x1b[?25h") == ""
        assert strip_ansi("\x1b[?25l") == ""

    def test_single_char_escape(self):
        # ESC followed by single byte in 0x40-0x5F range (e.g., ESC M = reverse index)
        assert strip_ansi("\x1bM") == ""

    def test_bare_escape(self):
        assert strip_ansi("\x1b") == ""

    def test_no_escape_unchanged(self):
        assert strip_ansi("hello world") == "hello world"

    def test_mixed_content(self):
        result = strip_ansi("\x1b[32mgreen\x1b[0m text \x1b[31mred\x1b[0m")
        assert result == "green text red"

    def test_incomplete_csi_stripped(self):
        # Incomplete CSI at end of string
        result = strip_ansi("text\x1b[31")
        assert result == "text"

    def test_incomplete_osc_stripped(self):
        result = strip_ansi("text\x1b]0;unterminated")
        assert result == "text"

    def test_multi_line(self):
        lines = ["\x1b[31mline1\x1b[0m", "\x1b[32mline2\x1b[0m"]
        result = [strip_ansi(line) for line in lines]
        assert result == ["line1", "line2"]


# ---------------------------------------------------------------------------
# normalize_lines
# ---------------------------------------------------------------------------

class TestNormalizeLines:
    def test_splits_on_newline(self):
        assert normalize_lines("a\nb\nc") == ["a", "b", "c"]

    def test_crlf_normalized(self):
        assert normalize_lines("a\r\nb\r\nc") == ["a", "b", "c"]

    def test_trailing_whitespace_stripped(self):
        assert normalize_lines("a   \nb   ") == ["a", "b"]

    def test_empty_string(self):
        assert normalize_lines("") == [""]


# ---------------------------------------------------------------------------
# trim_empty_edges
# ---------------------------------------------------------------------------

class TestTrimEmptyEdges:
    def test_removes_leading_blank(self):
        lines, facts = trim_empty_edges(["", "  ", "a", "b"], {})
        assert lines == ["a", "b"]
        assert facts == {}

    def test_removes_trailing_blank(self):
        lines, _ = trim_empty_edges(["a", "b", "", "  "], {})
        assert lines == ["a", "b"]

    def test_removes_both_edges(self):
        lines, _ = trim_empty_edges(["", "a", ""], {})
        assert lines == ["a"]

    def test_all_blank_returns_empty(self):
        lines, _ = trim_empty_edges(["", "  ", ""], {})
        assert lines == []

    def test_no_blank_edges_unchanged(self):
        lines, _ = trim_empty_edges(["a", "b"], {})
        assert lines == ["a", "b"]

    def test_preserves_interior_blanks(self):
        lines, _ = trim_empty_edges(["", "a", "", "b", ""], {})
        assert lines == ["a", "", "b"]


# ---------------------------------------------------------------------------
# dedupe_adjacent
# ---------------------------------------------------------------------------

class TestDedupeAdjacent:
    def test_removes_consecutive_duplicates(self):
        lines, facts = dedupe_adjacent(["a", "a", "b", "b", "a"], {})
        assert lines == ["a", "b", "a"]
        assert facts == {}

    def test_no_duplicates_unchanged(self):
        lines, _ = dedupe_adjacent(["a", "b", "c"], {})
        assert lines == ["a", "b", "c"]

    def test_all_same(self):
        lines, _ = dedupe_adjacent(["x", "x", "x"], {})
        assert lines == ["x"]

    def test_empty(self):
        lines, _ = dedupe_adjacent([], {})
        assert lines == []


# ---------------------------------------------------------------------------
# skip_patterns
# ---------------------------------------------------------------------------

class TestSkipPatterns:
    def test_removes_matching_lines(self):
        rule = {"filters": {"skipPatterns": [r"^\s*#"]}}
        lines, facts = skip_patterns(["# comment", "code", "# another"], rule)
        assert lines == ["code"]
        assert facts == {}

    def test_no_patterns_unchanged(self):
        lines, _ = skip_patterns(["a", "b"], {})
        assert lines == ["a", "b"]

    def test_empty_patterns_list(self):
        lines, _ = skip_patterns(["a"], {"filters": {"skipPatterns": []}})
        assert lines == ["a"]

    def test_multiple_patterns(self):
        rule = {"filters": {"skipPatterns": [r"^debug:", r"^trace:"]}}
        lines, _ = skip_patterns(["debug: x", "info: y", "trace: z"], rule)
        assert lines == ["info: y"]

    def test_unsafe_pattern_skipped_not_crashed(self):
        # (a+)+ is a ReDoS pattern -- should be skipped, not crash
        rule = {"filters": {"skipPatterns": ["(a+)+$"]}}
        lines, _ = skip_patterns(["safe line", "another"], rule)
        # No exception; original lines returned because unsafe pattern was dropped
        assert lines == ["safe line", "another"]


# ---------------------------------------------------------------------------
# keep_patterns
# ---------------------------------------------------------------------------

class TestKeepPatterns:
    def test_keeps_only_matching_lines(self):
        rule = {"filters": {"keepPatterns": [r"ERROR|WARN"]}}
        lines, facts = keep_patterns(["DEBUG x", "ERROR y", "WARN z", "INFO w"], rule)
        assert lines == ["ERROR y", "WARN z"]
        assert facts == {}

    def test_no_match_returns_original(self):
        # tokenjuice: if kept is empty, original lines are preserved
        rule = {"filters": {"keepPatterns": [r"NOMATCH"]}}
        original = ["a", "b"]
        lines, _ = keep_patterns(original, rule)
        assert lines == original

    def test_no_patterns_unchanged(self):
        lines, _ = keep_patterns(["a"], {})
        assert lines == ["a"]


# ---------------------------------------------------------------------------
# extract_counters
# ---------------------------------------------------------------------------

class TestExtractCounters:
    def test_counts_matching_lines(self):
        rule = {"counters": [{"name": "errors", "pattern": r"^ERROR"}]}
        lines, facts = extract_counters(["ERROR a", "INFO b", "ERROR c"], rule)
        assert facts == {"errors": 2}
        assert lines == ["ERROR a", "INFO b", "ERROR c"]  # lines unchanged

    def test_multiple_counters(self):
        rule = {
            "counters": [
                {"name": "errors", "pattern": r"^ERROR"},
                {"name": "warns", "pattern": r"^WARN"},
            ]
        }
        lines, facts = extract_counters(["ERROR a", "WARN b", "ERROR c"], rule)
        assert facts == {"errors": 2, "warns": 1}

    def test_no_counters(self):
        lines, facts = extract_counters(["a", "b"], {})
        assert facts == {}

    def test_unsafe_pattern_gives_zero_not_crash(self):
        rule = {"counters": [{"name": "bad", "pattern": "(a+)+$"}]}
        _, facts = extract_counters(["aaa"], rule)
        assert facts == {"bad": 0}

    def test_flags_i_case_insensitive(self):
        # Matches gh.json: pattern "error|failed|not found|forbidden" with flags "i"
        rule = {
            "counters": [
                {
                    "name": "error",
                    "pattern": "error|failed|not found|forbidden",
                    "flags": "i",
                }
            ]
        }
        lines = ["Error: Permission denied", "everything is fine", "FAILED: build step"]
        _, facts = extract_counters(lines, rule)
        assert facts["error"] == 2

    def test_flags_i_no_match_without_flag(self):
        # Without flags, uppercase should not match a lowercase-only pattern
        rule = {"counters": [{"name": "errors", "pattern": r"^error"}]}
        _, facts = extract_counters(["Error: something"], rule)
        assert facts["errors"] == 0

    def test_flags_m_multiline(self):
        rule = {"counters": [{"name": "starts", "pattern": r"^foo", "flags": "m"}]}
        _, facts = extract_counters(["foo bar", "not foo", "foo"], rule)
        assert facts["starts"] == 2

    def test_flags_unknown_ignored(self):
        # u and g are JS-only; should not raise, should just compile normally
        rule = {"counters": [{"name": "hits", "pattern": r"test", "flags": "ug"}]}
        _, facts = extract_counters(["test line", "other"], rule)
        assert facts["hits"] == 1


# ---------------------------------------------------------------------------
# head_tail
# ---------------------------------------------------------------------------

class TestHeadTail:
    def test_no_truncation_when_short(self):
        lines = ["a", "b", "c"]
        rule = {"summarize": {"head": 6, "tail": 6}}
        result, facts = head_tail(lines, rule)
        assert result == lines
        assert facts == {}

    def test_truncation_inserts_omission_marker(self):
        lines = list(range(20))
        lines = [str(i) for i in lines]
        rule = {"summarize": {"head": 3, "tail": 3}}
        result, _ = head_tail(lines, rule)
        assert result[:3] == ["0", "1", "2"]
        assert result[-3:] == ["17", "18", "19"]
        assert "omitted" in result[3]
        assert "14" in result[3]  # 20 - 3 - 3 = 14 omitted

    def test_defaults_head6_tail6(self):
        lines = [str(i) for i in range(20)]
        result, _ = head_tail(lines, {})
        assert len(result) == 13  # 6 + 1 marker + 6

    def test_failure_preserve_uses_failure_config(self):
        lines = [str(i) for i in range(30)]
        rule = {
            "_exit_code": 1,
            "failure": {"preserveOnFailure": True, "head": 2, "tail": 4},
        }
        result, _ = head_tail(lines, rule)
        assert result[:2] == ["0", "1"]
        assert result[-4:] == ["26", "27", "28", "29"]

    def test_failure_no_preserve_uses_summarize(self):
        lines = [str(i) for i in range(30)]
        rule = {
            "_exit_code": 1,
            "failure": {"preserveOnFailure": False},
            "summarize": {"head": 3, "tail": 3},
        }
        result, _ = head_tail(lines, rule)
        assert result[:3] == ["0", "1", "2"]
        assert result[-3:] == ["27", "28", "29"]


# ---------------------------------------------------------------------------
# apply_on_empty
# ---------------------------------------------------------------------------

class TestApplyOnEmpty:
    def test_non_empty_lines_unchanged(self):
        lines, facts = apply_on_empty(["a"], {"onEmpty": "nothing"})
        assert lines == ["a"]
        assert facts == {}

    def test_empty_lines_replaced_by_message(self):
        lines, _ = apply_on_empty([], {"onEmpty": "(nothing to show)"})
        assert lines == ["(nothing to show)"]

    def test_empty_no_on_empty_stays_empty(self):
        lines, _ = apply_on_empty([], {})
        assert lines == []


# ---------------------------------------------------------------------------
# preserve_on_failure (pass-through)
# ---------------------------------------------------------------------------

class TestPreserveOnFailure:
    def test_passthrough(self):
        lines = ["a", "b"]
        result, facts = preserve_on_failure(lines, {"_exit_code": 1})
        assert result == lines
        assert facts == {}


# ---------------------------------------------------------------------------
# apply_rule (integration)
# ---------------------------------------------------------------------------

class TestApplyRule:
    def test_strip_ansi_transform(self):
        rule = {"transforms": {"stripAnsi": True}}
        lines, facts = apply_rule(["\x1b[31mred\x1b[0m", "\x1b[32mgreen\x1b[0m"], rule)
        assert lines == ["red", "green"]
        assert facts == {}

    def test_skip_and_keep_combined(self):
        rule = {
            "filters": {
                "skipPatterns": [r"^debug:"],
                "keepPatterns": [r"ERROR|WARN"],
            }
        }
        lines, _ = apply_rule(["debug: x", "ERROR y", "WARN z", "INFO w"], rule)
        assert lines == ["ERROR y", "WARN z"]

    def test_counter_source_pre_keep(self):
        # preKeep: counters count before keep filter is applied
        rule = {
            "filters": {"keepPatterns": [r"^keep"]},
            "counters": [{"name": "total", "pattern": r".+"}],
            "counterSource": "preKeep",
        }
        lines, facts = apply_rule(["keep this", "skip this", "keep that"], rule)
        assert facts["total"] == 3  # all 3 lines before keep filter
        assert lines == ["keep this", "keep that"]

    def test_counter_source_post_keep(self):
        rule = {
            "filters": {"keepPatterns": [r"^keep"]},
            "counters": [{"name": "kept", "pattern": r".+"}],
            "counterSource": "postKeep",
        }
        _, facts = apply_rule(["keep this", "skip this", "keep that"], rule)
        assert facts["kept"] == 2

    def test_on_empty_triggered(self):
        rule = {
            "filters": {"skipPatterns": [r".*"]},
            "onEmpty": "(empty output)",
        }
        lines, _ = apply_rule(["a", "b", "c"], rule)
        assert lines == ["(empty output)"]

    def test_trim_and_dedupe_transforms(self):
        rule = {"transforms": {"trimEmptyEdges": True, "dedupeAdjacent": True}}
        lines, _ = apply_rule(["", "a", "a", "b", ""], rule)
        assert lines == ["a", "b"]

    def test_head_tail_applied(self):
        rule = {"summarize": {"head": 2, "tail": 2}}
        lines, _ = apply_rule([str(i) for i in range(10)], rule)
        assert lines[0] == "0"
        assert lines[1] == "1"
        assert "omitted" in lines[2]
        assert lines[-2] == "8"
        assert lines[-1] == "9"

    def test_full_pipeline_git_status_like(self):
        # Simulate a git-status-like reduction scenario
        rule = {
            "transforms": {"stripAnsi": True, "trimEmptyEdges": True},
            "filters": {
                "skipPatterns": [r'^\s*\(use "git'],
            },
            "summarize": {"head": 10, "tail": 10},
        }
        input_lines = [
            "",
            "\x1b[32mOn branch main\x1b[0m",
            '  (use "git add" to stage)',
            "  modified:   foo.py",
            "",
        ]
        lines, _ = apply_rule(input_lines, rule)
        assert "On branch main" in lines
        assert not any('(use "git' in line for line in lines)
        assert lines[0] != ""  # leading blank trimmed


# ---------------------------------------------------------------------------
# ReDoS guard
# ---------------------------------------------------------------------------

class TestReDoSGuard:
    def test_safe_pattern_compiles(self):
        pat = safe_compile(r"^ERROR: .+$")
        assert pat is not None

    def test_pattern_too_long_rejected(self):
        with pytest.raises(ReDoSRejected):
            safe_compile("a" * 501)

    def test_nested_quantifier_rejected(self):
        # (a+)+ is the canonical catastrophic-backtracking pattern
        with pytest.raises(ReDoSRejected):
            safe_compile(r"(a+)+$")

    def test_nested_quantifier_variant_rejected(self):
        with pytest.raises(ReDoSRejected):
            safe_compile(r"(.*)+end")

    def test_safe_search_returns_match(self):
        pat = safe_compile(r"\d+")
        m = safe_search(pat, "abc 123 def")
        assert m is not None
        assert m.group() == "123"

    def test_safe_search_no_match_returns_none(self):
        pat = safe_compile(r"\d+")
        m = safe_search(pat, "no digits here")
        assert m is None

    def test_redos_guard(self):
        """(a+)+$ applied to 'a'*1000+'b' must either be rejected at compile
        OR safe_search must return within 100ms without hanging.
        """
        pattern = r"(a+)+$"
        evil_input = "a" * 1000 + "b"

        try:
            pat = safe_compile(pattern)
        except ReDoSRejected:
            # Accepted: pattern was statically rejected
            return

        # Pattern was not statically rejected; verify timeout behavior
        start = time.monotonic()
        safe_search(pat, evil_input, timeout_ms=50)
        elapsed_ms = (time.monotonic() - start) * 1000

        assert elapsed_ms < 100, (
            f"safe_search took {elapsed_ms:.1f}ms on ReDoS input -- guard did not fire"
        )
        # safe_search may return None (timed out) or a match -- either is acceptable
        # as long as elapsed is within budget
