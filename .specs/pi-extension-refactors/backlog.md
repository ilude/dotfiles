# Pi Extension Refactor Backlog

## Completed refactors

1. Shared Git preflight for `/commit` (`fdf6834`).
2. Queued complete transactions for custom edit tools (`957e9f1`).
3. Canonical agent paths and atomic settings updates (`d5742d9`, `424d9dd`).
4. Shared session JSONL parsing primitives (`eaa0ace`).
5. Native skill-loader retirement and `/yt` prompt migration.
6. Test-only legacy routing helpers and duplicate telemetry emitter removal.
7. Dormant router policy settings and legacy state retirement.
8. Startup command inventory migration to documented `pi.getCommands()` (`e9368be`).

## Active handoff state - 2026-07-15

The working tree contains two related command-surface migrations that were validated together but are not yet committed:

1. Agent-chain retirement removes `pi/extensions/agent-chain.ts`, `/chain`, `log_exchange`, the dedicated `just chain` recipe, the integration test, coverage registration, and active documentation. Native `subagent` chain mode remains the supported model-driven sequencing surface. Memory retrieval and promotion libraries remain because `cosine` and `chainTail` have production callers.
2. Prompt-only command migration moves `/summarize` and `/gitlab-ticket` from extension registration into `pi/prompts/`, removes the orphaned GitLab workflow skill, and updates prompt and dispatch tests.

Observed retirement evidence:

- Retained Pi session logs contain no `log_exchange` tool-result calls. Files containing the string only contained tool schemas, documentation, or investigation output.
- `~/.pi/agent/multi-team/sessions/` contained no `conversation.jsonl` files.
- No active tracked agent instruction calls `log_exchange`.
- `pi/extensions/agent-team.ts` does not depend on agent-chain; `fable.ts` depends only on team-resolution helpers.
- Focused post-retirement validation passed 54 tests across workflow dispatch, prompt contracts, memory retrieval, and agents-context coverage.
- `make check-pi-extensions` passed after the prompt migration caught up: 95 test files, 1,279 passed, 1 skipped. Typecheck, focused Biome, `git diff --check`, and `just --list` also passed.

Do not finalize the active retirement until the generated-Justfile and active-listener gaps below are resolved. Reload or start a new Pi session after installation so the live startup registry drops `/chain` and `log_exchange`.

## Recommended execution order

Execute and validate one item at a time. Do not batch state transitions, security auditing, background queue changes, and semantic-stage migration into one commit.

| Priority | Work item | Why now | Dependency |
| --- | --- | --- | --- |
| P0 | Complete agent-chain retirement | Active worktree would otherwise leave newly generated projects broken | None |
| P1 | Unify task lifecycle policy | Verified command/tool correctness and cancellation defect | P0 only for clean review scope |
| P2 | Complete damage-control audit recording | Security decisions currently disappear from provenance | Independent; keep separate from P1 |
| P3 | Fix workflow-review queue deduplication | Duplicate background reviews are reachable | Independent; required before reviewer migration |
| P4 | Move the background reviewer behind a typed semantic contract | Removes manual prompt/subprocess/JSON plumbing after queue correctness is proven | P3 |
| P5 | Restore the `max` thinking level in model refresh | Small isolated compatibility bug | Independent; do not bundle with helper extraction |
| P6 | Clean up the no-op agent-team extension boundary | Removes another obsolete public runtime surface without changing native team dispatch | Confirm recipe usage first |
| Blocked | Unify Bedrock refresh identity and region | Requires live work-machine evidence | Work-machine access |

## Verified problems - ready

### Task lifecycle policy differs between the tool and slash command

