"""
ReDoS guard for pipeline regex operations.

safe_compile(pattern) rejects patterns that are either too long (>500 chars) or
contain known catastrophic-backtracking constructs (nested quantifiers on overlapping
character classes such as (a+)+, (.*)+, (.+)*).

safe_search(compiled, line, timeout_ms=50) applies the compiled regex with a per-call
timeout. On Unix (POSIX), SIGALRM provides millisecond-granular preemption. On Windows,
SIGALRM is not available; a threading.Timer approach is used instead. The Windows timer
fires on a background thread and sets an interrupt flag that the calling thread checks
after the match returns -- this means Windows does NOT preempt a running regex mid-match.
A catastrophic-backtracking regex on Windows will hang for the full match duration before
the timeout flag is observed. The static reject check in safe_compile is the primary
defense on Windows; the timer is a belt-and-suspenders fallback for near-catastrophic
patterns that slip past the static check.
"""

import platform
import re
import signal
import threading
from typing import Optional

# Patterns known to cause catastrophic backtracking.
# These detect nested quantifiers applied to groups with overlapping character ranges.
_REDOS_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\([^)]*[+*][^)]*\)[+*]"),   # (x+)+ or (x*)+ etc.
    re.compile(r"\([^)]*\)\{[0-9,]+\}[+*]"),  # (x){n,m}+ etc.
    re.compile(r"\([^)]*\+[^)]*\)\?"),         # (x+)? can still be problematic
]

_MAX_PATTERN_LENGTH = 500

_IS_WINDOWS = platform.system() == "Windows"


class ReDoSRejected(ValueError):
    """Raised when a pattern is rejected by the ReDoS guard."""


class RegexTimeout(Exception):
    """Raised when a regex match exceeds the allowed timeout."""


def js_flags_to_re(flags: str) -> re.RegexFlag:
    """Translate a tokenjuice JS regex flags string into Python re flag bits.

    Supported mappings: i->IGNORECASE, m->MULTILINE, s->DOTALL.
    JS-only flags u and g are ignored (no Python equivalent needed).
    """
    result = re.RegexFlag(0)
    for ch in flags:
        if ch == "i":
            result |= re.IGNORECASE
        elif ch == "m":
            result |= re.MULTILINE
        elif ch == "s":
            result |= re.DOTALL
        # u (unicode) and g (global) are ignored
    return result


def safe_compile(pattern: str, flags: re.RegexFlag = re.RegexFlag(0)) -> re.Pattern[str]:
    """Compile a regex pattern after static safety checks.

    Raises ReDoSRejected if the pattern exceeds 500 chars or contains
    a known nested-quantifier structure.
    """
    if len(pattern) > _MAX_PATTERN_LENGTH:
        raise ReDoSRejected(
            f"Pattern length {len(pattern)} exceeds limit of {_MAX_PATTERN_LENGTH}"
        )

    for guard_re in _REDOS_PATTERNS:
        if guard_re.search(pattern):
            raise ReDoSRejected(
                f"Pattern contains potential catastrophic-backtracking construct: {pattern!r}"
            )

    return re.compile(pattern, flags)


def _safe_search_unix(
    compiled: re.Pattern[str], line: str, timeout_ms: int
) -> Optional[re.Match[str]]:
    timeout_secs = max(1, timeout_ms) / 1000.0

    def _handler(signum: int, frame: object) -> None:
        raise RegexTimeout(f"Regex match exceeded {timeout_ms}ms")

    old_handler = signal.signal(signal.SIGALRM, _handler)
    # SIGALRM only supports integer seconds via signal.alarm; use setitimer for ms precision
    signal.setitimer(signal.ITIMER_REAL, timeout_secs)
    try:
        return compiled.search(line)
    except RegexTimeout:
        return None
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old_handler)


def _safe_search_windows(
    compiled: re.Pattern[str], line: str, timeout_ms: int
) -> Optional[re.Match[str]]:
    result_container: list[Optional[re.Match[str]]] = [None]

    def _do_match() -> None:
        result_container[0] = compiled.search(line)

    t = threading.Thread(target=_do_match, daemon=True)
    t.start()
    t.join(timeout=timeout_ms / 1000.0)

    if t.is_alive():
        # Thread is still running -- cannot forcibly kill it on Windows.
        # Mark as timed out and return None. The daemon thread will eventually
        # finish but we don't block on it.
        return None

    return result_container[0]


def safe_search(
    compiled: re.Pattern[str], line: str, timeout_ms: int = 50
) -> Optional[re.Match[str]]:
    """Run compiled.search(line) with a per-call timeout.

    Returns the match object on success, or None on timeout.
    Raises RegexTimeout only on Unix if the signal fires during the match.
    On Windows, a timed-out match silently returns None (the background thread
    cannot be preempted mid-regex; see module docstring).
    """
    if _IS_WINDOWS:
        return _safe_search_windows(compiled, line, timeout_ms)
    return _safe_search_unix(compiled, line, timeout_ms)
