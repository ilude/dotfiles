import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from guards import select_inline_text, clamp_text, clamp_text_middle, TINY_OUTPUT_MAX_CHARS


class TestSelectInlineText:
    """Test the select_inline_text passthrough guard."""

    def test_never_inflates(self):
        """Passthrough guard never returns compact larger than raw."""
        test_cases = [
            # (raw_len, compact_len, max_inline, tiny_max)
            (10, 20, 100, 240),
            (50, 100, 100, 240),
            (200, 150, 100, 240),
            (500, 600, 1000, 240),
            (1000, 500, 100, 240),
        ]
        for raw_len, compact_len, max_inline, tiny_max in test_cases:
            raw = "x" * raw_len
            compact = "y" * compact_len
            result = select_inline_text(raw, compact, max_inline, tiny_max)
            assert len(result) <= max(len(raw), len(compact)), (
                f"Result length {len(result)} exceeds max of raw "
                f"{len(raw)} and compact {len(compact)}"
            )

    def test_raw_within_limit_and_compact_not_smaller(self):
        """Returns raw when raw <= max_inline and compact >= raw."""
        raw = "a" * 50
        compact = "b" * 50
        result = select_inline_text(raw, compact, max_inline_chars=100, tiny_max=240)
        assert result == raw

    def test_compact_smaller_than_raw_within_limit(self):
        """Returns raw when raw <= max_inline even if compact is smaller."""
        raw = "a" * 50
        compact = "b" * 40
        result = select_inline_text(raw, compact, max_inline_chars=100, tiny_max=240)
        assert result == raw

    def test_raw_exceeds_tiny_threshold(self):
        """Returns compact when raw > tiny_threshold."""
        raw = "a" * 300
        compact = "b" * 50
        result = select_inline_text(raw, compact, max_inline_chars=100, tiny_max=240)
        # raw is 300, > tiny_max (240), so second condition fails
        # raw is 300, > max_inline (100), so first condition fails
        # returns compact
        assert result == compact

    def test_tiny_bypass(self):
        """Tiny output bypasses compaction using upstream threshold."""
        assert TINY_OUTPUT_MAX_CHARS == 240
        raw = "a" * 239
        compact = "b" * 10
        result = select_inline_text(raw, compact, max_inline_chars=100, tiny_max=240)
        assert result == raw

    def test_tiny_boundary_at_max(self):
        """Tiny bypass triggers at len < tiny_max, not <=."""
        raw = "a" * 240
        compact = "b" * 10
        result = select_inline_text(raw, compact, max_inline_chars=100, tiny_max=240)
        assert result == compact

    def test_default_tiny_max(self):
        """Default tiny_max parameter is TINY_OUTPUT_MAX_CHARS."""
        raw = "a" * 239
        compact = "b" * 10
        result = select_inline_text(raw, compact, max_inline_chars=100)
        assert result == raw


class TestClampText:
    """Test clamp_text truncation with suffix marker."""

    def test_clamp_marker(self):
        """clamp_text truncates and inserts marker."""
        text = "hello world this is a longer string"
        result = clamp_text(text, max_chars=30)
        assert "... truncated ..." in result
        assert len(result) <= 30

    def test_within_limit(self):
        """clamp_text returns text unchanged if within limit."""
        text = "hello"
        result = clamp_text(text, max_chars=10)
        assert result == text

    def test_at_limit(self):
        """clamp_text returns text unchanged if at limit."""
        text = "hello"
        result = clamp_text(text, max_chars=5)
        assert result == text

    def test_truncation_preserves_max_chars(self):
        """Truncated result does not exceed max_chars."""
        text = "x" * 1000
        max_chars = 50
        result = clamp_text(text, max_chars)
        assert len(result) <= max_chars

    def test_empty_text(self):
        """clamp_text handles empty text."""
        result = clamp_text("", max_chars=10)
        assert result == ""


class TestClampTextMiddle:
    """Test clamp_text_middle with head/tail preservation."""

    def test_within_limit(self):
        """clamp_text_middle returns text unchanged if within limit."""
        text = "hello"
        result = clamp_text_middle(text, max_chars=10)
        assert result == text

    def test_truncation_preserves_max_chars(self):
        """Truncated result does not exceed max_chars."""
        text = "x" * 1000
        max_chars = 50
        result = clamp_text_middle(text, max_chars)
        assert len(result) <= max_chars

    def test_keeps_head_and_tail(self):
        """Truncated text keeps head and tail."""
        text = "start_this_is_a_very_long_middle_section_and_end"
        result = clamp_text_middle(text, max_chars=30)
        assert result.startswith("start")
        assert result.endswith("end")
        assert "... omitted ..." in result

    def test_head_tail_ratio(self):
        """Head receives 70% of body chars, tail gets 30%."""
        text = "a" * 100
        max_chars = 30
        result = clamp_text_middle(text, max_chars)
        marker = "\n... omitted ...\n"
        assert marker in result

    def test_empty_text(self):
        """clamp_text_middle handles empty text."""
        result = clamp_text_middle("", max_chars=10)
        assert result == ""
