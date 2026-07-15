# Pi Extension Refactor Backlog

## Completed refactors

The initial four refactors have been implemented and validated:

1. Shared Git preflight for `/commit` (`fdf6834`).
2. Queued complete transactions for custom edit tools (`957e9f1`).
3. Canonical agent paths and atomic settings updates (`d5742d9`, `424d9dd`).
4. Shared session JSONL parsing primitives (`eaa0ace`).
5. Native skill-loader retirement and `/yt` prompt migration.
6. Test-only legacy routing helpers and duplicate telemetry emitter removal.
7. Dormant router policy settings and legacy state retirement.

The initial four refactors passed `make check-pi-extensions` with 95 test files, 1,293 tests passed, and 1 expected platform skip. After retiring the duplicate skill-loader tests and adding the `/yt` migration contract, the complete suite passed with 94 test files, 1,287 tests passed, and 1 expected platform skip. After removing the test-only router paths and retiring their dormant settings and state, the complete suite passed with 95 test files, 1,278 tests passed, and 1 expected platform skip.

## Deferred refactors

### Shared Bedrock profile and region resolution

- Evidence: `pi/extensions/aws-bedrock-env.ts:20-29,93-129` resolves AWS files, profiles, and regions, while `pi/extensions/bedrock-refresh.ts:71-87,157-226` separately resolves profile and region. `.tmp/extension-review-status.md:49-60` documents the load-order dependency.
- Reason deferred: The current wave already changes settings-path ownership; AWS precedence must be specified and tested independently.
- Revisit trigger: The current agent-path/settings changes have landed with their focused validation, and an explicit AWS precedence contract is agreed.
- Smallest safe scope: Extract one pure profile-and-region resolver used by both extensions. Preserve environment mutation in `aws-bedrock-env.ts` and CLI argument construction in `bedrock-refresh.ts`.
- Required validation: Verify explicit options, existing environment values, `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`, default and single credential profiles, configured-region fallback, and generated AWS CLI arguments.

### Layered registerCommand monkey patches

- Evidence: `pi/extensions/00-echo-slash-commands.ts:38-52` replaces `pi.registerCommand` to wrap handlers. `pi/extensions/01-startup-commands.ts:14-20` replaces the same method to collect names. `.tmp/extension-review-tools.md:63-75` identifies load-order and inventory gaps.
- Reason deferred: Echoing requires an invocation boundary that Pi does not yet expose directly; replacing both wrappers at once risks changing command behavior.
- Revisit trigger: A command-invocation event is available, or an inventory implementation proves the startup list is complete without affecting echo behavior.
- Smallest safe scope: Change startup display to query `pi.getCommands()` at `session_start`; leave the echo decorator in place unless it can be safely centralized.
- Required validation: Verify commands registered before and after extension loading, duplicate suffixes, reloads, native templates and skills in the startup list, and exactly one echo per extension-command invocation.

### Seam-driven workflow-commands split

- Evidence: `pi/extensions/workflow-commands.ts:418-679` contains terminal and session launching, `:717-2312` contains commit planning and execution, and `:2433-2683` registers unrelated workflow commands. `pi/tests/workflow-commands.test.ts:1-70` uses broad child-process mocks. `.tmp/extension-review-workflows.md:22-36` identifies the ownership seams.
- Reason deferred: The module contains current-wave-adjacent `/commit` safety work; structural extraction would expand the change surface beyond the immediate preflight correction.
- Revisit trigger: Shared commit primitives have stable focused tests and the `/commit` preflight change is validated.
- Smallest safe scope: Keep one registration entrypoint and extract one ownership seam at a time: commit orchestration, terminal/session launch, skill-backed dispatch, or clear/exit/session utilities.
- Required validation: Keep one registration smoke test and add isolated tests for the extracted seam. For commit extraction, also exercise normal multi-group `/commit` behavior and Git-state refusal behavior.

### Workflow-friction separation

