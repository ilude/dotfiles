---
created: 2026-09-02
status: completed
completed: 2026-09-02
---

# Separate actionable tool failures from expected outcomes

## Objective

Pi's existing tool-failure classifier exposes additive, stable outcomes that distinguish ordinary command nonzero exits from actionable tool failures, recurring Pi-owned path, edit, and subagent caller rejections receive consistent classification and deterministic diagnostics at their owning boundaries, and the hidden `subagent_coordinate` compatibility alias remains supported because current resumed-session contracts depend on it.

## Completion Evidence

- Evidence: Focused classifier fixtures assign representative command nonzero, caller-validation, policy, path, edit-match, timeout, cancellation, protocol, infrastructure, and unknown results to explicit additive outcomes and compute separate expected-command and actionable-failure totals while preserving existing `isError`, `classification`, `errorClass`, `contract`, candidate IDs, and canonical session records; focused workspace, tree-admission, and repeated-result tests prove bounded Pi-owned diagnostics without weakening containment or exact-match safety; resumed-session compatibility tests keep the hidden `subagent_coordinate` alias executable but undiscoverable; the affected Pi typecheck and focused suites pass.
- Fails when: Command nonzero results enter the actionable subtotal, an existing classifier fingerprint or JSONL reader becomes incompatible, trace data is treated as canonical session authority, diagnostics infer or mutate a target, workspace or safety enforcement is relaxed, `subagent_coordinate` becomes discoverable or unavailable to a supported resumed call, or validation covers only prose or source spelling.

## Boundaries

- In scope: Pi-owned TypeScript under `pi/` for the existing tool-failure classifier and `/find-fails` guidance, governed subagent workspace and tree-admission diagnostics, unchanged-repeat handling for native edit failures after they are returned, hidden legacy subagent compatibility, affected Pi contracts, and the root changelog.
- Out of scope: Upstream Pi native-tool result schemas or implementations, adding outcomes to canonical `session_entries`, trace-derived decision authority, provider behavior, non-Pi clients, fuzzy edit application, automatic path correction, automatic retry, safety-policy weakening, analytics persistence or retention, and unrelated Herdr or network reliability work.
- Preserve: Existing `isError` behavior and readers, append-only JSONL authority, transcript/metrics trust boundaries and redaction, exact edit matching, canonical workspace containment, path-specific instruction deferral, current role-specific subagent tools, historical compatibility that repository evidence shows is still supported, and default `/do-it` merge-and-cleanup closeout.
- Assumptions: Existing canonical session results provide enough tool name, `isError`, and bounded result text for the classifier to derive outcomes; when evidence is insufficient the additive outcome remains explicitly unclassified rather than inferred.

## Tasks

- [x] **T1: Prove and add the normalized outcome contract**
  - Files: `pi/lib/tool-failure-classifier.ts`, `pi/extensions/tool-failure-triage.ts`, `pi/tests/tool-failure-decisions.test.ts`, `pi/tests/tool-failure-store.test.ts`, `pi/tests/log-analytics-parity.test.ts`, `pi/tests/tool-failure-command.test.ts`, `pi/skills/pi-extension/references/contracts/observability.md`
  - Change: Use `classifyFailure` as the single normalization mechanism and first add one representative executable slice that separates shell test/command nonzero from an internal infrastructure failure. Add optional `outcome` and `actionability` fields to each `ClassifiedFailure`, derived from an explicit mapping over the existing `errorClass`/`contract` result; preserve scan `schemaVersion: 1`, `FINGERPRINT_VERSION`, candidate ID material, and every legacy field. Outcomes cover command nonzero, caller validation, policy rejection, target/path rejection, timeout, cancellation, protocol failure, infrastructure failure, and unclassified failure; only infrastructure/protocol defects and explicitly mapped caller-friction candidates enter the actionable subtotal, while unknowns remain separately unclassified. Add a pure aggregate over deduplicated scan observations for separate expected-command, actionable, expected-other, and unclassified totals, and update `/find-fails` instructions to use those semantics when querying canonical `session_entries`. Run the shared TypeScript typecheck after the representative slice before expanding the mapping. Do not persist the derived fields to canonical session or trace JSONL and do not add a second classifier or store.
  - Done when: Fixture scans expose the additive fields and separate totals, command nonzero is excluded from actionable failures, unknown records remain unclassified, and legacy scan fields, fingerprints, candidate IDs, and `isError` fixtures remain unchanged.
  - Verify: `cd pi && pnpm test tool-failure-decisions.test.ts tool-failure-store.test.ts log-analytics-parity.test.ts tool-failure-command.test.ts && pnpm run typecheck`

