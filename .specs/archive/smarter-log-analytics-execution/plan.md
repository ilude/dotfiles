---
created: 2026-09-25
status: completed
completed: 2026-09-25
---

# Make Pi log analytics choose resilient DuckDB execution

## Goal and scope

- User requirements and settled decisions:
  - Make `log_analytics` choose an appropriate DuckDB execution strategy when `execution` is omitted, while preserving explicit `standard` and `large` overrides.
  - Let standard execution use bounded DuckDB spill storage instead of failing solely because its in-memory database has no temporary directory.
  - Place all analytics database and spill artifacts under the dotfiles repository in the already-gitignored `pi/profiles/default/.analytics-state/`, not the operating-system temporary directory.
  - Keep invocation directories unique across concurrent Pi processes, clean up each owned invocation directory after success, failure, or cancellation, and report an exact remnant path when cleanup fails. Routine cleanup must not remove a shared root or another process's invocation.
  - Apply DuckDB's applicable larger-than-memory guidance, including disabling insertion-order preservation where analytics does not promise implicit row order.
  - Base automatic selection on measured selected-input behavior rather than an unvalidated constant. At the current planning snapshot, default-profile discovery selected about 1,648 files / 1.58 GB and completed in 642–858 ms over three local runs.
  - Make results and resource failures explain the requested mode, effective mode, selected bytes, and relevant retry action.
  - Correct stale documentation and performance assertions that still describe the removed 1 GB/4 GiB/deadline/input-limit behavior.
- Non-goals:
  - Do not add persistent transcript projections, background indexing, SQL mutation, arbitrary filesystem SQL, automatic memory-limit increases, or migration of existing session history.
  - Do not claim that disk spill eliminates all DuckDB OOM cases; DuckDB documents remaining limitations for complex blocking operators and some aggregates.
  - Do not add abandoned-directory cleanup that could mistake another live Pi process's directory for stale data. Per-invocation cleanup and explicit remnant reporting are in scope.
  - Do not change the legacy profile.
- Authorization: planning only. Execution, local commits, and merge require a later execution request. Push and deployment are not authorized.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles`. Read root `AGENTS.md` and `pi/profiles/default/AGENTS.md` before acting. Ignore `pi/profiles/legacy/`.

- Owning repository and boundary: the dotfiles repository owns the default Pi profile, extension, analytics library, tests, skills, and changelog involved here.
- Required reading:
  - `pi/profiles/default/extensions/log-analytics-tool.ts`
  - `pi/profiles/default/lib/log-analytics/{api,profiles,registry,render,sessions,store,worker-client}.ts`
  - `pi/profiles/default/lib/log-analytics/worker.mjs`
  - `pi/profiles/default/tests/log-analytics-{store,boundary,tool,render}.test.ts`
  - `pi/profiles/default/scripts/log-analytics-{fixture,perf,ingestion-probe}.mjs`
  - `pi/profiles/default/skills/pi-log-analytics/{SKILL,reference}.md`
  - `pi/profiles/default/.gitignore`
- Verified starting behavior on 2026-09-25:
  - `store.ts` defaults DuckDB to `2GB`, two threads, and an 8 GiB large-mode disk budget.
  - Standard mode creates an in-memory database with `temp_directory: ""`, eagerly materializes all prepared fields, and therefore cannot spill.
  - Large mode creates an invocation-owned disk database under `os.tmpdir()`, uses an appender-backed raw JSON table plus lazy typed view, sets `preserve_insertion_order = false`, monitors owned disk, and cleans its invocation directory in `finally`.
  - `execution` is optional and currently defaults to `standard`; the public schema permits explicit `standard` or `large`.
  - The worker inherits `PI_ANALYTICS_*` environment variables through `fork()`.
  - `pi/profiles/default/.gitignore` already ignores `/.analytics-state/`.
  - DuckDB's current workload guidance identifies grouping, joins, sorting, and windowing as blocking operators; supports spill through `temp_directory`; recommends `preserve_insertion_order = false` for larger-than-memory ingestion; and notes spill limitations. Sources consulted: `https://duckdb.org/docs/current/guides/performance/how_to_tune_workloads.html` and `https://duckdb.org/docs/current/guides/troubleshooting/oom_errors.html`.