- Evidence: `pi/extensions/workflow-friction-review.ts:372-446` owns queue and locking behavior, `:674` runs reviews, `:985` captures interactions, `:1040` coordinates `/improve`, and `:1144` owns learning decisions. `.tmp/extension-review-workflows.md:38-51` documents the shared stateful extension.
- Reason deferred: Passive capture and approval-sensitive improvement decisions share persistence and lifecycle state; splitting them without contract tests risks changing authorization boundaries.
- Revisit trigger: Focused fixtures exist for interaction capture, queue recovery, learning decisions, and the full `/improve` flow.
- Smallest safe scope: Extract pure interaction recorder, queue/store-worker, learning-decision store, and `/improve` controller modules while retaining lifecycle hook registration in the extension.
- Required validation: Verify concurrent queue ownership and recovery, interaction lifecycle capture, candidate-decision authorization, and one end-to-end `/improve` workflow.

### Task lifecycle parity

- Evidence: `pi/extensions/tasks.ts:458-580` implements tool-side creation and updates, while `pi/extensions/tasks.ts:669-798` independently parses and performs slash-command lifecycle actions. `.tmp/extension-review-workflows.md:53-64` identifies duplicated validation and transitions.
- Reason deferred: No observed command-versus-tool behavioral drift justifies changing both public surfaces before a parity contract is established.
- Revisit trigger: A lifecycle drift is observed, or a parity matrix demonstrates duplicate logic cannot remain synchronized.
- Smallest safe scope: Add a small task application service returning structured outcomes for create, update, start, complete, skip, cancel, and retry. Keep command parsing/rendering and tool schema/rendering local.
- Required validation: Run a parity table through both surfaces for every lifecycle action, blocked dependencies, invalid transitions, retry counts, and workspace scoping.

### Retired agent-chain expertise code

- Evidence: `pi/extensions/agent-chain.ts:107-578` contains legacy JSONL readers, lexical retrieval, and category rendering; `buildRelevantPriorExpertiseBlock` at `:579` delegates to `pi/lib/memory-retrieve.ts`. `.tmp/extension-review-workflows.md:66-78` records that active callers use the memory adapter and expertise tools are absent from tests.
- Reason deferred: Removal requires a complete call-site and behavior check for repository scope, logging, and bounded memory injection.
- Revisit trigger: Usage search confirms the legacy helpers have no callers and focused `/chain` and `log_exchange` regression coverage is in place.
- Smallest safe scope: Delete unreachable legacy retrieval and rendering only; retain `/chain`, `log_exchange`, repository-ID resolution needed by `/chain`, and the memory-retrieve adapter.
- Required validation: Verify `/chain` repository scoping and bounded memory results, append-safe `log_exchange`, and absence of expertise-tool registration.

### Model compatibility normalization

- Evidence: `pi/extensions/refresh-models.ts:220-245,594-621` and `pi/extensions/model-visibility.ts:317-352` each strip `reasoningEffortMap` and derive a thinking-level map. `.tmp/extension-review-status.md:35-47` documents the duplicated reconstruction paths.
- Reason deferred: The current-wave correctness risks outrank schema normalization, and both provider registration paths need shared compatibility fixtures before extraction.
- Revisit trigger: A model schema migration or capability mismatch is observed, or focused fixtures cover both registration paths.
- Smallest safe scope: Extract only `resolveThinkingLevelMap` and `stripLegacyReasoningEffortMap` into a model-definition utility; leave registration and model construction in their owners.
- Required validation: Verify modern-map precedence, legacy fallback, remote-map precedence for refresh, unrelated `compat` preservation, removal of empty legacy-only `compat`, and both registration paths.

### Damage-control finalization after concrete audit evidence

- Evidence: Bash finalization occurs at `pi/extensions/damage-control.ts:431-548`, PowerShell finalization at `:562-634`, and file handling begins at `:636`. The sequence ask path returns at `:442-464`; `.tmp/extension-review-tools.md:77-90` identifies duplicated prompts and audit handling but no concrete audit or policy defect.
- Reason deferred: This is security-sensitive behavior. Structural consolidation is not justified until audit output or a reproducible policy divergence establishes the required invariant.
- Revisit trigger: Concrete audit evidence or a reproducible discrepancy shows missing, inconsistent, or incorrect allow/deny provenance across tool handlers.
- Smallest safe scope: Preserve tool-specific evaluators and introduce one decision finalizer for prompting, bell behavior, allow/deny audit records, replay metadata, and block results.
- Required validation: Run a Bash, PowerShell, read, write, and edit matrix covering approved ask, denied ask, hard block, no-UI behavior, rule-load failure, and identical audit and provenance fields.
