---
status: research-archive
source: .tmp/reviews/candidate-synthesis.md
---

# Consolidated review candidates

This document preserves the complete consolidated recommendation set from the review package. It is archived research, not an approved plan, roadmap, or implementation authorization.


Scope: read-only review of `pi/extensions/subagent/`, `pi/extensions/tasks.ts`, `pi/lib/task-*.ts`, tests, README, and the subagents-and-tasks contract. Preserve root-owned durable task lifecycle, trusted project-agent discovery, coordinator/leaf depth limits, scope containment, cross-process tree admission, cancellation, bounded output, and deferred advanced tools.

The eight complete reviews are in this directory. Candidate IDs below merge overlapping recommendations. Challengers must inspect source evidence before accepting a candidate.

## Safety and durable correctness

- **S1 - Unify mutation authority around effective child tools and explicit execution intent.** Current `agentCanModify()` checks only direct file tools, while unscoped leaves may retain `bash`/`pwsh`; workflow modifying status trusts caller-declared capabilities even when the selected agent has additional mutation tools. Consider an explicit read-only/modifying intent that strips mutation tools for read-only calls and requires a lease for modifying calls. Evidence: `subagent/index.ts:1032-1056, 3091-3111, 4203-4219, 4266-4276, 4400-4404`; `scope-policy.ts:4-11,319-321`. Widely supported; exact default is contentious.
- **S2 - Centralize trusted agent discovery and fail closed on catalog/cwd mismatch.** Ordinary and workflow paths fall back to raw `discoverAgents()` if cwd differs from the session catalog, duplicating confirmation logic. Evidence: `subagent/index.ts:2150-2167, 2530-2533, 3123-3157, 4192-4195, 4243-4262`.
- **S3 - Canonical dependency validation for create, update, and batch.** Single create/update check only existence; batch also rejects tombstones and foreign workspaces. Evidence: `tasks.ts:416-422,475,788`; `task-registry.ts:525-557`. Strong multi-review agreement.
- **S4 - Make compound task update plus transition atomic and address concurrent lost updates.** Current per-file rename is atomic, but read-modify-write has no revision/serialization and task update can persist a patch before a rejected transition. Evidence: `task-registry.ts:350-356,629-655`; `tasks.ts:841-847`. Potentially high value, large/high-risk.
- **S5 - Separate startup orphan cleanup from terminal-history retention.** Session start calls global pruning; all unprotected terminal/tombstoned records can be deleted despite explicit `--all` history semantics. Evidence: `tasks.ts:1012`; `task-registry.ts:864-909`; contract and README task history text. Needs intent adjudication because README also documents aggressive startup cleanup.
- **S6 - Persist only `blockedBy`; derive reverse `blocks`.** Reverse edges are only rendered but require extra multi-file writes and a separate batch reconciliation failure phase. Evidence: `task-registry.ts:372-398,480-509,603-615`; `task-renderer.ts:352-353`. Strong multi-review agreement; migration/compatibility required.
- **S7 - Reject task removal with live dependents unless an explicit detach/cascade policy is chosen.** Tombstoning a blocker leaves dependents permanently unmet. Evidence: `tasks.ts:750-755`; `task-registry.ts:911-927,973-975`.
- **S8 - Strictly validate or quarantine malformed durable records.** Unknown state becomes pending, missing fields receive defaults, unknown top-level fields are retained, and read errors disappear as null. Evidence: `task-registry.ts:297-346`. Valuable but migration-sensitive.
- **S9 - Apply an effective-workspace guard to direct task get/update/remove and slash actions.** Default list/ready and subagent correlation are workspace-aware; exact-ID mutations are global. Evidence: `tasks.ts:716-765,946`; `subagent/index.ts:1799-1811`.
- **S10 - Add abort-aware deadlines and response bounds to tree-broker RPC.** Socket requests can hang during admission/cancellation/release. Evidence: `tree-runtime.ts:800-930`. Correctness/resilience, medium effort.

## Public API and workflow UX

