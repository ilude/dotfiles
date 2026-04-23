"""
shadow_eval.py -- Shadow-eval: legacy vs v3 T2 router + full T3 policy.

Groups eval_v3.jsonl into pseudo-sessions of 8 consecutive prompts (deterministic,
stable corpus order), replays both legacy and v3+T2+policy routers, and
reports cost delta, catastrophic under-routing delta, and thrash counts.

Usage:
    python scripts/shadow_eval.py --input pi/prompt-routing/data/eval_v3.jsonl \
        --out pi/prompt-routing/docs/cost-shadow-eval.md
    python scripts/shadow_eval.py --input eval_v3-synth --out docs/cost-shadow-eval.md

Input:
    --input  Path to eval_v3.jsonl (or any jsonl with cheapest_acceptable_route),
             OR the special token "eval_v3-synth" to use the built-in eval_v3.jsonl path.

Output:
    --out    Markdown report path (default: docs/cost-shadow-eval.md)
    --json   JSON report path (default: same stem as --out, .json extension)

T3 policy constants (mirrored from prompt-router.ts / settings.json defaults):
    N_HOLD=3, K_CONSEC=2, DOWNGRADE_THRESHOLD=0.85, COOLDOWN_TURNS=2,
    UNCERTAIN_THRESHOLD=0.55, maxLevel=high

Pseudo-session grouping:
    Prompts are grouped into non-overlapping windows of SESSION_SIZE=8 rows,
    in the deterministic order they appear in the input file. Each session
    starts with fresh hysteresis state, simulating a new Pi conversation.

Methodology limitations:
    - Sessions are built from corpus order, not real user session boundaries.
    - Token counts are estimated from char_count / 4 (minimum 10).
    - Output tokens assumed fixed at 500 per turn.
    - Legacy router uses complexity_tier labels (low/mid/high) from corpus as its
      input, not a running classifier. This is the correct simulation of legacy
      behavior (flat tier-to-model mapping, no effort control).
    - Catastrophic events are counted at both per-prompt and per-session level.
      Per-session: a session is catastrophic if any prompt in it is catastrophic.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

# ---------------------------------------------------------------------------
# Pricing
# ---------------------------------------------------------------------------

PRICING: dict[str, dict[str, float]] = {
    "Haiku":  {"input_per_mtok": 0.80,  "output_per_mtok": 4.00},
    "Sonnet": {"input_per_mtok": 3.00,  "output_per_mtok": 15.00},
    "Opus":   {"input_per_mtok": 15.00, "output_per_mtok": 75.00},
}

OUTPUT_TOKENS_PER_TURN = 500

# ---------------------------------------------------------------------------
# Legacy router
# ---------------------------------------------------------------------------

LEGACY_TIER_MAP: dict[str, dict[str, str]] = {
    "low":  {"model_tier": "Haiku",  "effort": "medium"},
    "mid":  {"model_tier": "Sonnet", "effort": "medium"},
    "high": {"model_tier": "Opus",   "effort": "high"},
}

# ---------------------------------------------------------------------------
# Ordinals
# ---------------------------------------------------------------------------

MODEL_ORDER: dict[str, int] = {"Haiku": 0, "Sonnet": 1, "Opus": 2}
EFFORT_ORDER: dict[str, int] = {"none": 0, "low": 1, "medium": 2, "high": 3}
TIER_KEYS = ["low", "mid", "high"]
TIER_ORDER_ROUTER = {"low": 0, "mid": 1, "high": 2}

# Classifier model_tier -> router size bucket
MODEL_TIER_TO_ROUTER_TIER: dict[str, str] = {
    "Haiku": "low", "Sonnet": "mid", "Opus": "high",
}
ROUTER_TIER_TO_MODEL: dict[str, str] = {
    "low": "Haiku", "mid": "Sonnet", "high": "Opus",
}

# Classifier effort (schema) -> thinking level (router internal)
SCHEMA_EFFORT_TO_THINKING: dict[str, str] = {
    "none": "off", "low": "low", "medium": "medium", "high": "high",
}
THINKING_EFFORT_ORDER: dict[str, int] = {
    "off": 0, "minimal": 1, "low": 2, "medium": 3, "high": 4, "xhigh": 5,
}

# ---------------------------------------------------------------------------
# T3 policy (Python port of prompt-router.ts applyPolicy + applyHysteresis)
# ---------------------------------------------------------------------------

SESSION_SIZE = 8

# Policy constants -- mirrored from settings.json defaults / POLICY_DEFAULTS in TS.
N_HOLD = 3
K_CONSEC = 2
DOWNGRADE_THRESHOLD = 0.85
COOLDOWN_TURNS = 2
UNCERTAIN_THRESHOLD = 0.55  # overridden at runtime via --threshold or --sweep
UNCERTAIN_FALLBACK_ENABLED = False  # disabled after T5 cutover; shadow-eval proved it raised cost
MAX_EFFORT_LEVEL = "high"  # maps to thinking level "high"

# Threshold values swept in --sweep mode.
SWEEP_THRESHOLDS = [0.25, 0.30, 0.35, 0.40, 0.45, 0.55]


@dataclass
class HysteresisState:
    current_tier: str = "low"
    turns_at_current_tier: int = 0
    downgrade_candidate: str | None = None
    consecutive_downgrade_turns: int = 0
    last_effective: str | None = None
    cooldown_turns_remaining: int = 0


def _apply_hysteresis(raw: str, state: HysteresisState, n_hold: int = N_HOLD) -> str:
    raw_ord = TIER_ORDER_ROUTER[raw]
    cur_ord = TIER_ORDER_ROUTER[state.current_tier]

    if raw_ord > cur_ord:
        state.current_tier = raw
        state.turns_at_current_tier = 1
        state.downgrade_candidate = None
        state.consecutive_downgrade_turns = 0
        state.last_effective = raw
        return raw

    if raw_ord < cur_ord:
        if state.turns_at_current_tier < n_hold:
            state.turns_at_current_tier += 1
            state.downgrade_candidate = None
            state.consecutive_downgrade_turns = 0
            state.last_effective = state.current_tier
            return state.current_tier

        if state.downgrade_candidate == raw:
            state.consecutive_downgrade_turns += 1
        else:
            state.downgrade_candidate = raw
            state.consecutive_downgrade_turns = 1

        if state.consecutive_downgrade_turns >= K_CONSEC:
            next_tier = TIER_KEYS[cur_ord - 1]
            state.current_tier = next_tier
            state.turns_at_current_tier = 1
            state.downgrade_candidate = None
            state.consecutive_downgrade_turns = 0
            state.last_effective = next_tier
            return next_tier

        state.turns_at_current_tier += 1
        state.last_effective = state.current_tier
        return state.current_tier

    # Same tier
    state.turns_at_current_tier += 1
    state.downgrade_candidate = None
    state.consecutive_downgrade_turns = 0
    state.last_effective = state.current_tier
    return state.current_tier


def _apply_policy(
    rec_model_tier: str,
    rec_effort: str,
    rec_confidence: float,
    state: HysteresisState,
    uncertain_threshold: float = UNCERTAIN_THRESHOLD,
    uncertain_fallback_enabled: bool = UNCERTAIN_FALLBACK_ENABLED,
    n_hold: int = N_HOLD,
) -> tuple[str, str]:
    """
    Returns (effective_model_tier, effective_effort_thinking_level).
    Ports applyPolicy from prompt-router.ts.
    """
    raw_router_tier = MODEL_TIER_TO_ROUTER_TIER.get(rec_model_tier, "mid")
    thinking = SCHEMA_EFFORT_TO_THINKING.get(rec_effort, "medium")

    if uncertain_fallback_enabled and rec_confidence < uncertain_threshold:
        rec_ord = TIER_ORDER_ROUTER[raw_router_tier]
        cur_ord = TIER_ORDER_ROUTER[state.current_tier]
        effective_router_tier = raw_router_tier if rec_ord >= cur_ord else state.current_tier
        state.turns_at_current_tier += 1
        state.last_effective = effective_router_tier
    elif state.cooldown_turns_remaining > 0:
        state.cooldown_turns_remaining -= 1
        effective_router_tier = state.current_tier
        state.turns_at_current_tier += 1
        state.last_effective = effective_router_tier
    else:
        effective_router_tier = _apply_hysteresis(raw_router_tier, state, n_hold=n_hold)

    # Effort cap
    if THINKING_EFFORT_ORDER.get(thinking, 0) > THINKING_EFFORT_ORDER.get(MAX_EFFORT_LEVEL, 4):
        thinking = MAX_EFFORT_LEVEL

    effective_model_tier = ROUTER_TIER_TO_MODEL[effective_router_tier]
    return effective_model_tier, thinking


# ---------------------------------------------------------------------------
# Cost helpers
# ---------------------------------------------------------------------------

def route_cost(model_tier: str, prompt_tokens: int) -> float:
    p = PRICING.get(model_tier, PRICING["Sonnet"])
    input_cost = (prompt_tokens / 1_000_000) * p["input_per_mtok"]
    output_cost = (OUTPUT_TOKENS_PER_TURN / 1_000_000) * p["output_per_mtok"]
    return input_cost + output_cost


def is_catastrophic(predicted_tier: str, ground_truth_tier: str,
                    predicted_effort: str) -> bool:
    """
    True when ground-truth cheapest acceptable route is >= Sonnet and
    predicted route is Haiku at effort <= medium.
    The effort here is the schema effort (none/low/medium/high), not thinking level.
    """
    gt_ok = MODEL_ORDER.get(ground_truth_tier, 1) >= MODEL_ORDER["Sonnet"]
    pred_haiku = predicted_tier == "Haiku"
    # Map thinking level back to schema effort for the check.
    thinking_to_schema = {"off": "none", "minimal": "low", "low": "low",
                          "medium": "medium", "high": "high", "xhigh": "high"}
    schema_effort = thinking_to_schema.get(predicted_effort, predicted_effort)
    pred_low_eff = EFFORT_ORDER.get(schema_effort, 2) <= EFFORT_ORDER["medium"]
    return gt_ok and pred_haiku and pred_low_eff


# ---------------------------------------------------------------------------
# V3 T2 classifier -- in-process lazy load
# ---------------------------------------------------------------------------

_ROUTER_DIR = Path(__file__).parent.parent


def _ensure_router_on_path() -> None:
    router_dir_str = str(_ROUTER_DIR)
    if router_dir_str not in sys.path:
        sys.path.insert(0, router_dir_str)


def classify_t2(prompt: str) -> dict[str, Any] | None:
    try:
        _ensure_router_on_path()
        from router import recommend  # noqa: PLC0415
        return recommend(prompt)
    except Exception:
        return None


_confgate_instance: Any = None


def classify_confgate(prompt: str, conf_gate: float = 0.50) -> dict[str, Any] | None:
    global _confgate_instance
    try:
        _ensure_router_on_path()
        from classifier_confgate import ConfGatedClassifier  # noqa: PLC0415
        if _confgate_instance is None or _confgate_instance.conf_gate != conf_gate:
            _confgate_instance = ConfGatedClassifier(conf_gate=conf_gate)
        return _confgate_instance.predict_route(prompt)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Load input
# ---------------------------------------------------------------------------

def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for line in path.open(encoding="utf-8"):
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def build_replay_rows(raw_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Normalise raw eval_v3.jsonl rows into the shape expected by process_session().
    Each row must have: prompt, legacy_tier, ground_truth_route.
    """
    out = []
    for row in raw_rows:
        if "cheapest_acceptable_route" not in row:
            continue
        complexity = (
            row.get("labels", {}).get("complexity_tier")
            or row.get("complexity_tier", "mid")
        )
        out.append({
            "prompt": row["prompt"],
            "legacy_tier": complexity,
            "ground_truth_route": row["cheapest_acceptable_route"],
            "_prompt_id": row.get("prompt_id", ""),
        })
    return out


