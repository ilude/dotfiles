## Finding 1

**Severity:** HIGH
**Evidence:** Automation Plan requires `uv run --project pi/prompt-routing python pi/prompt-routing/classify.py --classifier t2 --prompt-file ...`, but `classify.py` only parses `--classifier`; remaining args are joined into the prompt. `--prompt-file` would be classified literally instead of reading the synthetic file.
**required_fix:** Either add and test a real `--prompt-file` option that reads the file, or change the validation command to pipe/redirect the file into stdin. Add a regression test proving the prompt-file path is not treated as prompt text.

## Finding 2

**Severity:** HIGH
**Evidence:** `classify.py` treats any unknown classifier mode as ensemble (`else: EnsembleV3Classifier()`), while the plan requires invalid CLI/eval mode to exit nonzero. Separately, TS currently invokes `--classifier t2` in `pi/lib/prompt-router/classifier.ts`, but `RouteDecision.classifier_mode` is hardcoded to `confgate` in `extensions/prompt-router.ts`.
**required_fix:** Define one mode source of truth, pass the validated runtime setting to Python, and report the actual mode in decisions/eval. Add tests for invalid mode nonzero and TS/Python mode parity.

## Finding 3

**Severity:** MEDIUM
**Evidence:** Automation Plan’s eval command uses `evaluate.py --config ... --data ... --sequences ... --classifier t2 --json`, but current `evaluate.py` only accepts `--classifier {t2,ensemble}` and has hardcoded `EVAL_DATA`. The repository data listing contains `eval_v3.jsonl` but no `context_sequences_v1.jsonl` yet.
**required_fix:** Make T7 explicitly implement and test `--config`, `--data`, `--sequences`, and `--json` before this command is a gate. Commit/create the sequence fixture or alter the validation contract to match existing data.

## Finding 4

**Severity:** HIGH
**Evidence:** The plan mandates canonical routes `nano|mini|core|large|max`, but Python classifier/eval contracts still emit and score `Haiku|Sonnet|Opus` (`router.py`, `evaluate.py`, schemas/docs). T1 mainly names TS/lib files; T7 defers eval, leaving a window where TS canonical tests pass while Python eval/runtime still use legacy labels.
**required_fix:** Add a Python canonical-route adapter/schema and cross-language vocabulary parity tests in Wave 1. Ensure classifier JSON, eval metrics, and TS adapter all reject unmapped labels and expose legacy names only at the named compatibility boundary.

## Finding 5

**Severity:** MEDIUM
**Evidence:** Privacy constraints say evidence/logs must not include prompt excerpts by default, but `router.py` writes `prompt_excerpt` to `pi/prompt-routing/logs/routing_log.jsonl` whenever `LOG_ROUTING` is enabled. T8 addresses telemetry later, while earlier classifier/eval validations can already execute Python and append excerpts.
**required_fix:** Move Python log privacy hardening before any classifier validation, or run all validation commands with logging disabled. Add a test/evidence check that default classifier execution writes hashes only, not excerpts or raw prompts.