- Work to preserve: the originating checkout currently has unrelated modifications in `pi/profiles/default/AGENTS.md`, `pi/profiles/default/skills/agent-process/references/instruction-feedback.md`, `pi/profiles/default/skills/pi-extension/SKILL.md`, `pi/profiles/default/skills/prompting/SKILL.md`, and untracked `pi/profiles/default/skills/pi-extension/references/`. Recheck before execution and do not commit, discard, or overwrite them.
- Worktree and integration target: task worktree `C:/Users/mglenn/.dotfiles/.worktrees/smarter-log-analytics-execution`, branch `workflow/smarter-log-analytics-execution`; originating checkout `C:/Users/mglenn/.dotfiles`, branch `main`, starting HEAD `70e35ac48056c1a144d6cc4ec86a53678d1ebf1b`. The untracked source plan had SHA-256 `1e8c370f1d542c3b86b6b5dbc906f09d10b24fecbed0389a7580ac6394f56895` when carried into the worktree. Preserve unrelated originating-checkout changes.
- Profiles: planning was performed in the repository-owned default profile at `C:/Users/mglenn/.dotfiles/pi/profiles/default`. Intended implementation and checks use the default profile. Record actual dated runs separately; no runtime behavior has yet been validated after implementation.

## Decisions and implementation contract

- Temporary storage root is `pi/profiles/default/.analytics-state/log-analytics-tmp/`, resolved from the registered default profile root rather than process cwd, selected session cwd, or a model argument. The implementation must verify containment and reject path/symlink escape before creating or using invocation storage.
- Every DuckDB query execution strategy may create a unique invocation-owned child beneath that root. Standard uses an in-memory database with owned bounded spill available; large retains disk-backed raw staging and spill. Both use the existing 2 GB default memory ceiling, two-thread default, and bounded owned disk unless environment overrides supply valid values.
- Preserve compatibility for existing `PI_ANALYTICS_MEMORY_LIMIT`, `PI_ANALYTICS_THREADS`, and `PI_ANALYTICS_LARGE_DISK_BUDGET_BYTES`. A clearer additional disk-budget name may be introduced only as a documented compatible alias with deterministic precedence; do not silently break the existing variable.
- Explicit `execution: "standard"` and `execution: "large"` are honored. Omitted execution means automatic selection. The initial automatic policy must use selected file bytes and source/session scope, with its threshold justified by T1 measurements. Do not implement brittle raw SQL keyword matching as the initial selector.
- A current broad default-profile selection of roughly 1.58 GB must resolve to large mode. Small exact-session selections should remain eligible for standard mode.
- Standard and large must both set `preserve_insertion_order = false`; analytics does not promise row order without SQL `ORDER BY`.
- Retain the read-only boundary: only one native SELECT, registered sources, no extension loading, no arbitrary filesystem access after trusted staging, and bounded model-facing output.
- Returned query cost/details must distinguish requested execution (`standard`, `large`, or omitted/automatic), effective execution, selected input bytes, and a stable human-readable selection reason. Rendering must surface the automatic decision without overwhelming collapsed output.
- A standard-mode DuckDB memory/resource error must explain that large mode is the appropriate explicit retry. Do not silently rerun a failed query because that can repeat staging and query cost.
- Mode selection and spill do not authorize raising memory or disk ceilings automatically. Existing caller cancellation, serialized staging, disk monitoring, exact owned-path cleanup, and cleanup-failure diagnostics remain required.
- Benchmark findings may determine the numerical auto-selection threshold and whether standard staging can safely retain eager prepared fields or should adopt raw-JSON/lazy projection. Either mechanism must preserve the SQL view's columns and values. If evidence shows a behavior/contract change beyond these settled choices is needed, ask before proceeding.

