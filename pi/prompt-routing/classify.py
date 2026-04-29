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
        t2       (default) -- T2 LinearSVC only (production)
        ensemble           -- veto ensemble of T2 + LightGBM (experimental)
        lgbm               -- LightGBM only (experimental)
        confgate           -- confidence-gated LGB+T2 delegation (experimental)

Output (single-line JSON, trailing newline):
    {"schema_version":"3.0.0","primary":{"model_tier":"Sonnet","effort":"medium"},
     "candidates":[...],"confidence":0.72}

Exit codes:
    0 -- success
    1 -- error (prints JSON error object to stdout; TS side handles graceful fallback)
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    # Parse optional --classifier flag before the prompt args.
    _args = sys.argv[1:]
    _classifier_mode = "confgate"
    if len(_args) >= 2 and _args[0] == "--classifier":
        _classifier_mode = _args[1]
        _args = _args[2:]

    if _args:
        prompt = " ".join(_args).strip()
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
                {"model_tier": lbl.split("|")[0], "effort": lbl.split("|")[1],
                 "confidence": round(p, 4)}
                for lbl, p in _cands
            ],
            "confidence": round(_conf, 4),
        }
    elif _classifier_mode == "confgate":
        from classifier_confgate import ConfGatedClassifier
        _cg = ConfGatedClassifier()
        result = _cg.predict_route(prompt)
    else:
        # Default: ensemble
        from classifier_ensemble import EnsembleV3Classifier
        _ens = EnsembleV3Classifier()
        result = _ens.predict_route(prompt)
        # Strip ensemble_rule from the wire output (not in schema required fields,
        # but schema uses additionalProperties: false -- omit to keep TS side clean).
        result.pop("ensemble_rule", None)

    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    sys.exit(0)

except Exception as exc:
    error_out = {
        "schema_version": "3.0.0",
        "error": str(exc),
        "fallback": True,
    }
    sys.stdout.write(json.dumps(error_out, ensure_ascii=False) + "\n")
    sys.exit(1)
