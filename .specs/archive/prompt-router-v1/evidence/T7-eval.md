# T7 Eval Unification Evidence

## Commands

- `uv run --project pi/prompt-routing pytest pi/prompt-routing/tests/test_evaluate.py` -> exit 0
- `uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --config pi/settings.json --sequences pi/prompt-routing/data/context_sequences_v1.jsonl --json > .specs/prompt-router-v1/evidence/T7-eval-t2.json` -> exit 0
- `uv run --project pi/prompt-routing pytest pi/prompt-routing/tests` -> exit 0
- `for m in t2 lgbm ensemble confgate; do uv run --project pi/prompt-routing python pi/prompt-routing/evaluate.py --classifier "$m" --config pi/settings.json --sequences pi/prompt-routing/data/context_sequences_v1.jsonl --json > ".specs/prompt-router-v1/evidence/T7-eval-$m.json" 2> ".specs/prompt-router-v1/evidence/T7-eval-$m.log"; done` -> all exit 0 (`T7-eval-matrix-status.txt`)
- `python pi/prompt-routing/scripts/shadow_eval.py` -> exit 2 (expected retired-path non-success)
- `uv run --project pi/prompt-routing ruff check pi/prompt-routing/evaluate.py pi/prompt-routing/scripts/shadow_eval.py pi/prompt-routing/tests/test_evaluate.py` -> exit 0

## Notes

- `evaluate.py` now emits runtime-comparable route ordering, sequence results, policy deltas, and retains legacy compatibility aliases.
- `context_sequences_v1.jsonl` covers previous effective routes `mini/core/large/max`, cheap/brief downgrade negatives, and non-continuation lookalikes.
- `scripts/shadow_eval.py` is retired as a non-success stub pointing to the canonical `evaluate.py` command.