## Execution guidance

Create or resume the recorded dedicated task worktree and branch. Record the actual path, branch, and originating integration target before editing. Preserve unrelated work and carry task-owned uncommitted plan content without deleting its source.

Before delegating plan work, consult `strategist` unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead still follows its own Strategist-first workflow. Assign at most one named plan task per subagent, split larger tasks further, and use only roles from the active agent catalog.

Implement the settled intent through the agreed checks. Adapt technical mechanisms when repository evidence requires it, but do not change user intent, scope, settled decisions, or acceptance without approval. When blocked, continue independent tasks and ask only for the specific consequential input or external prerequisite. Do not add audits, optional improvements, speculative fixes, or acceptance requirements.

Keep checkbox state, concise evidence, current blockers, and the next action accurate. Leave unfinished integration/cleanup checkboxes unchecked. Fix demonstrated task-relevant failures and stop testing when the finite agreed checks pass.

## Tasks

- [x] **T1: Establish representative staging and query measurements**
  - Depends on: none.
  - Files/inputs: `pi/profiles/default/scripts/log-analytics-{fixture,perf,ingestion-probe}.mjs`; existing analytics implementation; generated fixture data outside Git tracking.
  - Change: update or extend the existing performance harness so it compares standard in-memory staging, standard with owned spill, and large raw/disk staging at representative input bands. Exercise at least count, filtered projection/JSON extraction, grouping, sorting, and join workloads. Record discovery, staging, query time, selected bytes, memory setting, peak owned disk, and cleanup result. Use bounded generated fixtures, not copied session transcripts. Use the evidence to select and document a deterministic byte/scope threshold that sends the current 1.58 GB broad corpus to large mode while leaving demonstrably small exact selections eligible for standard.
  - Complexity / split hints: benchmark runtime and fixture size must remain finite; distinguish discovery cost from staging/query cost and avoid treating one machine's timing as a universal performance guarantee.
  - Verify: run the updated performance harness from `pi/profiles/default` for its supported small and large fixture profiles; confirm machine-readable output includes all compared strategies and cleanup evidence.
  - Done when: repeatable measurements justify the threshold and staging choice consumed by T3, with no session-history mutation or committed generated corpus.
  - If blocked: record the failing fixture size/query and use the largest reliable bounded comparison; do not invent a threshold without evidence.
  - Evidence: 2026-09-25 benchmark compared all three strategies at ~11.3 MB and ~636.4 MB with five workloads. Standard in-memory failed on the large band; standard owned-spill and large raw/disk passed. Chosen policy: large for non-exact scope or selected input >=256 MiB; eager standard staging remains for exact-session input below the threshold.

- [x] **T2: Move owned DuckDB storage into the profile and make spill safe for both modes**
  - Depends on: none.
  - Parallel with: T1 only if write ownership remains disjoint; T2 owns runtime storage code and focused unit tests, while T1 owns performance scripts.
  - Files/inputs: `pi/profiles/default/lib/log-analytics/{profiles,store}.ts`, relevant test helpers, `pi/profiles/default/tests/log-analytics-{store,boundary}.test.ts`, `pi/profiles/default/.gitignore` only if verification finds the existing rule insufficient.
  - Change: resolve the trusted `.analytics-state/log-analytics-tmp` root from the registered default profile, validate containment/symlink behavior, create unique invocation directories, and use them for standard spill and large database/spill artifacts. Apply the disk budget and monitoring to both modes, set `preserve_insertion_order = false` for both, preserve environment compatibility, and remove exactly the owned invocation path in all normal settlement paths. Do not recursively clear the shared root or another invocation. Keep exact remnant reporting on cleanup failure.
  - Complexity / split hints: multiple Pi processes may share the root, and cancellation/setup failures can occur before a connection is fully initialized. Tests must establish ownership boundaries rather than relying on global directory deletion.
  - Verify: `cd pi/profiles/default && pnpm test log-analytics-store.test.ts log-analytics-boundary.test.ts`.
  - Done when: standard reports a nonempty repo-local DuckDB temp directory and completes a demonstrated low-memory spill workload; large uses the same trusted root; success, error, cancellation, disk-budget failure, and escape tests remove only their owned paths; `.analytics-state` remains ignored.
  - If blocked: retain the existing exact cleanup guarantees and report the specific platform/path behavior that prevents safe repository-local storage; do not fall back silently to OS temp.
  - Evidence: Both modes now use unique owned children under the registered default profile, bounded spill, disk monitoring, disabled insertion-order preservation, and exact owned-path cleanup. Focused storage/boundary tests passed, including low-memory spill, escape rejection, sibling preservation, and cleanup.

