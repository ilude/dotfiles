"""
validate_corpus.py -- Validate a JSON or JSONL corpus file against the v3 schema.

Loads every row and checks:
  - All required fields are present and correctly typed.
  - cheapest_acceptable_route has a valid model_tier and effort.
  - source is one of the allowed enum values.
  - If route_judgments is present, the cheapest acceptable verdict matches
    cheapest_acceptable_route (schema section 2.3 invariant).
  - Synthetic rows (source starts with 'synthetic_') have a complete provenance
    block: generator_model != adjudicator_model, temperature == 0.
  - family_id is populated on every row.

Exit 0 on success, nonzero on any validation failure.

Usage:
    python tools/validate_corpus.py data/training_corpus_v3.example.json
    python tools/validate_corpus.py data/seed_route_labels.jsonl
"""

import json
import sys
from pathlib import Path
from typing import Any

VALID_MODEL_TIERS = {"Haiku", "Sonnet", "Opus"}
VALID_EFFORT_TIERS = {"none", "low", "medium", "high"}
VALID_SOURCES = {
    "seed_v2",
    "history_curated",
    "synthetic_small",
    "synthetic_medium",
    "synthetic_large",
    "external_routellm",
    "ood_handwritten",
}
VALID_TASK_TYPES = {
    "factual",
    "mechanical_edit",
    "code_write",
    "code_debug",
    "code_review",
    "explain",
    "plan",
    "design",
    "analysis",
    "rewrite",
    "chat",
}
VALID_AMBIGUITY = {"clear", "borderline", "ambiguous"}
VALID_COMPLEXITY_TIERS = {"low", "mid", "high"}

# Cost ordering for route comparison (lower index = cheaper)
_MODEL_ORDER = ["Haiku", "Sonnet", "Opus"]
_EFFORT_ORDER = ["none", "low", "medium", "high"]


def _route_cost(route: dict[str, str]) -> tuple[int, int]:
    m = _MODEL_ORDER.index(route["model_tier"])
    e = _EFFORT_ORDER.index(route["effort"])
    return (m, e)


def _validate_route(route: Any, field_name: str) -> list[str]:
    errors: list[str] = []
    if not isinstance(route, dict):
        errors.append(f"{field_name}: expected object, got {type(route).__name__}")
        return errors
    mt = route.get("model_tier")
    ef = route.get("effort")
    if mt not in VALID_MODEL_TIERS:
        errors.append(
            f"{field_name}.model_tier: invalid value {mt!r}; "
            f"must be one of {sorted(VALID_MODEL_TIERS)}"
        )
    if ef not in VALID_EFFORT_TIERS:
        errors.append(
            f"{field_name}.effort: invalid value {ef!r}; "
            f"must be one of {sorted(VALID_EFFORT_TIERS)}"
        )
    return errors


def _validate_provenance(prov: Any, row_id: str) -> list[str]:
    errors: list[str] = []
    if not isinstance(prov, dict):
        errors.append(f"row {row_id}: provenance must be an object")
        return errors
    required_prov = [
        "generator_model",
        "generator_model_size",
        "adjudicator_model",
        "adjudicator_model_size",
        "prompt_version_hash",
        "temperature",
    ]
    for field in required_prov:
        if field not in prov:
            errors.append(f"row {row_id}: provenance missing required field '{field}'")

    if errors:
        return errors

    gen = prov.get("generator_model")
    adj = prov.get("adjudicator_model")
    if gen and adj:
        # Check same-family: extract family prefix (e.g. 'claude-haiku' vs 'claude-opus')
        # Family is determined by the model tier name embedded in the model string.
        gen_family = _extract_family(gen)
        adj_family = _extract_family(adj)
        if gen_family and adj_family and gen_family == adj_family:
            errors.append(
                f"row {row_id}: B5 violation -- generator_model {gen!r} and "
                f"adjudicator_model {adj!r} are in the same model family"
            )

    temp = prov.get("temperature")
    if temp is not None and float(temp) != 0.0:
        errors.append(
            f"row {row_id}: H7 violation -- provenance.temperature must be 0, got {temp!r}"
        )

    if "prompt_version_hash" in prov:
        ph = prov["prompt_version_hash"]
        if not isinstance(ph, str) or not ph.strip():
            errors.append(
                f"row {row_id}: provenance.prompt_version_hash must be a non-empty string"
            )

    return errors


