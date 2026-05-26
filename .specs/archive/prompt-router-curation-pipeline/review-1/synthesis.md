---
date: 2026-05-26
status: synthesis-complete
---

# Review: Prompt Router Curation Pipeline MVP

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness and explicitness reviewer | Mandatory standard reviewer for hidden assumptions and weak verification | Assume a fresh `/do-it` session will misread vague commands and invent missing policy | `.specs/prompt-router-curation-pipeline/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Adversarial safety and data-leakage reviewer | Mandatory standard reviewer for security, data leakage, rollback, credential, and archive risks | Assume generated traces can leak private data or dirty tracked state | `.specs/prompt-router-curation-pipeline/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard reviewer for MVP size and reuse | Assume the plan overbuilds before proving source usefulness | `.specs/prompt-router-curation-pipeline/review-1/product-manager.md` |
| python-pro | python-pro | Python packaging and data-pipeline implementation reviewer | The MVP adds Python CLI/modules inside a uv project | Assume hidden dependencies or import paths only work from one CWD | `.specs/prompt-router-curation-pipeline/review-1/python-pro.md` |
| qa-engineer | qa-engineer | Verification realism and regression-coverage reviewer | The plan relies on tests and automation instead of broad human review | Assume tests pass while real pulls produce zero useful candidates | `.specs/prompt-router-curation-pipeline/review-1/qa-engineer.md` |
| devops-pro | devops-pro | Automation and generated-artifact safety reviewer | The plan writes experiment outputs and pulls network data | Assume generated prompt data escapes ignore/path safeguards | `.specs/prompt-router-curation-pipeline/review-1/devops-pro.md` |
| data-contract-reviewer | backend-dev | Data contract and state-transition reviewer | The MVP defines candidate schemas, weak labels, status transitions, and promotion boundaries | Assume ambiguous schema makes later retraining unsafe | `.specs/prompt-router-curation-pipeline/review-1/data-contract-reviewer.md` |

## Standard Reviewer Findings
### reviewer
- High: router scoring contract is ambiguous; the plan says use the local classifier path but does not name v3 ConfGate `classify.py` versus legacy `router.py`.
- High: triage policy is underspecified; statuses exist but thresholds, tie-breakers, and malformed/license handling are not deterministic.
- Medium: dependency policy is hidden; plan mentions dataset-library access but locked project dependencies do not include dataset/HF libraries.
- Medium: output ignore and summary safety are not explicit enough to prevent raw prompt tracking.
- Medium: network smoke can pass with all sources skipped.

### security-reviewer
- High: generated JSONL/cache/summary files can contain sensitive trace data, but no secret/PII scan or ignore verification is mandatory before archive.
- Medium: source license metadata exists, but no allowlist/unknown-license handling blocks auto-accept.
- Medium: network pulls need pinned revisions, byte/time limits, max row/prompt sizes, and schema validation.
- Medium: final gates can pass with zero candidates if everything is skipped or router scoring is unavailable.
- Low: summaries should use hashes/counts by default rather than raw prompt examples.

### product-manager
- High: original review argued the plan might be overbuilt relative to existing scripts, but targeted rebuttal resolved that multi-source bounded ingestion should remain because the PRD requires it.
- High: plan defers retraining but the problem is proving source adaptation; fix by narrowing success claims to ingestion/triage usefulness, not model improvement.
- Medium: requiring three external sources multiplies schema edge cases; targeted rebuttal narrowed this to three fixture-backed source shapes plus one real network pull.
- Medium: `auto_accept_candidate` name can overstate weak-label trust.
- Low: validation duplication can be tightened by making final gates precise.

## Additional Expert Findings
### python-pro
- High: module layout is ambiguous in a `package = false` project; `curation/` package plus file-path CLI can break imports.
- High: dependency policy must be explicit; `uv sync --locked` cannot support hidden imports.
- Medium: unscoped lint command can resolve against the wrong project.
- Medium: output paths are CWD-sensitive.

### qa-engineer
- High: tests can pass from synthetic fixtures while all real external pulls fail.
- High: fixtures must mirror real source schemas, not hand-shaped normalized rows.
- Medium: pytest `-k` selectors can collect zero tests if names do not match.
- High: output confinement checks miss traversal, symlink escapes, and writes outside experiment dir.
- Medium: negative fixtures must ensure malformed/ambiguous/classifier-failure rows are not auto-accepted.

### devops-pro
- High: no explicit ignore coverage exists for `pi/prompt-routing/experiments/curation/`.
- High: `--output-dir` must be canonicalized and refused unless under the allowed experiment root.
- Medium: fixture and network validation must be split, with network-blocked not counted as success.
- Medium: summaries must avoid full prompt text.
- Medium: cleanup should be non-destructive and limited to validated run directories.

### data-contract-reviewer
- High: `accepted_route` semantics blur weak prediction versus promotable label.
- High: status transitions/state machine are undefined.
- Medium: deterministic ID algorithm is missing.
- Medium: license fields need source URL/revision/row ID and unknown-license rules.
- Medium: schema/run manifest needs schema version, pipeline version, router version/config, source revisions, limits, and config hash.

## Suggested Additional Reviewers
- python-pro -- relevant because the plan creates Python CLI/modules inside a uv project; focus on imports, dependency policy, and commands.
- qa-engineer -- relevant because the plan's value depends on automated validation replacing broad human review; focus on false-positive gates.
- devops-pro -- relevant because the plan pulls network data and writes generated artifacts; focus on path safety, gitignore, and cleanup.
- backend-dev as data-contract reviewer -- relevant because future retraining depends on stable candidate schema and status semantics.