- **U1 - Replace optional-mode bags with discriminated subagent invocation shapes.** Common schema exposes optional `agent/task/tasks`; internal legacy executor counts mode booleans, and advanced adapters map back into it. Use strict public shapes and one compatibility adapter/internal union. Evidence: `subagent/index.ts:1987-2069,2469-2544,2935-2946,4094-4167`. Strong agreement.
- **U2 - Replace the task action bag with closed per-action schemas.** Current schema accepts unrelated fields, arbitrary state strings, blank/untitled creates, and empty batches. Require relevant fields, TaskState enum, and 1-16 batch items; keep direct-call legacy diagnostics. Evidence: `tasks.ts:431-436,539-598,647-655`. Strong agreement.
- **U3 - Make trusted project-agent names representable by the advertised schema.** The enum includes user agents only even though `agentScope=project|both` plus a project-local name is supported. Consider a string schema with known user names in description, retaining runtime trust/name checks. Evidence: `subagent/index.ts:1901-1906,2155-2167`; tests intentionally exclude project agents from enum.
- **U4 - Return a reusable background handle and allow status by orchestration ID.** Background start reports orchestration ID, while status requires a child run ID. Evidence: `subagent/index.ts:2287-2291,3572-3575`; `subagent/status.ts:123`; tests reach into run manager.
- **U5 - Add progressive disclosure to typed workflow input.** Default input to `{kind:none}`, clarify capabilities as tool names, require complete verify/reduce objects in schema, and reconcile advertised concurrency with scheduler capacity. Evidence: `workflow-runtime.ts:74-175`; `subagent/index.ts:4281-4300`.
- **U6 - Preserve/retrieve all bounded workflow envelopes beyond the first 16.** Tool output reports only first 16 and omitted count, with no retrieval surface. Evidence: `subagent/index.ts:4443-4465`; max 256 items in `workflow-runtime.ts`.
- **U7 - Allow root-to-leaf `taskId` correlation.** Current correlation-only task ID is restricted to coordinators, forcing coordinator topology for one worker. Evidence: `subagent/index.ts:2467,3066-3069`; README task ownership text. Controversial because the contract intentionally says coordinator only.
- **U8 - Make output/artifact controls coherent and bound every foreground mode.** `output` accepts unexplained boolean true, `output=false` can conflict with `file-only`, and non-Fable single/chain/parallel visible output is not centrally bounded. Evidence: `subagent/index.ts:600,644-747,1814-1817,1919-1925,3419-3550`. May need separate contract cleanup and output-bound work.

## Small and easy changes

- **Q1 - One authoritative subagent outcome classifier.** Settlement/background/telemetry consider stopReason; chain/parallel rendering often uses exitCode only and may show false success. Evidence: `subagent/index.ts:1725-1737,2250-2258,2664-2669,3822-3829,3951-3959`.
- **Q2 - Join all final assistant text blocks.** `getFinalOutput()` returns the first text part, potentially dropping output and breaking split JSON. Evidence: `subagent/index.ts:475-485,500-504,681-682,2851-2855`.
- **Q3 - Clear `endedAt` when retrying into running.** Failed tasks set it; running transition does not clear it; renderer prefers it for age. Evidence: `task-registry.ts:678-711`; `task-renderer.ts:110`.
- **Q4 - Make `/tasks list --all` display terminal/tombstoned rows in compact mode.** Command selects them, renderer collapses them to a count. Evidence: `tasks.ts:873-903`; `task-renderer.ts:134-141`.
- **Q5 - Share task limits/key patterns/normalizers from a small task contract module.** Bounds are repeated in task extension and registry. Evidence: `tasks.ts:54-63,410-481,541-607`; `task-registry.ts:18,239-266,440-560`.
- **Q6 - Thin or remove `TaskLifecycleService` and return structured readiness.** Service duplicates blocker reads and wraps synchronous registry operations as async. Evidence: `tasks.ts:143-249,823-837`; `task-registry.ts:962-1012`.
- **Q7 - Set `additionalProperties:false` on current task schemas while retaining runtime legacy rejection.** Evidence: `tasks.ts:539-598,647-655`.
- **Q8 - Fix stale/contradictory operator text and rendering seams.** README lifecycle omits skipped; stale blocker text says dependency editing is unavailable although update supports `blockedBy`; status says poll later despite push-first guidance; compact task mutation rows are glued to headers; taskId descriptions omit coordinator-only rule. Evidence across `README.md`, `tasks.ts:139-184`, `status.ts:123`, `task-renderer.ts:278-283`.
- **Q9 - Remove unused `formatAgentList` and narrow internal exports.** Evidence: `subagent/agents.ts:156,176,209-222`, no repository callers.
- **Q10 - Share the retryable permit-release closure for local and remote clients.** Keep in-flight promise and retry-after-failure semantics. Evidence: `tree-runtime.ts:512-529,833-854`.