- Status: ready
- Verified problem: `task(update, state="running")` can start a task whose dependencies are unresolved, while `/tasks start` rejects it. `/tasks cancel` changes registry state but does not stop coordinator-managed execution. The tool cannot persist the `skipReason` supported by `/tasks skip`.
- User impact: A blocked task can run through one public surface, and a cancelled background task can continue consuming resources and later report execution output against a cancelled registry record.
- Evidence: `pi/extensions/tasks.ts:580-632,750-798`; actual execution cancellation is implemented separately at `pi/extensions/tasks/execution.ts:430-481`. Existing focused suites pass but test each surface independently: 61 tests across `tasks.test.ts`, `task-tools.test.ts`, `task-registry.test.ts`, and `task-execution.test.ts`.
- Root cause: Lifecycle policy is independently implemented around the shared registry.
- Recommended solution: Add a narrow lifecycle service for start, transition, skip, cancel, and retry. Enforce dependency readiness in shared start, route active cancellation through `TaskExecutionCoordinator.stop()`, and add `skipReason` to the tool input.
- Acceptance criteria: Equivalent command and tool actions agree on blocked starts, invalid transitions, skip reasons, retry counts, and terminal state. Cancelling active work aborts and settles the child process.
- Validation: Run the four focused task suites, typecheck, and the exact `/tasks cancel` workflow against a running background task.

### Model refresh drops the supported max thinking level

- Status: ready
- Verified problem: `/refresh-models` silently omits `max` from generated `thinkingLevelMap` values.
- User impact: Refreshed GPT-5.6 model definitions lose an available thinking level.
- Evidence: `PI_THINKING_LEVELS` stops at `xhigh` in `pi/extensions/refresh-models.ts:265-282`. The fixture contains `max` in `pi/tests/refresh-models.test.ts:182-210`, but the assertion at `:402-408` checks only through `xhigh`. Pi 0.80.6 and the installed GPT-5.6 catalog support `max`.
- Root cause: A stale local allowlist.
- Recommended solution: Add `max` to `PI_THINKING_LEVELS` and assert the complete generated map, including unsupported levels mapped to `null`.
- Acceptance criteria: Remote `max` becomes `max: "max"`; modern-map, legacy-map, remote-map, and unrelated `compat` behavior remains unchanged.
- Validation: Run `refresh-models.test.ts`, `model-visibility.test.ts`, typecheck, and one `/refresh-models` dry run against the installed catalog.

### Complete active agent-chain retirement

- Status: P0 - ready within the active retirement change
- Verified problem: The active worktree deletes `pi/extensions/agent-chain.ts` and removes it from `pi/justfile`, but `pi/scripts/pi-new:74-95` still emits `chain`, `full`, and `guard` recipes that load that path. Committing the retirement as-is would make newly generated recipes fail at startup. At `HEAD`, the extension still exists, so this is a verified gap in the active change set rather than a released regression.
- Stale listener contract: The retirement removes `log_exchange`, while `pi/multi-team/skills/active-listener.md:10` requires every response to read `.pi/multi-team/sessions/{SESSION_ID}/conversation.jsonl`. No current writer, caller, or retained conversation log supports that requirement.
- Decision: Retire the legacy active-listener conversation-file requirement rather than create a replacement writer. Current Pi sessions, compaction summaries, task state, subagent transfer, and orchestration telemetry already own their respective context and observability boundaries. Reintroduce a conversation writer only after a concrete consumer and retention contract exist.
- Root cause: The original chain command, project generator, multi-team skill, test, documentation, and launch recipes formed one feature, but the active retirement initially changed only the runtime extension and hand-written recipe.
- In scope:
  1. Remove the `chain` recipe from the heredoc in `pi/scripts/pi-new`.
  2. Remove `agent-chain.ts` from generated `full` and `guard` recipes.
  3. Add a generated-project regression using an OS-temp destination. Assert no generated recipe names or extension paths reference agent-chain.
  4. Remove or rewrite `pi/multi-team/skills/active-listener.md` so no active guidance requires an unwritten file. If the remaining content only says to respect supplied context, delete the skill rather than restating global instructions.
  5. Re-run active-reference searches across `pi/`, generated templates, launch recipes, tests, and non-archived specifications.
- Out of scope: Native `subagent` chain mode, orchestration chain telemetry, agent team keys, memory promotion, and unrelated historical archive evidence.
- Acceptance criteria:
  - Generated Justfiles contain no `chain` recipe and no `agent-chain.ts` path.
  - Generated `safe`, `team`, `full`, and `guard` recipes reference only existing extension files and start far enough to prove extension loading succeeds.
  - `/chain` and `log_exchange` are absent from a freshly loaded runtime command/tool inventory.
  - No active agent or skill requires `conversation.jsonl` without an owned writer.
  - `memory-retrieve.ts`, `memory-promote.ts`, and `memory-promote-scan.ts` retain their production-used exports and focused coverage.