## Bugs (must fix before execution)
1. Specify the exact router scoring interface and expected weak-label schema.
2. Define deterministic triage rules, reason codes, `accepted_route`/`proposed_route` semantics, and status transitions.
3. Make the dependency and network pull policy explicit under locked uv constraints.
4. Add output ignore, path confinement, summary redaction, and generated-artifact safety gates.
5. Require three real-source-shape fixtures and at least one successful bounded public-source network pull, or classify the run as blocked/degraded rather than complete.
6. Add schema/run manifest details: schema version, deterministic IDs, source URL/revision/row ID, license policy, router version/config, limits, and config hash.

## Hardening
1. Require raw fixtures captured from actual source shapes rather than hand-shaped normalized rows.
2. Require tests for oversized records, prompt length limits, malformed rows, classifier failure, low-confidence rows, and ambiguous/security/refactor/debug prompts.
3. Make pytest commands robust by using named test files or collection-count checks rather than selectors that might collect zero tests.
4. Add a safe cleanup/list command limited to validated run directories under the experiment root.
5. Clarify lint command and working-directory expectations.

## Simpler Alternatives / Scope Reductions
1. The initial one-source adapter alternative was rejected after targeted rebuttal because the PRD requires multiple external sources and QA/DevOps gates need multiple source shapes to avoid false confidence.
2. Keep the implementation small by requiring a single top-level script/helper-module layout, stdlib HTTP/file handling where practical, and no retraining/promotion/LLM judging in MVP.
3. Rename or constrain `auto_accept_candidate` semantics so automation means candidate triage only, not production-ready labels.

## Automation Readiness
- Agent-runnable operational steps: mostly present, but need exact router command, source fixture/network gates, path confinement, cleanup, and robust test commands.
- Credential/auth flow clarity: public sources only; gated sources must be skipped/deferred, not prompt for credentials.
- Evidence and archive gates: need generated artifact ignore verification, secret/PII scan, network-source count thresholds, manifest checks, and production artifact unchanged checks.
- Manual-only steps and justification: manual gates are not required if the above automated safety checks are added. Risk classification remains low.
- Execution checklist: present and consistent now, but edits must preserve one item per task/gate/final gate and add `Execution Status`.

## Contested or Dismissed Findings
1. Product-manager's initial recommendation to shrink to one source was dismissed after targeted rebuttal. Both product-manager and QA agreed the PRD requires multi-source ingestion, but the plan should clarify three fixture-backed source shapes plus one real bounded network pull.
2. Broad retraining metrics were not promoted to must-fix for MVP because the user's explicit scope says do not retrain. The plan should narrow success claims to curation output usefulness instead.

## Verification Notes
1. Ambiguous router contract confirmed from the plan: T3 says use the "local classifier path already used by prompt routing" but never names `classify.py` or schema fields.
2. Triage underspecification confirmed from the plan: T4 lists statuses but no thresholds, ordered rules, reason codes, or state transition contract.
3. Dependency gap confirmed from `pi/prompt-routing/pyproject.toml`: dependencies do not include `datasets`, `huggingface_hub`, `requests`, or `httpx`; `package = false` constrains module layout.
4. Ignore gap confirmed from `.gitignore`: prompt-routing logs/cache are ignored, but no explicit ignore rule covers `pi/prompt-routing/experiments/curation/**`.
5. Network false-pass risk confirmed from Success Criteria and V3: network smoke can exit 0 with skipped unavailable sources.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/prompt-router-curation-pipeline/review-1/reviewer.md` | read | artifact usable |
| security-reviewer | `.specs/prompt-router-curation-pipeline/review-1/security-reviewer.md` | read | artifact usable |
| product-manager | `.specs/prompt-router-curation-pipeline/review-1/product-manager.md` | read | artifact usable |
| python-pro | `.specs/prompt-router-curation-pipeline/review-1/python-pro.md` | read | artifact usable |
| qa-engineer | `.specs/prompt-router-curation-pipeline/review-1/qa-engineer.md` | read | artifact usable |
| devops-pro | `.specs/prompt-router-curation-pipeline/review-1/devops-pro.md` | read | artifact usable |
| data-contract-reviewer | `.specs/prompt-router-curation-pipeline/review-1/data-contract-reviewer.md` | read | artifact usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | about 2 minutes | 7/7 reviewers succeeded; per-reviewer timing unavailable |
| Artifact reads | about 1 minute | all expected reviewer artifacts read |
| Recovery calls | not run | no artifact recovery needed |
| Verification | about 2 minutes | plan, pyproject, gitignore, and rebuttal outputs checked |
| Synthesis | about 1 minute | synthesis written to `.specs/prompt-router-curation-pipeline/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/prompt-router-curation-pipeline/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `.specs/prompt-router-curation-pipeline/review-1/known-blocker-fixes.md` (no prior blockers)
- Section integrity check: passed after initial fixes and after standalone-readiness repair pass 1
- Standalone-readiness result: STANDALONE READY
- Repair passes used: 1

## Review Artifact
Wrote full synthesis to: `.specs/prompt-router-curation-pipeline/review-1/synthesis.md`

## Overall Verdict
**Ready to execute after auto-applied plan fixes**

## Recommended Next Step
- Execute via `/do-it .specs/prompt-router-curation-pipeline/plan.md`.
