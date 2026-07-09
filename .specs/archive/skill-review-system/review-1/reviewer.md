---
reviewer: completeness-explicitness-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "process defect"
  confidence: high
  evidence: "Severity rationale: the plan makes Fable-5 comparison archive-blocking but does not give an executable targeting contract. Evidence: plan.md:35-38 requires GPT-5.5 and Fable-5 and says to implement/configure targeting if unavailable; plan.md:384-385 says run GPT-5.5/Fable-5 subagent tasks; plan.md:493 only says use Pi `subagent` with generated JSON. No provider/model IDs, subagent invocation shape, or preflight check are specified."
  required_fix: "Add a preflight task before implementation/dogfood that verifies exact Pi model IDs and subagent targeting syntax for GPT-5.5 and Fable-5, with expected command/tool payload examples. If missing, add a bounded implementation task naming the file(s) to change and validation command; do not leave it as open-ended work inside T6."
- severity: medium
  category: "process defect"
  confidence: high
  evidence: "Severity rationale: a fresh executor can run the wrong validation and get misleading results. Evidence: plan.md:286 uses `cd pi && pnpm test skill-review.test.ts -- --runInBand`, but repo instructions explicitly say Pi Vitest file filters must be passed directly and not after `--`. The same acceptance criterion also depends on tests that are not added until T5, weakening V2."
  required_fix: "Replace the command with `cd pi && pnpm test skill-review.test.ts` or a real helper-specific test available in that wave. Move artifact-renderer acceptance that depends on `skill-review.test.ts` to after T5, or require T3 to add its own minimal tests before V2."
- severity: medium
  category: "process defect"
  confidence: medium
  evidence: "Severity rationale: the user-facing dogfood gate is not safely executable from the plan alone. Evidence: plan.md:113 and plan.md:381 say run Pi slash command `/skill-review` from repo root, while pi/extensions/README.md says top-level extension files are auto-discovered at startup. The plan never says how to reload/restart Pi after adding `pi/extensions/skill-review.ts` or how `/do-it` should invoke the command in-session."
  required_fix: "Add explicit dogfood procedure: restart/reload Pi or launch a fresh Pi instance with extensions loaded, confirm `skill-review` is registered, then invoke `/skill-review` from repo root. Include fallback instructions if the active /do-it session cannot call newly added slash commands without restart."
- severity: medium
  category: "substantive defect"
  confidence: high
  evidence: "Severity rationale: model-comparison validation can pass with malformed JSON or schema drift. Evidence: plan.md:397-398 checks only file existence for `gpt-review.json`, `fable-review.json`, `comparison.md`, and `decision-ledger.json`; plan.md:443 says to inspect files. There is no required JSON parse, schema validation against `comparison-template.json`, or deterministic comparison command."
  required_fix: "Require a deterministic validator/helper that parses `gpt-review.json`, `fable-review.json`, and `decision-ledger.json`, validates them against the declared schema/template, and fails on missing required fields or malformed JSON. Use that command in T6/V5/archive gates instead of existence/inspection only."
- severity: medium
  category: "substantive defect"
  confidence: medium
  evidence: "Severity rationale: write-boundary requirements are ambiguous enough to allow artifacts in the wrong tree. Evidence: plan.md:30 says generated output location is `.tmp/skill-review/{timestamp}/` only, but plan.md:314 says relative to `repo root/cwd`, conflating two different bases. T6/V5 check artifacts and git status, but do not require resolving repo root, rejecting symlink escapes, or hashing live source skill roots before/after dogfood."
  required_fix: "Define output base as the git repo root only, not cwd. Add tests for non-root cwd and symlink/path escape rejection. Add T6/V5 live-corpus before/after checks for `pi/skills/**/SKILL.md` and user skill roots, not just git status, because user skill files may be outside git."
