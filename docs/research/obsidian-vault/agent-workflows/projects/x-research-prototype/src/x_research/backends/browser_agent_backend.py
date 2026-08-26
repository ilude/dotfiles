"""Bounded parser for browser-agent text snapshots."""

from __future__ import annotations

from dataclasses import dataclass

from x_research.models import Tweet, XUser
from x_research.protocol import Page


@dataclass(frozen=True)
class BrowserBudget:
    """Read-only browser extraction budget."""

    max_items: int = 20
    max_scrolls: int = 3
    timeout_seconds: int = 30


def parse_snapshot(text: str, *, budget: BrowserBudget | None = None) -> Page[Tweet]:
    """Parse a captured text snapshot into partial tweet-like records."""
    active_budget = budget or BrowserBudget()
    items: list[Tweet] = []
    for index, line in enumerate(line.strip() for line in text.splitlines() if line.strip()):
        if len(items) >= active_budget.max_items:
            break
        if line.startswith("@"):  # simple offline parser fixture format: @handle: text
            handle, _, body = line.partition(":")
            user = XUser(id=handle.lstrip("@").lower(), handle=handle)
            items.append(
                Tweet(id=f"snapshot-{index}", author_id=user.id, text=body.strip() or line)
            )
    return Page[Tweet](
        items=items,
        source="browser-agent",
        complete=len(items) < active_budget.max_items,
        warnings=["partial browser text snapshot"],
    )