- [x] **T3: Add automatic execution selection and actionable reporting**
  - Depends on: T1's measured threshold/staging conclusion and T2's trusted spill contract.
  - Files/inputs: `pi/profiles/default/extensions/log-analytics-tool.ts`, `pi/profiles/default/lib/log-analytics/{api,render,store}.ts`, `pi/profiles/default/tests/log-analytics-{tool,render,store}.test.ts`.
  - Change: interpret omitted `execution` as automatic; calculate the effective strategy after exact source/session discovery using selected bytes and scope; honor explicit modes; and expose requested mode, effective mode, selected bytes, and selection reason in typed details and rendering. Ensure the broad 1.58 GB class selects large and small exact-session queries remain eligible for standard. Convert applicable standard resource errors into actionable diagnostics recommending explicit large mode without automatically retrying. Keep the external schema compatible unless evidence requires exposing an explicit `auto` value; omission is sufficient for the agreed contract.
  - Complexity / split hints: selection currently happens before source discovery in `withAnalyticsSession`; restructure without duplicating discovery, weakening cancellation, or changing source containment. Keep cost fields coherent on both success and relevant failures.
  - Verify: `cd pi/profiles/default && pnpm test log-analytics-tool.test.ts log-analytics-render.test.ts log-analytics-store.test.ts log-analytics-boundary.test.ts`.
  - Done when: tests demonstrate omitted-mode decisions on both sides of the threshold, explicit override behavior, readable decision rendering, actionable standard OOM/resource guidance, and unchanged read-only/output boundaries.
  - If blocked: do not infer mode from raw SQL text or silently retry. Report the exact discovery/API coupling that must be resolved.
  - Evidence: Omitted execution now resolves after discovery using selected bytes and exact-session scope; explicit overrides remain authoritative. Costs and rendering expose requested/effective mode, selected bytes, and reason. Standard resource failures recommend explicit large retry without automatic retry. Focused tests passed.

- [x] **T4: Align operator/model guidance and change history with runtime behavior**
  - Depends on: T3's final public fields, threshold, environment compatibility, and error wording.
  - Files/inputs: `pi/profiles/default/skills/pi-log-analytics/SKILL.md`, `pi/profiles/default/skills/pi-log-analytics/reference.md`, `pi/profiles/default/extensions/log-analytics-tool.ts` tool description/catalog text, `pi/profiles/default/scripts/log-analytics-perf.mjs`, root `CHANGELOG.md`.
  - Change: replace stale 1 GB/4 GiB and removed deadline/input-limit descriptions; document automatic selection, explicit override semantics, repository-local temporary storage, standard spill, cleanup behavior, effective-mode reporting, remaining DuckDB spill limitations, and the measured basis for the threshold. Keep guidance concise and do not instruct callers to choose large when automatic selection is sufficient.
  - Verify: use `rg` to confirm obsolete active guidance/assertions are gone from the owning default-profile files; run the focused render/tool tests and performance script checks affected by textual/default changes.
  - Done when: tool schema/description, catalog defaults, skill, reference, scripts, and changelog agree with tested runtime behavior.
  - Evidence: Skill, reference, tool catalog/description, performance assertions, and changelog now match the tested runtime contract. Targeted stale-claim search, focused tests, syntax check, and diff check passed.