def _extract_family(model_str: str) -> str | None:
    """Return a normalized family token from a model identifier string."""
    s = model_str.lower()
    if "haiku" in s:
        return "haiku"
    if "sonnet" in s:
        return "sonnet"
    if "opus" in s:
        return "opus"
    if "gpt-4" in s or "gpt4" in s:
        return "gpt4"
    if "gpt-3" in s or "gpt3" in s:
        return "gpt3"
    if "gemini" in s:
        return "gemini"
    if "mistral" in s or "mixtral" in s:
        return "mistral"
    if model_str.strip().lower() == "human":
        return None
    return model_str.lower()


def _validate_route_judgments(
    judgments: Any,
    cheapest_route: dict[str, str],
    row_id: str,
) -> list[str]:
    errors: list[str] = []
    if not isinstance(judgments, list):
        errors.append(f"row {row_id}: route_judgments must be an array")
        return errors

    VALID_VERDICTS = {"acceptable", "insufficient", "overkill"}
    acceptable_routes: list[dict[str, str]] = []

    for i, j in enumerate(judgments):
        if not isinstance(j, dict):
            errors.append(f"row {row_id}: route_judgments[{i}] must be an object")
            continue
        if "route" not in j:
            errors.append(f"row {row_id}: route_judgments[{i}] missing 'route'")
        else:
            errors.extend(_validate_route(j["route"], f"row {row_id}: route_judgments[{i}].route"))
        verdict = j.get("verdict")
        if verdict not in VALID_VERDICTS:
            errors.append(
                f"row {row_id}: route_judgments[{i}].verdict {verdict!r} "
                f"must be one of {sorted(VALID_VERDICTS)}"
            )
        if verdict == "acceptable" and "route" in j:
            rt = j["route"]
            if (
                rt.get("model_tier") in VALID_MODEL_TIERS
                and rt.get("effort") in VALID_EFFORT_TIERS
            ):
                acceptable_routes.append(rt)

    if errors:
        return errors

    if not acceptable_routes:
        return errors

    # The cheapest acceptable verdict must match cheapest_acceptable_route
    try:
        cheapest_acceptable = min(acceptable_routes, key=_route_cost)
    except (KeyError, ValueError):
        return errors

    if _route_cost(cheapest_acceptable) != _route_cost(cheapest_route):
        errors.append(
            f"row {row_id}: route_judgments invariant violated -- "
            f"cheapest acceptable judgment is "
            f"({cheapest_acceptable.get('model_tier')}, {cheapest_acceptable.get('effort')}) "
            f"but cheapest_acceptable_route is "
            f"({cheapest_route.get('model_tier')}, {cheapest_route.get('effort')})"
        )

    return errors


def validate_row(row: Any, row_id: str) -> list[str]:
    """Return a list of error strings for a single row. Empty list means valid."""
    errors: list[str] = []

    if not isinstance(row, dict):
        return [f"row {row_id}: expected object, got {type(row).__name__}"]

    # Required fields
    required = [
        "prompt_id",
        "family_id",
        "prompt",
        "source",
        "domain",
        "task_type",
        "ambiguity",
        "cheapest_acceptable_route",
    ]
    for field in required:
        if field not in row:
            errors.append(f"row {row_id}: missing required field '{field}'")

    if errors:
        return errors

    # prompt_id
    if not isinstance(row["prompt_id"], str) or not row["prompt_id"].strip():
        errors.append(f"row {row_id}: prompt_id must be a non-empty string")

    # family_id
    if not isinstance(row["family_id"], str) or not row["family_id"].strip():
        errors.append(f"row {row_id}: family_id must be a non-empty string")

    # prompt
    if not isinstance(row["prompt"], str) or not row["prompt"].strip():
        errors.append(f"row {row_id}: prompt must be a non-empty string")

    # source
    src = row["source"]
    if src not in VALID_SOURCES:
        errors.append(
            f"row {row_id}: source {src!r} is not valid; "
            f"must be one of {sorted(VALID_SOURCES)}"
        )

    # domain
    if not isinstance(row["domain"], str) or not row["domain"].strip():
        errors.append(f"row {row_id}: domain must be a non-empty string")

    # task_type
    tt = row["task_type"]
    if tt not in VALID_TASK_TYPES:
        errors.append(
            f"row {row_id}: task_type {tt!r} is not valid; "
            f"must be one of {sorted(VALID_TASK_TYPES)}"
        )

    # ambiguity
    amb = row["ambiguity"]
    if amb not in VALID_AMBIGUITY:
        errors.append(
            f"row {row_id}: ambiguity {amb!r} is not valid; "
            f"must be one of {sorted(VALID_AMBIGUITY)}"
        )

    # cheapest_acceptable_route
    car = row["cheapest_acceptable_route"]
    errors.extend(_validate_route(car, f"row {row_id}: cheapest_acceptable_route"))

    # route_judgments (optional)
    if "route_judgments" in row and not errors:
        errors.extend(
            _validate_route_judgments(row["route_judgments"], car, row_id)
        )

    # complexity_tier (optional)
    if "complexity_tier" in row:
        ct = row["complexity_tier"]
        if ct not in VALID_COMPLEXITY_TIERS:
            errors.append(
                f"row {row_id}: complexity_tier {ct!r} must be one of "
                f"{sorted(VALID_COMPLEXITY_TIERS)}"
            )

    # provenance (required for synthetic rows, validated if present)
    if isinstance(src, str) and src.startswith("synthetic_"):
        if "provenance" not in row:
            errors.append(
                f"row {row_id}: synthetic row (source={src!r}) "
                f"must have a provenance block"
            )
        else:
            errors.extend(_validate_provenance(row["provenance"], row_id))
    elif "provenance" in row:
        errors.extend(_validate_provenance(row["provenance"], row_id))

    # labels (optional convenience object -- validate if present)
    if "labels" in row:
        errors.extend(_validate_labels(row["labels"], car, row_id))

    return errors


