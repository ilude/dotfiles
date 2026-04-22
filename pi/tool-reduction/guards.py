# Passthrough guard and text clamping utilities.
# Ported from tokenjuice src/core/reduce.ts and src/core/text.ts

# Matches tokenjuice TINY_OUTPUT_MAX_CHARS = 240
TINY_OUTPUT_MAX_CHARS = 240

TRUNCATION_SUFFIX = "\n... truncated ..."
MIDDLE_TRUNCATION_MARKER = "\n... omitted ...\n"


def select_inline_text(
    raw: str, compact: str, max_inline_chars: int, tiny_max: int = TINY_OUTPUT_MAX_CHARS
) -> str:
    """
    Choose between raw and compact output based on size conditions.

    Returns raw if:
    - len(raw) <= max_inline_chars AND len(compact) >= len(raw), OR
    - len(raw) < tiny_max

    Otherwise returns compact.

    Args:
        raw: Uncompacted output.
        compact: Compacted output.
        max_inline_chars: Maximum raw size before compaction is preferred.
        tiny_max: Threshold below which raw is always returned (tiny_max=240).

    Returns:
        Either raw or compact based on the conditions above.
    """
    if len(raw) <= max_inline_chars and len(compact) >= len(raw):
        return raw
    if len(raw) < tiny_max:
        return raw
    return compact


def clamp_text(text: str, max_chars: int) -> str:
    """
    Truncate text to max_chars, appending a truncation marker if truncated.

    Args:
        text: Text to clamp.
        max_chars: Maximum length of the result.

    Returns:
        text if len(text) <= max_chars, else truncated text with marker.
    """
    if len(text) <= max_chars:
        return text
    body_chars = max(0, max_chars - len(TRUNCATION_SUFFIX))
    head = text[:body_chars]
    return f"{head}{TRUNCATION_SUFFIX}"


def clamp_text_middle(text: str, max_chars: int) -> str:
    """
    Truncate text to max_chars, keeping head and tail with elision in the middle.

    Args:
        text: Text to clamp.
        max_chars: Maximum length of the result.

    Returns:
        text if len(text) <= max_chars, else head + marker + tail.
    """
    if len(text) <= max_chars:
        return text

    marker_chars = len(MIDDLE_TRUNCATION_MARKER)
    body_chars = max(0, max_chars - marker_chars)
    head_chars = int(body_chars * 0.7)
    tail_chars = max(0, body_chars - head_chars)

    head = text[:head_chars]
    tail = text[-tail_chars:] if tail_chars > 0 else ""

    return f"{head}{MIDDLE_TRUNCATION_MARKER}{tail}"