- Validation:
  1. Generate a project in an OS-temp directory using `pi/scripts/pi-new`.
  2. Run `just --list` against the generated Justfile and assert `chain` is absent.
  3. Inspect every generated `-e` target and assert the path exists.
  4. Start each supported generated recipe through a bounded extension-load smoke check.
  5. Query a fresh Pi command/tool inventory and assert `/chain` and `log_exchange` are absent while `subagent` remains available.
  6. Run `memory-retrieve.test.ts`, `memory-promote-scan.test.ts`, `agents-context.test.ts`, typecheck, focused Biome, `git diff --check`, and `make check-pi-extensions`.
- Do not remove: `memory-retrieve.ts` as a unit. `cosine` and `chainTail` still have production callers.

### Workflow review queue can execute duplicate reviews

- Status: ready for correctness fix; broad module separation blocked
- Verified problem: `enqueueReview()` checks the processing path before creating a pending job, while the worker renames pending to processing and executes without rechecking recorded reviews. An enqueue/claim race can therefore create and execute a second job for one interaction.
- User impact: Duplicate reviews and duplicate persisted findings can be produced for one interaction.
- Evidence: `pi/extensions/workflow-friction-review.ts:368-410,960-1010`. The 35 focused tests and 25 subagent tests pass, but none exercises queue contention, interrupted recovery, or enqueue during pending-to-processing rename.
- Root cause: Deduplication is split across unsynchronized pending, processing, and completed filesystem states.
- Recommended solution: Add a narrow queue test seam and recheck `reviewAlreadyRecorded()` after claiming a job and before reviewer execution. Add contention, stale-processing recovery, restart, and capture-through-decision tests before considering extraction.
- Acceptance criteria: Two workers or an enqueue/rename race execute exactly one review; annotations remain preserved; stale processing is recorded once; pending jobs survive restart; invalid or repeated decisions remain rejected.
- Validation: Run `workflow-friction.test.ts`, `subagent.test.ts`, typecheck, and a deterministic queue-contention fixture.

### Background workflow reviewer duplicates typed semantic-stage infrastructure

- Status: P4 - design ready, implementation blocked by the workflow-review queue fix
- Verified problem: `executeReview()` in `pi/extensions/workflow-friction-review.ts:907-946` writes a temporary prompt file, launches a second Pi process with `pi.exec`, applies a command timeout, manually parses stdout through `parseReviewResult()`, and maps the result into a persisted review record. This duplicates model resolution, output correction, timeout, schema validation, and disposal behavior now owned by `pi/lib/typed-agent.ts`.
- User impact: The background reviewer has a separate structured-output reliability path from `/commit`. Invalid semantic output receives only the legacy parser behavior, provider/session setup is encoded in subprocess arguments, and future retry or telemetry fixes must be maintained twice.
- Existing deterministic ownership to preserve: Interaction selection, packet construction and sanitization, queue locking, deduplication, annotation application, persisted review status, candidate ranking, and Apply/Edit/Skip authorization remain ordinary code. The semantic stage may classify friction and propose one durable improvement; it must not write instructions, mutate files, choose queue state, or authorize an applied learning decision.
- Dependency: Fix and validate the queue race first. Migrating the reviewer while duplicate execution is reachable would make attribution and retry evidence ambiguous.
- Required design check: `executeReview()` currently runs outside an interactive command context. Before using `defineAgent()`, prove the worker can receive the authoritative model registry, provider authentication, cancellation signal, and model policy without manufacturing a second source of configuration. If that context is unavailable, keep the subprocess transport temporarily but replace free-form parsing with one explicit TypeBox contract; do not force an abstraction that weakens authentication or background isolation.
- Recommended solution:
  1. Define input and output schemas for the sanitized interaction packet and friction review result.
  2. Keep the current fixed reviewer policy unless measurements justify a change: provider `openai-codex`, model `gpt-5.6-terra`, effort `low`, timeout 120 seconds.
  3. Route the semantic call through `defineAgent()` only after the background run context is proven. Use the framework's one correction retry, cancellation, timeout, and disposal.
  4. Apply domain invariants after schema validation: exactly one supported candidate, bounded target paths, no credentials or unredacted prompt content, and no mutation authorization in model output.
  5. Preserve completed and failed `StoredReviewRecord` shapes so existing ranking, `/improve`, and learning-decision history remain compatible.
  6. Remove temporary prompt files, subprocess argument construction, and `parseReviewResult()` only after old/new parity fixtures pass.
