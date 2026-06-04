"""
classify.py -- CLI wrapper for the v3 route-level prompt router.

Called by the Pi prompt-router extension to classify a prompt.
Reads the prompt from argv[1] or stdin, classifies it, and prints
a single-line JSON object to stdout.

Usage:
    uv run --project ~/.dotfiles/pi/prompt-routing python \
        ~/.dotfiles/pi/prompt-routing/classify.py "your prompt here"
    echo "your prompt" | uv run --project ~/.dotfiles/pi/prompt-routing python \
        ~/.dotfiles/pi/prompt-routing/classify.py
    uv run --project ~/.dotfiles/pi/prompt-routing python \
        ~/.dotfiles/pi/prompt-routing/classify.py --classifier ensemble "your prompt here"
    uv run --project ~/.dotfiles/pi/prompt-routing python \
        ~/.dotfiles/pi/prompt-routing/classify.py --classifier t2 "your prompt here"
    uv run --project ~/.dotfiles/pi/prompt-routing python \
        ~/.dotfiles/pi/prompt-routing/classify.py --classifier lgbm "your prompt here"

Flags:
    --classifier t2|ensemble|lgbm|confgate
        t2       (default) -- T2 LinearSVC only
        ensemble           -- veto ensemble of T2 + LightGBM (experimental)
        lgbm               -- LightGBM only
        confgate           -- confidence-gated LGB+T2 delegation (production)

Output (single-line JSON, trailing newline):
    {"schema_version":"3.0.0","primary":{"model_tier":"core","effort":"medium"},
     "candidates":[...],"confidence":0.72}

Exit codes:
    0 -- success, including safe default fallback when classification fails
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from safety_floor import apply_runtime_safety_floor


def _apply_primary_floor(prompt: str, result: dict) -> dict:
    primary = result.get("primary")
    if not isinstance(primary, dict):
        return result
    tier = primary.get("model_tier")
    effort = primary.get("effort")
    if not isinstance(tier, str) or not isinstance(effort, str):
        return result
    floored_tier, floored_effort = apply_runtime_safety_floor(prompt, f"{tier}|{effort}").split("|")
    result["primary"] = {"model_tier": floored_tier, "effort": floored_effort}
    return result


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Classify a prompt for Pi prompt routing")
    parser.add_argument(
        "--classifier",
        choices=["t2", "ensemble", "lgbm", "confgate"],
        default="t2",
        help="Classifier mode to use (default: t2)",
    )
    parser.add_argument(
        "--prompt-file",
        type=Path,
        help="Read the prompt from a UTF-8 text file instead of argv/stdin",
    )
    parser.add_argument(
        "--artifact-inventory",
        action="store_true",
        help="Validate model artifacts and SHA256 sidecars for the selected classifier",
    )
    parser.add_argument("prompt", nargs="*", help="Prompt text; omitted to read stdin")
    return parser.parse_args()


def _required_artifacts(mode: str) -> list[tuple[Path, Path]]:
    models = Path(__file__).parent / "models"
    t2 = (models / "router_v3.joblib", models / "router_v3.sha256")
    lgbm = (models / "router_v3_lgbm.joblib", models / "router_v3_lgbm.sha256")
    if mode == "t2":
        return [t2]
    if mode == "lgbm":
        return [lgbm]
    return [t2, lgbm]


def _artifact_inventory(mode: str) -> dict:
    artifacts = []
    for model_path, hash_path in _required_artifacts(mode):
        if not model_path.exists():
            raise FileNotFoundError(f"{model_path.name} missing")
        if not hash_path.exists():
            raise FileNotFoundError(f"{hash_path.name} missing")
        expected = hash_path.read_text(encoding="utf-8").strip()
        actual = hashlib.sha256(model_path.read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"{model_path.name} SHA256 mismatch")
        artifacts.append({"model": model_path.name, "sha256": hash_path.name, "hash": actual})
    return {"schema_version": "1.0.0", "classifier": mode, "artifacts": artifacts}


def _safe_default_result(reason: str) -> dict:
    return {
        "schema_version": "3.0.0",
        "primary": {"model_tier": "core", "effort": "medium"},
        "candidates": [
            {"model_tier": "core", "effort": "medium", "confidence": 0.0}
        ],
        "confidence": 0.0,
        "reason": reason,
    }


def _unclassified_log_path() -> Path:
    override = os.environ.get("UNCLASSIFIED_PROMPTS_LOG")
    if override:
        return Path(override)
    return Path(__file__).parent / "logs" / "unclassified_prompts.jsonl"


def _log_unclassified_prompt(prompt: str, mode: str, exc: Exception) -> None:
    try:
        log_path = _unclassified_log_path()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        event = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "prompt": prompt,
            "prompt_hash": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
            "classifier": mode,
            "error": str(exc),
            "error_type": type(exc).__name__,
            "fallback_route": {"model_tier": "core", "effort": "medium"},
        }
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    except Exception:
        pass


prompt = ""
_classifier_mode = "t2"

try:
    _args = _parse_args()
    _classifier_mode = _args.classifier

    if _args.artifact_inventory:
        sys.stdout.write(
            json.dumps(_artifact_inventory(_classifier_mode), ensure_ascii=False) + "\n"
        )
        sys.exit(0)

    if _args.prompt_file is not None:
        prompt = _args.prompt_file.read_text(encoding="utf-8").strip()
    elif _args.prompt:
        prompt = " ".join(_args.prompt).strip()
    else:
        prompt = sys.stdin.read().strip()

    if _classifier_mode == "t2":
        from router import recommend

        result = recommend(prompt)
    elif _classifier_mode == "lgbm":
        import hashlib
        from pathlib import Path

        import joblib

        _lgbm_path = Path(__file__).parent / "models" / "router_v3_lgbm.joblib"
        _lgbm_hash = Path(__file__).parent / "models" / "router_v3_lgbm.sha256"
        _expected = _lgbm_hash.read_text().strip()
        _actual = hashlib.sha256(_lgbm_path.read_bytes()).hexdigest()
        if _actual != _expected:
            raise RuntimeError("router_v3_lgbm.joblib SHA256 mismatch")
        _lgbm_clf = joblib.load(_lgbm_path)
        _lbl, _conf, _cands = _lgbm_clf.predict_single_full(prompt)
        _tier, _effort = _lbl.split("|")
        result = {
            "schema_version": "3.0.0",
            "primary": {"model_tier": _tier, "effort": _effort},
            "candidates": [
                {
                    "model_tier": lbl.split("|")[0],
                    "effort": lbl.split("|")[1],
                    "confidence": round(p, 4),
                }
                for lbl, p in _cands
            ],
            "confidence": round(_conf, 4),
        }
    elif _classifier_mode == "confgate":
        from classifier_confgate import ConfGatedClassifier

        _cg = ConfGatedClassifier()
        result = _cg.predict_route(prompt)
    elif _classifier_mode == "ensemble":
        from classifier_ensemble import EnsembleV3Classifier

        _ens = EnsembleV3Classifier()
        result = _ens.predict_route(prompt)
        # Strip ensemble_rule from the wire output (not in schema required fields,
        # but schema uses additionalProperties: false -- omit to keep TS side clean).
        result.pop("ensemble_rule", None)

    result = _apply_primary_floor(prompt, result)
    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    sys.exit(0)

except Exception as exc:
    _log_unclassified_prompt(prompt, _classifier_mode, exc)
    sys.stdout.write(
        json.dumps(_safe_default_result("classifier_exception"), ensure_ascii=False) + "\n"
    )
    sys.exit(0)