- [x] **T5: Validate, archive, commit, integrate, and clean up**
  - Depends on: T1–T4 complete.
  - Files/inputs: all task changes and this spec.
  - Change: run the finite checks below, fix task-related failures, update task evidence, and complete the closeout contract. Preserve all unrelated originating-checkout changes.
  - Verify:
    - `cd pi/profiles/default && pnpm test log-analytics-store.test.ts log-analytics-boundary.test.ts log-analytics-tool.test.ts log-analytics-render.test.ts`
    - `cd pi/profiles/default && pnpm run typecheck`
    - the updated bounded performance harness for its documented representative profiles
    - `git check-ignore -v pi/profiles/default/.analytics-state/log-analytics-tmp/probe`
    - `git diff --check`
  - Done when: checks pass, generated fixture/temp artifacts are absent or ignored as designed, the archived plan and implementation are committed on the task branch, merged into the recorded `main` checkout, completion metadata is committed there, and the clean task worktree is removed.
  - If blocked: retain the task worktree and report the exact failed check or integration prerequisite, next action, and responsible actor. Do not commit unrelated target-checkout changes.
  - Evidence: 2026-09-25 final validation passed: 34 focused tests, typecheck, the six-case ingestion benchmark matrix, the 16-sample performance harness, ignore verification, and `git diff --check`. Implementation/archive commit `e787826e` merged into recorded target `main` by merge commit `0a40c475`; the active plan copy was removed. Completion metadata was committed separately on the target, and task-worktree cleanup was verified.

## Agreed validation and current handoff

- Status: completed and integrated on 2026-09-25.
- Completed work and evidence: T1-T4 are complete. Final validation passed 34 focused tests, typecheck, the ingestion benchmark matrix, the 16-sample performance harness, ignore verification, and diff checking on 2026-09-25.
- Next: none.
- Blockers/open decisions: none.
- Verification limits: live operator UI/lifecycle behavior was not manually exercised; this does not block authorized closeout.

## Closeout

After implementation and agreed agent-owned checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/smarter-log-analytics-execution/` does not contain another plan, then move this entire spec directory there in the task worktree and repair affected links. Commit the implementation and archived spec together on the task branch. Do not archive unfinished implementation.

Unless explicitly disabled, merge the task branch into its recorded originating checkout and branch without stashing, discarding, or committing unrelated target changes. Resolve routine merge conflicts within settled intent; ask only for consequential decisions or prerequisites outside authority. If integration is blocked, retain the worktree and report implementation and checks separately from pending delivery.

After a successful merge, verify the target contains the changes and archive and no active plan copy remains. Then set the archived plan's `status: completed` and `completed: YYYY-MM-DD`, record integration evidence, and commit that metadata update on the target. Rerun affected checks only if conflict resolution changed checked content. Remove the task worktree only when integration succeeded and it has no uncommitted or unmerged work. Push and deployment require explicit user authorization. Operator manual testing does not block closeout.

### Final response

Start with one overall outcome, using the colored symbol and explicit text together:

- 🟢 **COMPLETED**: checks passed, integrated, completion metadata committed, and task worktree cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed, integration blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents finishing; state the precise question and recommendation.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and changes committed under `--no-merge`; retained worktree is intentional.
- 🟡 **CLEANUP PENDING**: changes and completion metadata are on the target, but worktree cleanup is unfinished.

For blocked or cleanup-pending outcomes, immediately give **Reason** and **Action needed**, naming the issue, actor, and exact next action. Then give concise checks, spec location, branch/commits, merge result, and retained worktree or cleanup remnants. Never rely on color alone or lead a blocked result with a success summary.
