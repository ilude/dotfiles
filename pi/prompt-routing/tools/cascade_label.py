"""
cascade_label.py -- Ascending cascade relabeler for prompt-routing training data.

For each input row, runs candidate responses through ascending model tiers
(Haiku/none -> Haiku/low -> Sonnet/none -> ... -> Opus/high), judging each
with an Opus judge. Stops at the cheapest tier whose response is "sufficient"
and emits a v3-schema JSONL row with real route_judgments.

Trade-off note (Opus-tier rows): The validator enforces B5 -- generator and
adjudicator must be in different model families. Since the default judge is Opus,
any row that requires Opus-tier responses would have Opus as both generator and
adjudicator. To satisfy B5, when the cascade lands on an Opus tier the judge is
automatically swapped to the Sonnet judge model. This is a deliberate trade-off:
Sonnet may be slightly less accurate as a judge for Opus-tier prompts, but it
keeps the dataset provenance constraint satisfied without manual intervention.

Usage:
    uv run python tools/cascade_label.py \\
        --input data/synthetic_shards/realClaude/chunk.jsonl \\
        --output data/synthetic_shards/realClaude/chunk.cascade.jsonl \\
        --limit 5
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic

# ---------------------------------------------------------------------------
# Cascade definition
# ---------------------------------------------------------------------------

# Each step is (model_tier, effort). Ascending cost order.
CASCADE_STEPS: list[tuple[str, str]] = [
    ("Haiku", "none"),
    ("Haiku", "low"),
    ("Sonnet", "none"),
    ("Sonnet", "low"),
    ("Sonnet", "medium"),
    ("Sonnet", "high"),
    ("Opus", "medium"),
    ("Opus", "high"),
]

# effort -> budget_tokens for extended thinking (none means thinking disabled)
THINKING_BUDGETS: dict[str, int | None] = {
    "none": None,
    "low": 2000,
    "medium": 8000,
    "high": 16000,
}

# Anthropic model IDs per tier
DEFAULT_CANDIDATE_MODELS: dict[str, str] = {
    "Haiku": "claude-haiku-4-5-20251001",
    "Sonnet": "claude-sonnet-4-6",
    "Opus": "claude-opus-4-7",
}
DEFAULT_JUDGE_MODEL = "claude-opus-4-7"

# Complexity tier derived from final route
_MODEL_ORDER = ["Haiku", "Sonnet", "Opus"]
_EFFORT_ORDER = ["none", "low", "medium", "high"]

# ---------------------------------------------------------------------------
# Pricing (Anthropic public pricing, late 2025 -- verify before bulk run)
# TODO: update if pricing changes. Values are USD per 1M tokens.
# ---------------------------------------------------------------------------
_PRICING: dict[str, dict[str, float]] = {
    # model_id: {input: $/MTok, output: $/MTok}
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.00},
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-opus-4-7": {"input": 15.00, "output": 75.00},
}


def _price_usd(model_id: str, input_tokens: int, output_tokens: int) -> float:
    p = _PRICING.get(model_id, {"input": 0.0, "output": 0.0})
    return (input_tokens * p["input"] + output_tokens * p["output"]) / 1_000_000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

logger = logging.getLogger("cascade_label")


def _route_cost(tier: str, effort: str) -> tuple[int, int]:
    return (_MODEL_ORDER.index(tier), _EFFORT_ORDER.index(effort))


def _derive_complexity_tier(model_tier: str, effort: str) -> str:
    if model_tier == "Opus":
        return "high"
    if model_tier == "Sonnet" and effort in ("medium", "high"):
        return "mid"
    return "low"


def _sha256(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8"))
    return h.hexdigest()


def _next_cascade_step(tier: str, effort: str, max_effort: str) -> tuple[str, str] | None:
    """Return the step immediately above (tier, effort) in CASCADE_STEPS, or None."""
    current = (tier, effort)
    max_cost = _route_cost("Opus", max_effort)
    try:
        idx = CASCADE_STEPS.index(current)
    except ValueError:
        return None
    next_idx = idx + 1
    while next_idx < len(CASCADE_STEPS):
        nt, ne = CASCADE_STEPS[next_idx]
        if _route_cost(nt, ne) <= max_cost:
            return (nt, ne)
        next_idx += 1
    return None


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

class Cache:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._data: dict[str, Any] = {}
        if path.exists():
            try:
                self._data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                logger.warning("Cache file corrupt, starting fresh: %s", path)
                self._data = {}

    def get(self, key: str) -> Any | None:
        return self._data.get(key)

    def set(self, key: str, value: Any) -> None:
        self._data[key] = value
        self._flush()

    def _flush(self) -> None:
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._data, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self._path)


# ---------------------------------------------------------------------------
# Anthropic API calls with retry
# ---------------------------------------------------------------------------

MAX_RETRIES = 5
BACKOFF_BASE = 2.0


async def _api_call_with_retry(
    client: anthropic.AsyncAnthropic,
    semaphore: asyncio.Semaphore,
    **kwargs: Any,
) -> anthropic.types.Message:
    attempt = 0
    while True:
        async with semaphore:
            try:
                return await client.messages.create(**kwargs)
            except (anthropic.RateLimitError, anthropic.APIConnectionError) as exc:
                attempt += 1
                if attempt > MAX_RETRIES:
                    raise
                wait = BACKOFF_BASE ** attempt
                logger.warning("Retry %d/%d after %.1fs: %s", attempt, MAX_RETRIES, wait, exc)
                await asyncio.sleep(wait)


async def _candidate_call(
    client: anthropic.AsyncAnthropic,
    semaphore: asyncio.Semaphore,
    model_id: str,
    prompt: str,
    effort: str,
    max_tokens: int = 1024,
) -> tuple[str, int, int]:
    """Returns (response_text, input_tokens, output_tokens)."""
    budget = THINKING_BUDGETS[effort]
    kwargs: dict[str, Any] = {
        "model": model_id,
        "max_tokens": max_tokens if budget is None else max(max_tokens, budget + 512),
        "temperature": 1 if budget else 0,
        "messages": [{"role": "user", "content": prompt}],
    }
    if budget is not None:
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": budget}

    msg = await _api_call_with_retry(client, semaphore, **kwargs)

    # Extract text from content blocks (may include thinking blocks)
    text = ""
    for block in msg.content:
        if block.type == "text":
            text = block.text
            break

    return text, msg.usage.input_tokens, msg.usage.output_tokens


JUDGE_PROMPT_TEMPLATE = """\
You are evaluating whether a candidate response is SUFFICIENT for a user
prompt, or whether a more capable model would be needed.