- [x] **T2: Make recurring Pi-owned caller rejections actionable without correction**
  - Files: `pi/extensions/subagent/workspace-policy.ts`, `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/tree-runtime.ts`, `pi/extensions/damage-control.ts`, `pi/lib/tool-failure-classifier.ts`, `pi/tests/workspace-policy.test.ts`, `pi/tests/subagent-workspace-integration.test.ts`, `pi/tests/subagent-tree-runtime.test.ts`, `pi/tests/subagent.test.ts`, `pi/tests/repeated-tool-loop.test.ts`, `pi/skills/pi-extension/references/contracts/safe-file-mutation.md`, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`
  - Change: At existing Pi-owned rejection owners, make bounded diagnostics consistent with T1 outcomes: workspace policy retains supplied/resolved/root identities; subagent pre-spawn validation reports deterministic task, catalog, and role alternatives; the tree broker reports capacity or admission cutoff distinctly from malformed requests; and the existing repeated-tool guard recognizes an unchanged native exact-match/non-unique edit error without altering its original result or retrying it. Reuse current canonicalization, classifier, broker, and validators; do not intercept or rewrite native edit errors, add a second preflight service, search the filesystem, fuzzy-match, infer a correction, or retry. Add focused regression cases for absolute Windows paths, foreign workspaces/tasks, unavailable agents, admission capacity, unchanged repeated edit failures, and preservation of exact safety rejections.
  - Done when: Each covered Pi-owned rejection names the violated invariant and valid bounded alternatives only when deterministically known, capacity exhaustion is distinct from caller misuse, invalid subagent requests still fail before spawn, absolute paths are never joined to the session cwd, repeated native edit failures retain their original content and leave files unchanged, and no test permits workspace escape or fuzzy mutation.
  - Verify: `cd pi && pnpm test workspace-policy.test.ts subagent-workspace-integration.test.ts subagent-tree-runtime.test.ts subagent.test.ts repeated-tool-loop.test.ts && pnpm run typecheck`

- [x] **T3: Preserve resumed coordinator compatibility and validate integration**
  - Files: `pi/extensions/subagent/index.ts`, `pi/extensions/subagent/contracts.ts`, `pi/extensions/tool-search.ts`, `pi/tests/subagent.test.ts`, `pi/tests/tool-search.test.ts`, `pi/tests/tool-visibility.test.ts`, `pi/tests/fable.test.ts`, `pi/skills/pi-extension/references/contracts/tool-discovery.md`, `pi/skills/pi-extension/references/contracts/subagents-and-tasks.md`, `pi/README.md`, `CHANGELOG.md`
  - Change: Preserve `subagent_coordinate` as a registered but hidden compatibility alias because the current discovery contract and adapter tests establish supported historical resumed calls. Add an executable compatibility fixture that submits the historical argument shape through the alias and reaches the same bounded execution/admission seam as its current replacement; keep it absent from active tools, `tool_search`, and current guidance. Update operator-facing documentation and changelog for normalized failure-report semantics and the confirmed compatibility policy, then validate fixture totals containing duplicate records, expected command nonzero, actionable failure, expected non-command rejection, and unclassified failure.
  - Done when: A historical alias call remains executable, current role-specific tools remain the only discoverable interfaces, the integrated fixture is deduplicated and its four outcome totals sum to all classified error observations, and documentation does not suggest removal while compatibility is supported.
  - Verify: `cd pi && pnpm test tool-failure-command.test.ts log-analytics-parity.test.ts subagent.test.ts tool-search.test.ts tool-visibility.test.ts fable.test.ts && pnpm run typecheck`
  - Depends on: T1, T2

## Execution Strategy

- Parallel work: None
- Smaller-model work: None

## Validation

- [x] The focused T1 classifier/report tests prove additive optional fields, unchanged scan version/fingerprints/legacy fields, an actionable subtotal excluding command nonzero, and explicit unclassified fallback from canonical session fixtures.
- [x] The focused T2 workspace, tree-admission, repeated-edit-result, and subagent tests prove deterministic Pi-owned diagnostics while all existing containment, exact-match, no-spawn, and original-result assertions remain enforced.
- [x] The focused T3 discovery and resumed-call compatibility tests prove the hidden `subagent_coordinate` policy and an integrated deduplicated fixture whose expected-command, actionable, expected-other, and unclassified totals compose exactly; `cd pi && pnpm run typecheck` passes.

## Retention

Keep incomplete work at `.specs/tool-failure-outcomes/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/tool-failure-outcomes/`.

## Execution Status

- State: Completed; implementation and validation passed.
- Blocker: None.
- Next: Archive and close out the owned workflow.
- Resume: `/do-it .specs/tool-failure-outcomes/plan.md`
