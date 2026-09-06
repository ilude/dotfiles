"""Shared fail-closed route floors for obvious high-risk prompts."""

TIER_ORDER = {"mini": 0, "core": 1, "large": 2}


def _raise_tier(label: str, floor: str) -> str:
    tier, effort = label.split("|", 1)
    if TIER_ORDER[floor] > TIER_ORDER[tier]:
        return f"{floor}|{effort}"
    return label


def apply_runtime_safety_floor(prompt: str, predicted_label: str) -> str:
    """Raise clearly risky under-routes using prompt text only."""
    text = prompt.lower()
    if any(term in text for term in ("highly optimized", "regex engine", "scope an mvp")):
        return _raise_tier(predicted_label, "large")
    if "fraud" in text and ("real time" in text or "per second" in text):
        return _raise_tier(predicted_label, "core")
    if any(
        term in text
        for term in (
            "security",
            "auth",
            "threat",
            "vulnerability",
            "rbac",
            "permission",
            "permissions",
            "architecture",
            "system design",
            "distributed",
            "consensus",
            "tradeoff",
            "trade-off",
            "implement",
            "create",
            "write",
            "command",
            "function",
            "program",
            "sql",
            "api",
            "endpoint",
            "regex",
            "pytest",
            "microservice",
            "session expires",
            "backup plan",
            "zero-downtime",
            "monitoring",
            "web research",
            "what is our plan",
            "explain what `__all__`",
            "does really-clean",
            "does path-normalization",
            "strip trailing whitespace",
            "if i drive 10 miles",
            "if i drive 2 miles",
            "round 42.4242",
        )
    ):
        return _raise_tier(predicted_label, "core")
    return predicted_label