## Internal maintainability and test enablement

- **M1 - Stage a facade-preserving split of `runSingleAgent` and the 1100-line execute callback.** Extract an options object, event reducer, process supervisor, pure preflight invocation plan, and mode handlers. Evidence: `subagent/index.ts:1066-1797,2471-3579`. High maintainability value, large effort, no broad rewrite.
- **M2 - Split task-registry storage and pure graph helpers behind the current facade.** Evidence: `task-registry.ts:1-1055`. Medium effort and useful if S3/S6/S4 proceed.
- **M3 - Separate tree protocol/transport from broker scheduling while preserving exports.** Evidence: `tree-runtime.ts:272-1038`. Medium effort; potentially deferrable.
- **M4 - Share workflow output schemas/constants with runtime parsers.** Current TypeBox list limits and runtime per-field limits differ. Evidence: `subagent/index.ts:1849-1875`; `workflow-runtime.ts:14-18,478-525`.
- **M5 - Resolve workflow routing once with stable item/phase keys.** Current phases use random internal call IDs, which can alter sampled dynamic routing across retries. Evidence: `subagent/index.ts:2505-2529,4331-4351`; `model-routing.ts:505-528`.
- **M6 - Use bounded concurrency for independent workflow verification and same-level reduction.** Map is pooled; verify/reduce are serial despite the global broker ceiling. Evidence: `workflow-runtime.ts:708-746,840-876`.
- **M7 - Version and retain workflow runtime state across reload like run-manager/tree-runtime.** Current singleton uses `instanceof`; failed promises remain cached. Evidence: `workflow-runtime.ts:599-630,890-896`.
- **M8 - Store background completion as a compact reference with recoverable artifact rather than copied truncated result text.** Evidence: `subagent/index.ts:2198-2272`; `run-manager.ts:301-323`.
- **T1 - Isolate tests from ambient `PI_SUBAGENT_*` identity.** Shared setup isolates operator/metrics only. Reviewer reproduced 68 failures under leaf identity and 80/80 pass after clearing identity variables. Evidence: `tests/setup.ts:7-22`; `subagent/index.ts:931-943`.
- **T2 - Add one end-to-end scope wiring test.** Unit tests separately cover normalization, broker leases, filtering, and policy, but no successful scoped dispatch asserts all three. Evidence: `tests/subagent.test.ts:78-181`; `tests/subagent-tree-runtime.test.ts:115-156`; `subagent/index.ts:1290-1408`.
- **T3 - Add a full task transition table and broader behavior-level redaction table before deduplicating adapter tests.** Evidence: `operator-state.ts:27-57`; selected-only transition tests; `task-security.ts` versus two examples in tests.
- **T4 - Remove exact policy/prose assertions and table-drive output/artifact cases.** Preserve observable behavior, not prompt wording. Evidence: `tests/subagent.test.ts:449-457,1450-1452,3451-3815`; `tests/tasks.test.ts:327-364`.
- **T5 - Introduce controlled child-process fixtures and split the 4295-line subagent integration suite by contract.** Do this only after preserving process/NDJSON behavior. Evidence: `tests/subagent.test.ts` and duplicated setup noted by test reviewer.

## Attractive but unsafe simplifications to reject

- Do not merge task lifecycle with subagent or background-process lifecycle, or auto-close tasks from child outcomes.
- Do not remove canonical scope/symlink checks, disjoint leases, authenticated cross-process tree admission, recursive cancellation, or coordinator/leaf depth limits.
- Do not infer modification authority from free-form task text or caller-declared capabilities alone.
- Do not replace runtime validation with provider schemas; direct/resumed/programmatic calls still need it.
- Do not persist/replay live process controllers or interrupted modifying workflows across process exit.
- Do not make all advanced subagent tools permanently active merely for discoverability.