def _validate_labels(
    labels: Any,
    top_level_car: dict[str, str],
    row_id: str,
) -> list[str]:
    errors: list[str] = []
    if not isinstance(labels, dict):
        errors.append(f"row {row_id}: labels must be an object")
        return errors
    if "cheapest_acceptable_route" not in labels:
        errors.append(
            f"row {row_id}: labels.cheapest_acceptable_route is required when labels is present"
        )
        return errors
    lcar = labels["cheapest_acceptable_route"]
    route_errors = _validate_route(lcar, f"row {row_id}: labels.cheapest_acceptable_route")
    if route_errors:
        errors.extend(route_errors)
        return errors
    if (
        lcar.get("model_tier") != top_level_car.get("model_tier")
        or lcar.get("effort") != top_level_car.get("effort")
    ):
        errors.append(
            f"row {row_id}: labels.cheapest_acceptable_route "
            f"({lcar.get('model_tier')}, {lcar.get('effort')}) "
            f"does not match top-level cheapest_acceptable_route "
            f"({top_level_car.get('model_tier')}, {top_level_car.get('effort')})"
        )
    return errors


def load_rows(path: Path) -> list[Any]:
    """Load JSON or JSONL. Returns a list of parsed objects."""
    text = path.read_text(encoding="utf-8")
    stripped = text.strip()

    # Try JSONL first: if first non-blank line starts with '{' and file has multiple lines
    lines = [ln for ln in stripped.splitlines() if ln.strip()]
    if not lines:
        return []

    if len(lines) > 1 and lines[0].lstrip().startswith("{"):
        rows = []
        for i, line in enumerate(lines, 1):
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"ERROR: line {i}: {e}", file=sys.stderr)
                sys.exit(1)
        return rows

    # Fallback: parse as a single JSON document
    try:
        doc = json.loads(stripped)
    except json.JSONDecodeError as e:
        print(f"ERROR: failed to parse JSON: {e}", file=sys.stderr)
        sys.exit(1)

    if isinstance(doc, list):
        return doc
    return [doc]


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python tools/validate_corpus.py <corpus_file.json|.jsonl>", file=sys.stderr)
        sys.exit(1)

    corpus_path = Path(sys.argv[1])
    if not corpus_path.exists():
        print(f"ERROR: file not found: {corpus_path}", file=sys.stderr)
        sys.exit(1)

    rows = load_rows(corpus_path)
    if not rows:
        print("ERROR: no rows found in corpus file", file=sys.stderr)
        sys.exit(1)

    all_errors: list[tuple[str, list[str]]] = []
    for i, row in enumerate(rows):
        row_id = str(i + 1)
        if isinstance(row, dict):
            row_id = row.get("prompt_id", str(i + 1))
        errs = validate_row(row, str(row_id))
        if errs:
            all_errors.append((str(row_id), errs))

    if all_errors:
        total = sum(len(e) for _, e in all_errors)
        print(
            f"INVALID: {len(all_errors)} row(s) failed validation "
            f"({total} error(s) across {len(rows)} row(s))",
            file=sys.stderr,
        )
        for row_id, errs in all_errors:
            for err in errs:
                print(f"  {err}", file=sys.stderr)
        sys.exit(1)

    print(f"OK: {len(rows)} row(s) passed validation ({corpus_path})")


if __name__ == "__main__":
    main()
