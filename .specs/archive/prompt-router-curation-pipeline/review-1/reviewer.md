---
reviewer: completeness-explicitness-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "ambiguous-router-contract"
  confidence: high
  evidence: "Plan T3 says call \"the local classifier path already used by prompt routing\" and accepts classifier failure. `pi/prompt-routing/AGENTS.md` says v3 ConfGate via `classify.py` is live, while legacy `router.py route()` is retained only as fallback. The plan never names which interface/output schema to call."
  required_fix: "Specify the exact scoring interface, command/import, expected output schema fields, and fallback behavior. State whether curation uses v3 ConfGate `classify.py`, legacy `router.py`, or both, and add tests that fail if the wrong router path is used."
- severity: high
  category: "underspecified-triage"
  confidence: high
  evidence: "T4 requires statuses `auto_accept_candidate`, `holdout_candidate`, `needs_review`, and `reject`, but gives no deterministic thresholds for confidence, disagreement, under-routing risk, holdout selection, malformed data, or source/license risk. /do-it cannot implement consistent triage from these instructions without inventing policy."
  required_fix: "Add a concrete triage decision table: ordered rules, thresholds, tie-breakers, holdout sampling policy, malformed/license handling, and required reason codes. Include fixture examples for each rule and expected status."
- severity: medium
  category: "hidden-dependencies"
  confidence: high
  evidence: "The plan names Hugging Face-style sources and dataset-library access, but `pi/prompt-routing/pyproject.toml` dependencies do not include `datasets`, `huggingface_hub`, or HTTP client choices. Acceptance allows network pullers, but does not say whether adding dependencies/lockfile changes is allowed or how to avoid them."
  required_fix: "Declare the permitted pull mechanism and dependency policy. Either require stdlib/HTTP-only pullers with exact URLs/formats, or explicitly allow adding named dependencies and updating `uv.lock`, with validation for `uv sync --locked` after lock updates."
- severity: medium
  category: "weak-safety-verification"
  confidence: medium
  evidence: "Validation checks only `git status` for production corpus/model paths after runs. Generated raw prompts are written under the repo (`pi/prompt-routing/experiments/curation/...`) and may contain sensitive/user data; the plan only says they \"should be ignored\" and permits some summaries/configs to be tracked."
  required_fix: "Make ignore rules explicit before any run: exact `.gitignore` entries, which files may be tracked, and a validation command proving generated JSONL/raw/cache files are ignored/untracked. Require summaries to omit raw prompts or include only hashes/examples approved by policy."
- severity: medium
  category: "non-deterministic-network-validation"
  confidence: medium
  evidence: "Success criteria allow network smoke to exit 0 with skipped unavailable sources, and T2 tests may use local fixtures. This can pass even if all real external pulls are skipped or broken, contradicting the objective to pull bounded samples from multiple external sources."
  required_fix: "Separate offline fixture validation from network integration validation. Require a report field listing attempted sources and real candidate counts, and set a minimum real-source success threshold for network smoke or explicitly mark the plan incomplete/degraded when no public source produces candidates."