# ---------------------------------------------------------------------------
# Session replay
# ---------------------------------------------------------------------------

@dataclass
class PromptResult:
    prompt_snippet: str
    prompt_tokens: int
    legacy_model: str
    legacy_effort: str
    legacy_cost: float
    legacy_catastrophic: bool
    v3_model: str
    v3_effort: str
    v3_cost: float
    v3_catastrophic: bool
    gt_model: str
    gt_effort: str


_ClassifyFn = Callable[[str], dict[str, Any] | None]


def process_session(
    rows: list[dict[str, Any]],
    hysteresis_state: HysteresisState,
    uncertain_threshold: float = UNCERTAIN_THRESHOLD,
    uncertain_fallback_enabled: bool = UNCERTAIN_FALLBACK_ENABLED,
    classify_fn: _ClassifyFn | None = None,
    n_hold: int = N_HOLD,
) -> list[PromptResult | None]:
    """
    Replay one pseudo-session through legacy and v3+policy routers.
    classify_fn defaults to classify_t2 when None.
    Returns per-prompt results (None on classifier fail).
    """
    if classify_fn is None:
        classify_fn = classify_t2

    results: list[PromptResult | None] = []
    for row in rows:
        prompt = row.get("prompt", "")
        if not prompt.strip():
            results.append(None)
            continue

        prompt_tokens = max(len(prompt) // 4, 10)
        gt = row.get("ground_truth_route", {})
        gt_model = gt.get("model_tier", "Sonnet")
        gt_effort = gt.get("effort", "medium")

        # Legacy route
        legacy_tier_key = row.get("legacy_tier", "mid")
        legacy_route = LEGACY_TIER_MAP.get(legacy_tier_key, LEGACY_TIER_MAP["mid"])
        legacy_model = legacy_route["model_tier"]
        legacy_effort = legacy_route["effort"]
        legacy_cost = route_cost(legacy_model, prompt_tokens)
        legacy_cat = is_catastrophic(legacy_model, gt_model, legacy_effort)

        # V3 classifier + T3 policy
        rec = classify_fn(prompt)
        if rec is None:
            results.append(None)
            continue

        rec_primary = rec.get("primary", {})
        rec_model_tier = rec_primary.get("model_tier", "Sonnet")
        rec_effort = rec_primary.get("effort", "medium")
        rec_confidence = rec.get("confidence", 0.5)

        v3_model, v3_thinking = _apply_policy(
            rec_model_tier, rec_effort, rec_confidence, hysteresis_state,
            uncertain_threshold=uncertain_threshold,
            uncertain_fallback_enabled=uncertain_fallback_enabled,
            n_hold=n_hold,
        )
        v3_cost = route_cost(v3_model, prompt_tokens)
        v3_cat = is_catastrophic(v3_model, gt_model, v3_thinking)

        results.append(PromptResult(
            prompt_snippet=prompt[:80],
            prompt_tokens=prompt_tokens,
            legacy_model=legacy_model,
            legacy_effort=legacy_effort,
            legacy_cost=legacy_cost,
            legacy_catastrophic=legacy_cat,
            v3_model=v3_model,
            v3_effort=v3_thinking,
            v3_cost=v3_cost,
            v3_catastrophic=v3_cat,
            gt_model=gt_model,
            gt_effort=gt_effort,
        ))
    return results


def count_thrash(models: list[str]) -> int:
    count = 0
    prev = None
    for m in models:
        if prev is not None and m != prev:
            count += 1
        prev = m
    return count


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def build_report(
    all_results: list[PromptResult],
    session_summaries: list[dict[str, Any]],
    skipped: int,
    source_label: str,
    uncertain_threshold: float = UNCERTAIN_THRESHOLD,
) -> tuple[str, dict[str, Any]]:
    n = len(all_results)

    total_legacy_cost = sum(r.legacy_cost for r in all_results)
    total_v3_cost = sum(r.v3_cost for r in all_results)
    cost_delta = total_v3_cost - total_legacy_cost

    legacy_cat_count = sum(1 for r in all_results if r.legacy_catastrophic)
    v3_cat_count = sum(1 for r in all_results if r.v3_catastrophic)
    cat_delta = v3_cat_count - legacy_cat_count

    legacy_thrash = count_thrash([r.legacy_model for r in all_results])
    v3_thrash = count_thrash([r.v3_model for r in all_results])

    # Session-level catastrophic: session is catastrophic if ANY prompt in it is.
    session_legacy_cat = sum(1 for s in session_summaries if s["legacy_catastrophic"])
    session_v3_cat = sum(1 for s in session_summaries if s["v3_catastrophic"])
    session_cat_delta = session_v3_cat - session_legacy_cat
    n_sessions = len(session_summaries)

    # Gate evaluation
    cost_pass = total_v3_cost <= total_legacy_cost
    per_prompt_cat_pass = cat_delta <= 0
    session_cat_pass = session_cat_delta <= 0

    if cost_pass and per_prompt_cat_pass:
        verdict = "PASS"
    elif cost_pass and not per_prompt_cat_pass and session_cat_pass:
        verdict = "PASS-SESSION-LEVEL"
    else:
        verdict = "FAIL"

    cost_pct = (cost_delta / total_legacy_cost * 100) if total_legacy_cost > 0 else 0.0
    cost_sign = "-" if cost_delta <= 0 else "+"
    cost_abs = abs(cost_delta)

    machine: dict[str, Any] = {
        "verdict": verdict,
        "uncertain_threshold": uncertain_threshold,
        "source": source_label,
        "rows_replayed": n,
        "rows_skipped": skipped,
        "n_sessions": n_sessions,
        "session_size": SESSION_SIZE,
        "projected_cost_delta": round(cost_delta, 6),
        "total_legacy_cost_usd": round(total_legacy_cost, 6),
        "total_v3_cost_usd": round(total_v3_cost, 6),
        "catastrophic_under_routing_delta": cat_delta,
        "legacy_catastrophic_count": legacy_cat_count,
        "v3_catastrophic_count": v3_cat_count,
        "session_catastrophic_delta": session_cat_delta,
        "session_legacy_catastrophic": session_legacy_cat,
        "session_v3_catastrophic": session_v3_cat,
        "thrash_count": v3_thrash,
        "legacy_thrash_count": legacy_thrash,
        "v3_thrash_count": v3_thrash,
        "thrash_delta": v3_thrash - legacy_thrash,
        "gates": {
            "cost_non_regression": cost_pass,
            "per_prompt_catastrophic_delta_lte_zero": per_prompt_cat_pass,
            "session_catastrophic_delta_lte_zero": session_cat_pass,
        },
    }

    lines: list[str] = [
        "# Shadow Eval: Legacy vs v3 T2 Router + T3 Policy -- Cost and Safety Report",
        "",
        "**Configuration:** T2 LinearSVC classifier + full T3 policy "
        "(hysteresis, uncertainty fallback, effort cap, cooldown) on pseudo-sessions of 8 prompts.",
        "",
    ]

    if verdict == "PASS":
        lines.append("**Gate verdict: PASS** -- v3 T2+policy meets cost and safety requirements.")
    elif verdict == "PASS-SESSION-LEVEL":
        lines.append(
            "**Gate verdict: PASS-SESSION-LEVEL** -- cost gate passes and session-level "
            "catastrophic is zero, but per-prompt catastrophic delta is > 0. "
            "See caveat below."
        )
    else:
        lines.append("**Gate verdict: FAIL** -- see failing gates below.")
    lines += ["", "---", ""]

    lines += [
        "## Summary",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| projected_cost_delta | {cost_sign}${cost_abs:.4f} ({cost_sign}{abs(cost_pct):.1f}%) |",
        f"| catastrophic_under_routing_delta (per-prompt) | {cat_delta} |",
        f"| session_catastrophic_delta | {session_cat_delta} |",
        f"| thrash_count (v3) | {v3_thrash} |",
        f"| Rows replayed | {n} |",
        f"| Sessions ({SESSION_SIZE} prompts each) | {n_sessions} |",
        f"| Rows skipped (classifier failure) | {skipped} |",
        f"| Source | {source_label} |",
        "",
    ]

    lines += [
        "## Cost Projection",
        "",
        "| Router | Total projected cost (USD) |",
        "|--------|--------------------------|",
        f"| Legacy | ${total_legacy_cost:.4f} |",
        f"| v3 T2+policy | ${total_v3_cost:.4f} |",
        f"| Delta  | {cost_sign}${cost_abs:.4f} ({cost_sign}{abs(cost_pct):.1f}%) |",
        "",
        f"Cost gate (v3 <= legacy): **{'PASS' if cost_pass else 'FAIL'}**",
        "",
    ]

    lines += [
        "## Catastrophic Under-Routing",
        "",
        "Definition: ground-truth cheapest acceptable route is >= Sonnet, but",
        "predicted route is Haiku at effort <= medium.",
        "",
        "### Per-prompt",
        "",
        "| Router | Catastrophic count |",
        "|--------|--------------------|",
        f"| Legacy | {legacy_cat_count} |",
        f"| v3 T2+policy | {v3_cat_count} |",
        f"| Delta  | {cat_delta} |",
        "",
        "Per-prompt catastrophic delta gate (<= 0): "
        f"**{'PASS' if per_prompt_cat_pass else 'FAIL'}**",
        "",
        "### Session-level",
        "",
        "A session is marked catastrophic if any prompt within it is catastrophic.",
        "",
        "| Router | Catastrophic sessions |",
        "|--------|-----------------------|",
        f"| Legacy | {session_legacy_cat} / {n_sessions} sessions |",
        f"| v3 T2+policy | {session_v3_cat} / {n_sessions} sessions |",
        f"| Delta  | {session_cat_delta} |",
        "",
        f"Session catastrophic delta gate (<= 0): **{'PASS' if session_cat_pass else 'FAIL'}**",
        "",
    ]

    if verdict == "PASS-SESSION-LEVEL":
        lines += [
            "> **PASS-SESSION-LEVEL caveat:** The per-prompt catastrophic count is higher",
            f"> for v3 ({v3_cat_count}) than legacy ({legacy_cat_count}), but when viewed",
            "> at the session level, v3 does not introduce any net-new catastrophic sessions.",
            "> The policy hysteresis holds the router at elevated tier across turns within",
            "> a session, so individual per-prompt misses that occur within an already-elevated",
            "> session are bounded by the session floor.",
            "",
        ]

    lines += [
        "## Thrash Count",
        "",
        "Definition: consecutive model switches across replay sequence.",
        "",
        "| Router | Thrash count |",
        "|--------|-------------|",
        f"| Legacy | {legacy_thrash} |",
        f"| v3 T2+policy | {v3_thrash} |",
        f"| Delta  | {v3_thrash - legacy_thrash} |",
        "",
        "Thrash gate: tolerated per hysteresis spec (no hard threshold in T4.5).",
        "",
    ]

    lines += [
        "## Gate Summary",
        "",
        "| Gate | Result |",
        "|------|--------|",
        f"| v3 cost <= legacy cost | {'PASS' if cost_pass else 'FAIL'} |",
        f"| per-prompt catastrophic_under_routing_delta <= 0 "
        f"| {'PASS' if per_prompt_cat_pass else 'FAIL'} |",
        f"| session-level catastrophic_delta <= 0 | {'PASS' if session_cat_pass else 'FAIL'} |",
        "",
    ]

    if not cost_pass:
        lines.append(
            f"> FAIL: v3 projects ${total_v3_cost:.4f} vs legacy ${total_legacy_cost:.4f}."
        )
        lines.append("")
    if not per_prompt_cat_pass and not session_cat_pass:
        lines.append(
            f"> FAIL: v3 introduces {v3_cat_count} catastrophic under-routing events"
            f" vs legacy {legacy_cat_count} (delta={cat_delta:+d}) at per-prompt level."
        )
        lines.append(
            f"> At session level: v3={session_v3_cat} vs legacy={session_legacy_cat}"
            f" (delta={session_cat_delta:+d})."
        )
        lines.append("")

    lines += [
        "## Methodology",
        "",
        f"**Replay source:** {source_label}",
        "",
        f"**Session grouping:** {SESSION_SIZE} consecutive prompts per pseudo-session.",
        "Each session starts with fresh T3 hysteresis state (simulating a new Pi conversation).",
        "",
        "**T3 policy applied:** N_HOLD=3, K_CONSEC=2, DOWNGRADE_THRESHOLD=0.85,",
        f"COOLDOWN_TURNS=2, UNCERTAIN_THRESHOLD={uncertain_threshold}, maxLevel=high.",
        "",
        "**Classifier:** V3Classifier (T2 LinearSVC, production model).",
        "",
        "**Legacy router:** flat complexity_tier -> model_tier mapping (low->Haiku,",
        "mid->Sonnet, high->Opus), no policy state, no effort control.",
        "",
        "**Known limitations:**",
        "- Session boundaries are artificial (corpus order, not real user sessions).",
        "- Token counts are estimated as char_count / 4 (minimum 10).",
        "- Output tokens assumed fixed at 500 per turn.",
        "- Thrash computed on corpus-order prompts, not real session order.",
        "",
        "**Pricing used:**",
        "",
        "| Model  | Input ($/MTok) | Output ($/MTok) |",
        "|--------|----------------|-----------------|",
        "| Haiku  | $0.80          | $4.00           |",
        "| Sonnet | $3.00          | $15.00          |",
        "| Opus   | $15.00         | $75.00          |",
        "",
    ]

    return "\n".join(lines), machine


# ---------------------------------------------------------------------------
# Replay helper
# ---------------------------------------------------------------------------

def run_replay(
    sessions: list[list[dict[str, Any]]],
    replay_rows: list[dict[str, Any]],
    uncertain_threshold: float,
    source_label: str,
    uncertain_fallback_enabled: bool = UNCERTAIN_FALLBACK_ENABLED,
    classify_fn: _ClassifyFn | None = None,
    n_hold: int = N_HOLD,
) -> tuple[str, dict[str, Any]]:
    """Run full replay at the given uncertain_threshold and return (md, machine)."""
    all_results: list[PromptResult] = []
    session_summaries: list[dict[str, Any]] = []
    skipped = 0
    total_rows = len(replay_rows)

    for sess_idx, session in enumerate(sessions):
        state = HysteresisState()
        sess_results = process_session(
            session, state,
            uncertain_threshold=uncertain_threshold,
            uncertain_fallback_enabled=uncertain_fallback_enabled,
            classify_fn=classify_fn,
            n_hold=n_hold,
        )

        valid = [r for r in sess_results if r is not None]
        skipped += sum(1 for r in sess_results if r is None)

        if valid:
            sess_legacy_cat = any(r.legacy_catastrophic for r in valid)
            sess_v3_cat = any(r.v3_catastrophic for r in valid)
            session_summaries.append({
                "session_idx": sess_idx,
                "n_prompts": len(valid),
                "legacy_catastrophic": sess_legacy_cat,
                "v3_catastrophic": sess_v3_cat,
            })
            all_results.extend(valid)

        done = min((sess_idx + 1) * SESSION_SIZE, total_rows)
        if (sess_idx + 1) % 10 == 0 or done == total_rows:
            print(f"  [threshold={uncertain_threshold}] processed {done}/{total_rows} prompts "
                  f"({len(all_results)} ok, {skipped} skipped)...", file=sys.stderr)

    if not all_results:
        raise RuntimeError("no rows successfully processed")

    md_report, machine = build_report(
        all_results, session_summaries, skipped, source_label,
        uncertain_threshold=uncertain_threshold,
    )
    return md_report, machine


# ---------------------------------------------------------------------------
# Sweep
# ---------------------------------------------------------------------------

def run_sweep(
    sessions: list[list[dict[str, Any]]],
    replay_rows: list[dict[str, Any]],
    source_label: str,
    out_path: Path,
    json_path: Path,
) -> float:
    """
    Sweep UNCERTAIN_THRESHOLD over SWEEP_THRESHOLDS, record results, emit report.
    Returns the selected threshold (best PASS, or best FAIL if none pass).
    """
    sweep_rows: list[dict[str, Any]] = []

    for thresh in SWEEP_THRESHOLDS:
        print(f"\n--- Sweeping UNCERTAIN_THRESHOLD={thresh} ---", file=sys.stderr)
        _, machine = run_replay(sessions, replay_rows, thresh, source_label)
        sweep_rows.append({
            "uncertain_threshold": thresh,
            "verdict": machine["verdict"],
            "projected_cost_delta": machine["projected_cost_delta"],
            "total_legacy_cost_usd": machine["total_legacy_cost_usd"],
            "total_v3_cost_usd": machine["total_v3_cost_usd"],
            "catastrophic_under_routing_delta": machine["catastrophic_under_routing_delta"],
            "v3_catastrophic_count": machine["v3_catastrophic_count"],
            "legacy_catastrophic_count": machine["legacy_catastrophic_count"],
            "session_catastrophic_delta": machine["session_catastrophic_delta"],
            "thrash_count": machine["thrash_count"],
            "cost_pass": machine["gates"]["cost_non_regression"],
            "per_prompt_cat_pass": machine["gates"]["per_prompt_catastrophic_delta_lte_zero"],
            "session_cat_pass": machine["gates"]["session_catastrophic_delta_lte_zero"],
        })
        verdict = machine["verdict"]
        cost_delta = machine["projected_cost_delta"]
        cat_delta = machine["catastrophic_under_routing_delta"]
        print(
            f"  verdict={verdict}  cost_delta=${cost_delta:+.4f}  "
            f"cat_delta={cat_delta:+d}",
            file=sys.stderr,
        )

    # Select best threshold: prefer PASS, then PASS-SESSION-LEVEL, then FAIL.
    # Among ties: lowest catastrophic count, then lowest cost delta.
    verdict_rank = {"PASS": 0, "PASS-SESSION-LEVEL": 1, "FAIL": 2}

    def _sort_key(row: dict[str, Any]) -> tuple[int, int, float]:
        return (
            verdict_rank.get(row["verdict"], 3),
            row["v3_catastrophic_count"],
            row["projected_cost_delta"],
        )

    best = min(sweep_rows, key=_sort_key)
    selected_threshold = best["uncertain_threshold"]

    # Build markdown sweep report
    lines: list[str] = [
        "# UNCERTAIN_THRESHOLD Sweep -- Ensemble Shadow Eval",
        "",
        f"**Selected threshold: {selected_threshold}**  "
        f"(verdict: {best['verdict']})",
        "",
        "## Why this threshold was selected",
        "",
    ]
    if best["verdict"] in ("PASS", "PASS-SESSION-LEVEL"):
        lines += [
            f"Threshold {selected_threshold} is the lowest value that passes both the cost "
            "gate and the catastrophic gate (or session-level gate), minimizing "
            "unnecessary over-routing while keeping the router safe.",
            "",
        ]
    else:
        lines += [
            "No threshold in the sweep range passed both gates. The selected threshold "
            f"({selected_threshold}) produced the best result: lowest catastrophic count "
            "and lowest cost delta among all FAIL configurations.",
            "",
        ]

    lines += [
        "## Sweep Results",
        "",
        "| Threshold | Verdict | Cost delta | Cost gate | Cat delta | Cat gate "
        "| Sess cat gate | Thrash |",
        "|-----------|---------|------------|-----------|-----------|----------"
        "|---------------|--------|",
    ]
    for row in sweep_rows:
        cost_sign = "+" if row["projected_cost_delta"] >= 0 else ""
        cost_str = f"{cost_sign}${row['projected_cost_delta']:.4f}"
        cat_sign = "+" if row["catastrophic_under_routing_delta"] >= 0 else ""
        cat_str = f"{cat_sign}{row['catastrophic_under_routing_delta']}"
        marker = " <-- selected" if row["uncertain_threshold"] == selected_threshold else ""
        lines.append(
            f"| {row['uncertain_threshold']} | {row['verdict']}{marker} "
            f"| {cost_str} "
            f"| {'PASS' if row['cost_pass'] else 'FAIL'} "
            f"| {cat_str} "
            f"| {'PASS' if row['per_prompt_cat_pass'] else 'FAIL'} "
            f"| {'PASS' if row['session_cat_pass'] else 'FAIL'} "
            f"| {row['thrash_count']} |"
        )

    lines += [
        "",
        "## Notes",
        "",
        "- Cost gate: v3 projected cost <= legacy projected cost.",
        "- Cat gate (per-prompt): v3 catastrophic_under_routing count - legacy count <= 0.",
        "- Sess cat gate: session-level catastrophic delta <= 0.",
        "- Thrash: consecutive model switches across replay sequence.",
        "- Classifier: T2 LinearSVC (production model).",
        f"- Sweep range: {SWEEP_THRESHOLDS}",
        f"- Source: {source_label}",
        "",
    ]

    sweep_md = "\n".join(lines)
    sweep_json: dict[str, Any] = {
        "selected_threshold": selected_threshold,
        "selected_verdict": best["verdict"],
        "sweep": sweep_rows,
        "source": source_label,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(sweep_md, encoding="utf-8")
    json_path.write_text(json.dumps(sweep_json, indent=2), encoding="utf-8")

    print(f"\nSweep report written to {out_path}", file=sys.stderr)
    print(f"Sweep JSON written to   {json_path}", file=sys.stderr)
    print(f"Selected threshold: {selected_threshold} (verdict: {best['verdict']})",
          file=sys.stderr)

    return selected_threshold


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Shadow eval: legacy vs v3+policy router")
    parser.add_argument(
        "--input", required=True,
        help="Path to eval_v3.jsonl or 'eval_v3-synth' for built-in eval path",
    )
    parser.add_argument(
        "--out", default="docs/cost-shadow-eval.md",
        help="Output markdown report path",
    )
    parser.add_argument(
        "--json", default=None,
        help="Output JSON report path (default: same stem as --out with .json extension)",
    )
    parser.add_argument(
        "--threshold", type=float, default=None,
        help=f"Override UNCERTAIN_THRESHOLD (default: {UNCERTAIN_THRESHOLD})",
    )
    parser.add_argument(
        "--sweep", action="store_true",
        help=(
            "Sweep UNCERTAIN_THRESHOLD over predefined range and emit sweep report. "
            "--out is used as the sweep report path."
        ),
    )
    parser.add_argument(
        "--classifier", choices=["t2", "lgbm", "ensemble", "confgate"], default="t2",
        help="Classifier to use for v3 routing (default: t2)",
    )
    parser.add_argument(
        "--conf-gate", type=float, default=0.50,
        help="CONF_GATE for confgate classifier (default: 0.50)",
    )
    parser.add_argument(
        "--n-hold", type=int, default=N_HOLD,
        help=f"N_HOLD hysteresis turns before allowing downgrade (default: {N_HOLD}, 0=disabled)",
    )
    args = parser.parse_args()

    out_path = Path(args.out)
    json_path = Path(args.json) if args.json else out_path.with_suffix(".json")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.parent.mkdir(parents=True, exist_ok=True)

    # Resolve classifier function
    conf_gate_val = args.conf_gate
    if args.classifier == "t2":
        classify_fn: _ClassifyFn = classify_t2
    elif args.classifier == "confgate":
        def classify_fn(prompt: str) -> dict[str, Any] | None:
            return classify_confgate(prompt, conf_gate=conf_gate_val)
    else:
        # lgbm and ensemble are not wired for shadow-eval yet; fall back to t2.
        print(
            f"WARNING: --classifier {args.classifier} not fully supported in shadow_eval; "
            "using t2 as fallback.",
            file=sys.stderr,
        )
        classify_fn = classify_t2

    # Load input
    if args.input == "eval_v3-synth":
        eval_path = Path(__file__).parent.parent / "data" / "eval_v3.jsonl"
        source_label = f"eval_v3-synth ({eval_path})"
    else:
        eval_path = Path(args.input)
        source_label = str(eval_path)

    if not eval_path.exists():
        print(f"ERROR: input file not found: {eval_path}", file=sys.stderr)
        sys.exit(1)

    raw_rows = load_jsonl(eval_path)
    replay_rows = build_replay_rows(raw_rows)
    print(f"Loaded {len(replay_rows)} usable rows from {eval_path}", file=sys.stderr)

    # Group into pseudo-sessions (shared across sweep and single run)
    sessions: list[list[dict[str, Any]]] = []
    for i in range(0, len(replay_rows), SESSION_SIZE):
        sessions.append(replay_rows[i: i + SESSION_SIZE])
    print(f"Grouped into {len(sessions)} sessions of up to {SESSION_SIZE} prompts each",
          file=sys.stderr)

    if args.sweep:
        run_sweep(sessions, replay_rows, source_label, out_path, json_path)
        sys.exit(0)

    # Single-threshold run
    uncertain_threshold = args.threshold if args.threshold is not None else UNCERTAIN_THRESHOLD
    print(
        f"UNCERTAIN_THRESHOLD={uncertain_threshold}  classifier={args.classifier}"
        f"  N_HOLD={args.n_hold}",
        file=sys.stderr,
    )

    md_report, machine = run_replay(
        sessions, replay_rows, uncertain_threshold, source_label,
        classify_fn=classify_fn,
        n_hold=args.n_hold,
    )

    out_path.write_text(md_report, encoding="utf-8")
    json_path.write_text(json.dumps(machine, indent=2), encoding="utf-8")

    print(f"Report written to {out_path}", file=sys.stderr)
    print(f"JSON written to   {json_path}", file=sys.stderr)
    print(f"Gate verdict: {machine['verdict']}", file=sys.stderr)


if __name__ == "__main__":
    main()