A response is SUFFICIENT when ALL hold:
- Correctness: factually accurate; no hallucinated APIs, citations, or facts.
- Instruction-following: addresses every constraint in the prompt.
- Reasoning depth: chains of inference are complete, not skipped or hand-waved.
- Completeness: nothing critical missing; not truncated mid-thought.

A response is INSUFFICIENT when any hold:
- Contains errors, fabrications, or contradicts the prompt.
- Misses a constraint, sub-question, or required format.
- Reasoning is shallow where the prompt requires depth.
- Punts on a tractable task.

USER PROMPT:
<<<{prompt}>>>

CANDIDATE RESPONSE:
<<<{response}>>>

Respond in this exact JSON shape, nothing else:
{{"verdict": "sufficient" | "insufficient",
 "failure_mode": "none" | "correctness" | "instruction_following"
                  | "reasoning_depth" | "completeness" | "refusal",
 "confidence": 0.0-1.0,
 "rationale": "<one sentence, prompt-specific>"}}"""


async def _judge_call(
    client: anthropic.AsyncAnthropic,
    semaphore: asyncio.Semaphore,
    judge_model_id: str,
    prompt: str,
    response: str,
) -> tuple[dict[str, Any], int, int]:
    """Returns (verdict_dict, input_tokens, output_tokens)."""
    judge_prompt = JUDGE_PROMPT_TEMPLATE.format(prompt=prompt, response=response)
    msg = await _api_call_with_retry(
        client,
        semaphore,
        model=judge_model_id,
        max_tokens=512,
        temperature=0,
        messages=[{"role": "user", "content": judge_prompt}],
    )
    raw = msg.content[0].text.strip()
    try:
        verdict = json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        import re
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            verdict = json.loads(m.group(0))
        else:
            raise ValueError(f"Judge returned non-JSON: {raw[:200]}")
    return verdict, msg.usage.input_tokens, msg.usage.output_tokens


# ---------------------------------------------------------------------------
# Per-row cascade logic
# ---------------------------------------------------------------------------

async def process_row(
    row: dict[str, Any],
    client: anthropic.AsyncAnthropic,
    semaphore: asyncio.Semaphore,
    cache: Cache,
    candidate_models: dict[str, str],
    judge_model: str,
    max_effort: str,
    dry_run: bool,
    row_num: int,
    total: int,
) -> tuple[dict[str, Any], dict[str, int], float]:
    """
    Run the ascending cascade for one row.
    Returns (output_row, token_counts, wall_clock_seconds).
    token_counts keys: input_tokens, output_tokens.
    """
    t0 = time.monotonic()
    prompt = row["prompt"]
    prompt_id = row.get("prompt_id", f"row-{row_num}")

    tokens: dict[str, int] = {"input_tokens": 0, "output_tokens": 0}
    api_calls = 0

    judgments: list[dict[str, Any]] = []
    final_tier: str | None = None
    final_effort: str | None = None
    final_response: str | None = None
    final_rationale: str | None = None
    last_insufficient: tuple[str, str, str] | None = None  # (tier, effort, rationale)

    max_cost = _route_cost("Opus", max_effort)
    steps = [(t, e) for t, e in CASCADE_STEPS if _route_cost(t, e) <= max_cost]

    if dry_run:
        logger.info("[%d/%d] DRY RUN: %s would run %d cascade steps", row_num, total, prompt_id, len(steps))
        # Return input row unchanged with placeholder
        out = dict(row)
        out["notes"] = "DRY RUN -- not executed"
        return out, tokens, 0.0

    for step_idx, (tier, effort) in enumerate(steps):
        model_id = candidate_models[tier]

        # Judge for this tier: swap to Sonnet-as-judge for Opus-tier rows
        # to satisfy B5 (generator and adjudicator in different families).
        if tier == "Opus":
            effective_judge = candidate_models["Sonnet"]
        else:
            effective_judge = judge_model

        # --- Candidate call ---
        cand_key = _sha256(prompt, tier, effort, "candidate")
        cached_cand = cache.get(cand_key)
        if cached_cand:
            response_text = cached_cand["text"]
            tokens["input_tokens"] += cached_cand["input_tokens"]
            tokens["output_tokens"] += cached_cand["output_tokens"]
            logger.debug("Cache hit: candidate %s/%s for %s", tier, effort, prompt_id)
        else:
            response_text, in_tok, out_tok = await _candidate_call(
                client, semaphore, model_id, prompt, effort
            )
            api_calls += 1
            tokens["input_tokens"] += in_tok
            tokens["output_tokens"] += out_tok
            cache.set(cand_key, {"text": response_text, "input_tokens": in_tok, "output_tokens": out_tok})

        # --- Judge call ---
        judge_key = _sha256(prompt, response_text, effective_judge, "judge")
        cached_judge = cache.get(judge_key)
        if cached_judge:
            verdict_dict = cached_judge["verdict"]
            tokens["input_tokens"] += cached_judge["input_tokens"]
            tokens["output_tokens"] += cached_judge["output_tokens"]
            logger.debug("Cache hit: judge %s/%s for %s", tier, effort, prompt_id)
        else:
            verdict_dict, in_tok, out_tok = await _judge_call(
                client, semaphore, effective_judge, prompt, response_text
            )
            api_calls += 1
            tokens["input_tokens"] += in_tok
            tokens["output_tokens"] += out_tok
            cache.set(judge_key, {"verdict": verdict_dict, "input_tokens": in_tok, "output_tokens": out_tok})

        verdict = verdict_dict.get("verdict", "insufficient")
        rationale = verdict_dict.get("rationale", "")
        failure_mode = verdict_dict.get("failure_mode", "none")

        if verdict == "sufficient":
            # This is the cheapest sufficient tier -- mark acceptable
            final_tier = tier
            final_effort = effort
            final_response = response_text
            final_rationale = rationale

            # Add the last insufficient judgment (if any)
            if last_insufficient:
                li_tier, li_effort, li_rationale = last_insufficient
                judgments.append({
                    "route": {"model_tier": li_tier, "effort": li_effort},
                    "verdict": "insufficient",
                    "rationale": li_rationale,
                })

            # Add acceptable judgment
            judgments.append({
                "route": {"model_tier": tier, "effort": effort},
                "verdict": "acceptable",
                "rationale": rationale,
            })

            # Try to get ONE overkill judgment (next step in cascade)
            next_step = _next_cascade_step(tier, effort, max_effort)
            if next_step:
                ok_tier, ok_effort = next_step
                ok_model_id = candidate_models[ok_tier]

                # Judge for overkill step
                if ok_tier == "Opus":
                    ok_judge = candidate_models["Sonnet"]
                else:
                    ok_judge = judge_model

                ok_cand_key = _sha256(prompt, ok_tier, ok_effort, "candidate")
                cached_ok = cache.get(ok_cand_key)
                if cached_ok:
                    ok_response = cached_ok["text"]
                    tokens["input_tokens"] += cached_ok["input_tokens"]
                    tokens["output_tokens"] += cached_ok["output_tokens"]
                else:
                    ok_response, in_tok, out_tok = await _candidate_call(
                        client, semaphore, ok_model_id, prompt, ok_effort
                    )
                    api_calls += 1
                    tokens["input_tokens"] += in_tok
                    tokens["output_tokens"] += out_tok
                    cache.set(ok_cand_key, {"text": ok_response, "input_tokens": in_tok, "output_tokens": out_tok})

                ok_judge_key = _sha256(prompt, ok_response, ok_judge, "judge")
                cached_ok_judge = cache.get(ok_judge_key)
                if cached_ok_judge:
                    ok_verdict_dict = cached_ok_judge["verdict"]
                    tokens["input_tokens"] += cached_ok_judge["input_tokens"]
                    tokens["output_tokens"] += cached_ok_judge["output_tokens"]
                else:
                    ok_verdict_dict, in_tok, out_tok = await _judge_call(
                        client, semaphore, ok_judge, prompt, ok_response
                    )
                    api_calls += 1
                    tokens["input_tokens"] += in_tok
                    tokens["output_tokens"] += out_tok
                    cache.set(ok_judge_key, {"verdict": ok_verdict_dict, "input_tokens": in_tok, "output_tokens": out_tok})

                ok_verdict = ok_verdict_dict.get("verdict", "sufficient")
                ok_rationale = ok_verdict_dict.get("rationale", "")

                if ok_verdict == "sufficient":
                    judgments.append({
                        "route": {"model_tier": ok_tier, "effort": ok_effort},
                        "verdict": "overkill",
                        "rationale": ok_rationale,
                    })
                else:
                    logger.warning(
                        "[%d/%d] %s: overkill step %s/%s judged insufficient -- "
                        "data inconsistency, skipping overkill judgment",
                        row_num, total, prompt_id, ok_tier, ok_effort,
                    )
            break  # Stop cascade -- sufficient found

        else:
            # Insufficient -- track the last one for the final judgment set
            last_insufficient = (tier, effort, rationale)

    else:
        # Exhausted all cascade steps without finding sufficient
        # Use the last (most capable) step as acceptable
        last_tier, last_effort = steps[-1]
        final_tier = last_tier
        final_effort = last_effort
        final_rationale = "Forced acceptable at cascade ceiling -- all steps judged insufficient"
        logger.warning(
            "[%d/%d] %s: all cascade steps insufficient, forcing acceptable at %s/%s",
            row_num, total, prompt_id, final_tier, final_effort,
        )
        if last_insufficient:
            li_tier, li_effort, li_rationale = last_insufficient
            judgments.append({
                "route": {"model_tier": li_tier, "effort": li_effort},
                "verdict": "insufficient",
                "rationale": li_rationale,
            })
        judgments.append({
            "route": {"model_tier": final_tier, "effort": final_effort},
            "verdict": "acceptable",
            "rationale": final_rationale,
        })

    assert final_tier is not None
    assert final_effort is not None

    # Build v3 output row
    generator_model_id = candidate_models[final_tier]
    adjudicator_model_id = judge_model if final_tier != "Opus" else candidate_models["Sonnet"]
    complexity_tier = _derive_complexity_tier(final_tier, final_effort)

    prompt_hash = f"sha256:{_sha256(prompt)}"

    out_row: dict[str, Any] = {
        "prompt_id": row["prompt_id"],
        "family_id": row["family_id"],
        "prompt": prompt,
        "source": row.get("source", "history_curated"),
        "domain": row.get("domain", ""),
        "task_type": row.get("task_type", "factual"),
        "ambiguity": row.get("ambiguity", "clear"),
        "cheapest_acceptable_route": {"model_tier": final_tier, "effort": final_effort},
        "complexity_tier": complexity_tier,
        "route_judgments": judgments,
        "provenance": {
            "generator_model": generator_model_id,
            "generator_model_size": "small" if final_tier == "Haiku" else ("medium" if final_tier == "Sonnet" else "large"),
            "adjudicator_model": adjudicator_model_id,
            "adjudicator_model_size": "large" if adjudicator_model_id == judge_model else "medium",
            "prompt_version_hash": prompt_hash,
            "temperature": 0.0,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "notes": (
            f"Cascade-labeled. Sufficient at {final_tier}/{final_effort}; "
            f"{last_insufficient[0]}/{last_insufficient[1]} insufficient "
            f"({last_insufficient[2][:60]})."
            if last_insufficient
            else f"Cascade-labeled. Sufficient at {final_tier}/{final_effort} (first step)."
        ),
    }

    elapsed = time.monotonic() - t0
    logger.info(
        "[%d/%d] %s | cascade -> %s/%s | calls=%d | tok=%d+%d",
        row_num, total, prompt_id, final_tier, final_effort,
        api_calls, tokens["input_tokens"], tokens["output_tokens"],
    )
    return out_row, tokens, elapsed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def amain(args: argparse.Namespace) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    input_path = Path(args.input)
    output_path = Path(args.output)
    cache_path = Path(args.cache)

    if not input_path.exists():
        logger.error("Input file not found: %s", input_path)
        return 1

    if output_path.exists():
        logger.warning("Output file already exists and will be overwritten: %s", output_path)

    # Guard: never overwrite a chunk.jsonl
    if output_path.name == "chunk.jsonl":
        logger.error("Refusing to write to chunk.jsonl -- use a different output path")
        return 1

    # Load input rows
    rows: list[dict[str, Any]] = []
    with input_path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    if args.limit:
        rows = rows[: args.limit]

    total = len(rows)
    logger.info("Loaded %d rows from %s", total, input_path)

    # Candidate model map
    candidate_models = dict(DEFAULT_CANDIDATE_MODELS)
    if args.candidate_models:
        for mapping in args.candidate_models:
            tier, model_id = mapping.split("=", 1)
            candidate_models[tier] = model_id

    judge_model = args.judge_model
    max_effort = args.max_effort
    semaphore = asyncio.Semaphore(5)

    cache = Cache(cache_path)

    if args.dry_run:
        logger.info("DRY RUN mode -- no API calls will be made")

    client = anthropic.AsyncAnthropic()

    total_tokens: dict[str, int] = {"input_tokens": 0, "output_tokens": 0}
    total_elapsed = 0.0
    output_rows: list[dict[str, Any]] = []

    # Process prompts concurrently (up to semaphore bound),
    # but per-prompt cascades are sequential (enforced inside process_row).
    tasks = [
        process_row(
            row=row,
            client=client,
            semaphore=semaphore,
            cache=cache,
            candidate_models=candidate_models,
            judge_model=judge_model,
            max_effort=max_effort,
            dry_run=args.dry_run,
            row_num=i + 1,
            total=total,
        )
        for i, row in enumerate(rows)
    ]
    results = await asyncio.gather(*tasks)

    for out_row, tok, elapsed in results:
        output_rows.append(out_row)
        total_tokens["input_tokens"] += tok["input_tokens"]
        total_tokens["output_tokens"] += tok["output_tokens"]
        total_elapsed += elapsed

    # Write output JSONL
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as fh:
        for row in output_rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    logger.info("Wrote %d rows to %s", len(output_rows), output_path)

    # Cost report
    # Average across all models -- a rough estimate; actual varies by model
    # We don't track per-call model here, so use blended pricing as approximation.
    # For accurate cost, would need per-call tracking.
    # Rough estimate using Sonnet pricing as midpoint:
    estimated_cost = _price_usd(
        "claude-sonnet-4-6",
        total_tokens["input_tokens"],
        total_tokens["output_tokens"],
    )
    avg_elapsed = total_elapsed / total if total else 0.0

    logger.info("=" * 60)
    logger.info("SMOKE TEST / RUN SUMMARY")
    logger.info("  Rows processed   : %d", total)
    logger.info("  Total input tok  : %d", total_tokens["input_tokens"])
    logger.info("  Total output tok : %d", total_tokens["output_tokens"])
    logger.info("  Estimated cost   : $%.4f (blended Sonnet rate -- actual varies)", estimated_cost)
    logger.info("  Avg wall-clock/row: %.1fs", avg_elapsed)
    logger.info("  Output           : %s", output_path)
    logger.info("=" * 60)

    if not args.dry_run:
        # Run validator
        validator_path = Path(__file__).parent / "validate_corpus.py"
        if validator_path.exists():
            logger.info("Running validator on output...")
            import subprocess
            result = subprocess.run(
                [sys.executable, str(validator_path), str(output_path)],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                logger.info("Validator: %s", result.stdout.strip())
            else:
                logger.error("Validator FAILED:\n%s", result.stderr.strip())
                return 1
        else:
            logger.warning("Validator not found at %s, skipping", validator_path)

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Cascade-label prompt-routing training data via ascending model tiers.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--input", required=True, help="Input JSONL path")
    parser.add_argument("--output", required=True, help="Output JSONL path (never chunk.jsonl)")
    parser.add_argument("--limit", type=int, default=None, help="Process only first N rows")
    parser.add_argument(
        "--judge-model",
        default=DEFAULT_JUDGE_MODEL,
        help=f"Judge model ID (default: {DEFAULT_JUDGE_MODEL})",
    )
    parser.add_argument(
        "--candidate-models",
        nargs="*",
        metavar="TIER=MODEL_ID",
        help="Override candidate models, e.g. Haiku=claude-haiku-4-5-20251001",
    )
    parser.add_argument(
        "--max-effort",
        default="high",
        choices=["none", "low", "medium", "high"],
        help="Cap cascade at this effort level (default: high)",
    )
    parser.add_argument("--dry-run", action="store_true", help="List calls without making them")
    parser.add_argument(
        "--cache",
        default=str(Path(__file__).parent / "cascade_cache.json"),
        help="Cache file path",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(amain(args)))


if __name__ == "__main__":
    main()