- Migration parity:
  - The same packet produces equivalent pattern, evidence, target, proposed change, confidence, and support status under the old and new boundaries.
  - Provider failure, invalid output, timeout, cancellation, and interrupted worker execution create the same bounded failed-review record.
  - Review content remains local and sanitized; prompts and unredacted candidate text do not enter telemetry.
  - Background work never delays or fails the originating interaction.
- Acceptance criteria:
  - Typed input rejects malformed packets before model execution.
  - Typed output plus domain validation rejects unsupported or multiple candidates before persistence.
  - One correction retry is bounded and observable; no unbounded semantic loop is added.
  - Queue deduplication proves one semantic execution per interaction.
  - Apply/Edit/Skip remains an explicit operator decision recorded by `learning_candidate_decide`.
- Validation: Add fake-session tests for schema correction, timeout, cancellation, and disposal; run queue contention and restart fixtures; run `workflow-friction.test.ts`, `typed-agent.test.ts`, `subagent.test.ts`, typecheck, and the exact capture -> background review -> `/improve` -> decision workflow in an isolated storage root.

### Damage-control omits audit records for security decisions

- Status: ready
- Verified problem: Dangerous-sequence, semantic Git, Bun stdin, AST, and SSH metadata approvals return without the audit/provenance records produced for regex approvals. Rule-load failures fail closed but also bypass `recordBlock`. Registered handlers hardcode `hasUI: true` instead of using `ctx.hasUI`.
- User impact: Approved high-risk actions and rule-load denials are missing from `/permissions`, evaluation statistics, provenance, replay metadata, and tool-call correlation. No current no-UI bypass was reproduced, but safety depends on the runtime confirmation stub rather than the declared context contract.
- Evidence: `pi/extensions/damage-control.ts:433-505,564-605,639-675`; approval branches in `pi/extensions/damage-control-engine.ts:183-190,562-655`. The four focused suites pass 121 tests but do not assert a registered-handler audit matrix.
- Root cause: Branch-specific exits bypass common audit finalization.
- Recommended solution: Add one typed approved-ask recorder, route rule-load denials through audited block recording, and use `ctx.hasUI` to produce explicit audited `ask_denied` outcomes. Do not merge tool-specific policy evaluators.
- Acceptance criteria: Bash, PowerShell, read, write, and edit produce correlated, redacted records for approved asks, denied asks, hard blocks, and rule-load failures. Actual no-UI mode fails closed without prompting.
- Validation: Run the four focused damage-control suites, typecheck, and an actual no-UI runtime matrix.

## Verified problem - work-machine validation required

### Bedrock refresh can use a different identity and region than the provider

- Status: blocked on live AWS validation
- Verified local problem: `aws-bedrock-env.ts` avoids profile inference for non-profile authentication, but `bedrock-refresh.ts` manufactures `--profile default`. Refresh reads process environment only, while documented Bedrock credentials can provide profile and region through provider-scoped environment values. Behavior also depends on incidental extension load order.
- User impact: `/bedrock-refresh` can query a different account or region from the active Bedrock provider, so a successful refresh does not prove runtime model availability.
- Evidence: `pi/extensions/aws-bedrock-env.ts:65-128`; `pi/extensions/bedrock-refresh.ts:74-94`; provider-scoped setup at `pi/README.md:45-60`. Current refresh tests pass four cases but do not cover resolver precedence or exact AWS arguments.
- Root cause: Two resolvers consume different inputs and communicate through process mutation.
- Recommended solution: On the work machine, define provider-scoped versus process precedence and confirm that non-profile authentication must omit `--profile`. Then extract a pure resolver while keeping process mutation and AWS command construction in their owning extensions.
- Acceptance criteria: Synthetic fixtures cover explicit options, provider/process environment, config-file overrides, default/single/multiple profiles, non-profile authentication, fallback region, and exact AWS arguments. A real provider request and `/bedrock-refresh` target the same approved profile and region.
- Validation: Add resolver fixtures locally, then run the documented provider request followed by `/bedrock-refresh` on the work machine. Record only profile name, region, exit status, and model IDs - never credential values.

## Investigated maintenance candidates - no verified defect

### Agent-team is a no-op extension with live helper ownership

- Status: P6 - investigate recipe usage, then perform a narrow ownership cleanup
- Current state: `/team` is retired and the default export in `pi/extensions/agent-team.ts` intentionally registers nothing. Native `subagent({ team, task })` owns team dispatch. However, `pi/extensions/fable.ts` imports `loadTeamsConfig()` and `resolveTeam()` from the no-op extension, tests import its parsing helpers, and `pi/justfile` plus `pi/scripts/pi-new` still present a `team` launch mode.
- Why this matters: Auto-discovered extension files should own runtime behavior. A no-op extension acting as a utility module obscures ownership, while a user-facing recipe suggests a distinct runtime capability that no longer exists.
- Required evidence before recipe removal: Search retained shell history, Pi sessions, documentation, and generated projects for `just team`. If no real use exists, retire the recipe. If it is used as a convenience launch profile, rename and document the actual extension set rather than implying a `/team` command.
- Recommended solution:
  1. Move team config types, YAML parsing, path resolution, and team lookup into a focused `pi/lib/team-config.ts` module.
  2. Update `fable.ts`, the native subagent implementation, and focused tests to import the library owner.
  3. Delete the empty `agent-team.ts` extension and the control-plane test that only proves its no-op registration.
  4. Remove or rename `just team` and the generated recipe based on verified usage.
  5. Preserve `pi/agents/teams.yaml`, native `subagent` team dispatch, model routing, cancellation, and orchestration telemetry.
- Out of scope: Rebuilding `/team`, adding another dispatcher, changing team keys, or moving model-selected routing out of the native subagent tool.
- Acceptance criteria: No auto-discovered extension has an empty default export solely to host helpers; `fable` and native team dispatch resolve the same fixtures; unknown teams still fail explicitly; runtime command inventory contains no `/team`; supported recipes reference only behavior they actually provide.
- Validation: Run `agent-team.test.ts`, `fable.test.ts`, `subagent.test.ts`, `agent-control-plane.test.ts` after updating or replacing its contract, typecheck, focused Biome, a native `subagent({ team, task })` fixture, and generated-Justfile checks.

### Quality gates already match the target design

`pi/extensions/quality-gates.ts` already keeps repository discovery, validator execution, exit-code interpretation, bounded diagnostics, and pass/fail routing in deterministic code. Preserve this boundary. Do not replace linters, tests, or validation decisions with semantic judgment. If diagnostics are later returned to a remediation stage, pass bounded explicit input while code retains retry limits and the final validation decision.

### Seam-driven workflow-commands split

`workflow-commands.ts` remains large, but size alone is not a correctness problem. Extract one ownership seam only when a feature change requires it and preserve one registration smoke test plus focused tests for that seam.

### Shared model compatibility helpers

`refresh-models.ts` and `model-visibility.ts` duplicate modern/legacy map selection and `reasoningEffortMap` stripping, but the audited behavior agrees. Fix the missing `max` level without bundling helper extraction.

### Broad workflow-friction separation

The extension intentionally shares lifecycle state across capture, `/improve`, and learning authorization. Fix and test the queue race first. Do not split the controller solely because the file is large.

### Broad damage-control finalizer refactor

Concrete audit gaps justify narrow shared recording, not consolidation of Bash, PowerShell, and file policy evaluators. Ordinary allows remain intentionally unaudited.

### Retrieval-only memory exports

Some `memory-retrieve.ts` exports now have test-only callers, but repository documentation still declares retrieval supported and other exports remain active. Review retirement separately rather than treating agent-chain removal as authorization to delete the module.

## Investigation validation

The evidence review reran these focused suites without modifying their source:

- Workflow friction and subagent: 60 tests passed.
- Task lifecycle: 61 tests passed.
- Memory and workflow dispatch: 43 tests passed.
- Model refresh and visibility: 18 tests passed.
- Damage-control: 121 tests passed.
- Bedrock refresh: 4 tests passed.

Passing suites establish current behavior; the missing contracts named above are why the verified defects were not previously detected.
