---
created: 2026-09-27
status: completed
completed: 2026-09-27
---

# Add lazy path-scoped project instructions to default Pi

## Goal and scope

Add a default-profile Pi extension that keeps agent-only project guidance together under `.pi/instructions/**/*.md`, selects guidance from explicit tool-call paths, and appends each newly applicable instruction to the corresponding tool result after the operation. This supplies local intent before the model's next decision without turning first-touch operations, including mutations, into artificial tool failures.

### Settled requirements

- Discover Markdown instruction files recursively under `.pi/instructions/`; no filename suffix beyond `.md` is required.
- Instruction files may contain optional YAML frontmatter with one string `applyTo` glob. A missing `applyTo` applies throughout the repository/configuration root that owns that `.pi` directory. Patterns are matched against normalized forward-slash paths relative to that owner.
- Activate instructions only from paths present in tool-call arguments. Do not activate merely because a path appears in grep, search, shell, or other tool output.
- Cover Pi's structured path-bearing tools and custom tools with conventional `path`, `file_path`, or `workdir` string arguments. For Bash and PowerShell, perform bounded best-effort extraction of literal path arguments, including navigation targets, without claiming complete shell interpretation.
- Let every tool call execute normally. On its result, append any newly applicable instructions while preserving the original content, details, usage, and success/error status. This includes first-touch `edit`, `write`, and mutating shell calls; there is no pre-mutation gate in the initial implementation.
- Deliver a given instruction source once while its tagged injection remains in the active model-visible branch. Reconstruct this state after resume, reload, and branch/tree navigation so an existing delivery is not repeated.
- After compaction removes the original tagged tool-result contribution from model-visible context, make that instruction eligible again on the next matching call. Use Pi's compaction-aware active context rather than raw historical branch entries when rebuilding state.
- Inventory paths and frontmatter for a session/configuration-root discovery. Read the current body at first activation. If a file was already delivered and then changes, do not append a replacement in that session; a new session is the clean activation boundary.
- Discover `.pi/instructions` in ancestors of the session working directory and in nested directories entered by explicit tool targets. Git repositories, nested repositories, and submodules do not independently start or stop scope. If both outer and nested `.pi/instructions` roots apply, combine them outermost-first; each `applyTo` is relative to its own `.pi` owner.
- Keep injection bytes and ordering deterministic: stable source identities relative to the session boundary, stable outer-root/file ordering, no timestamps/counters/absolute machine paths, and one batched appended text block per result.
- Load the extension in default-profile subagents as well as the orchestrator. Leave `pi/profiles/legacy/` unchanged.
- Treat `.pi/instructions` as trusted project configuration: the profile-installed extension remains inert when `ctx.isProjectTrusted()` is false. Nested instruction roots under the trusted session boundary do not introduce a second trust workflow.

### Non-goals

- Do not add nested `AGENTS.md` loading, eager recursive prompt injection, result-path activation, model-selected `description` routing, instruction priorities/overrides, a status widget, a slash command, filesystem watchers, access-control enforcement, or mutation blocking.
- Do not migrate existing `AGENTS.md` content or create production `.pi/instructions` files as part of this implementation.
- Do not parse arbitrary shell output or claim complete path discovery for dynamically computed shell expressions, scripts, variables, subprocesses, or filesystem activity.
- Do not modify Pi's system prompt or tool schemas when a scope activates. The model-visible addition belongs in the tool-result suffix so the earlier request prefix remains stable.
- Do not add a dependency or generalized rule engine unless repository evidence during implementation shows the existing Node/runtime and `yaml` dependency cannot implement the agreed single-string glob contract.

**Authorization:** this request authorizes the plan only. Implementation, worktree creation, commits, local integration, push, and deployment are not authorized until a later execution request. Push and deployment remain separately unauthorized.

## Fresh-context handoff

All paths are relative to `C:/Users/mglenn/.dotfiles`. Dotfiles owns the feature. Read the root and default-profile `AGENTS.md` files and `pi/README.md` before editing. Ignore `pi/profiles/legacy/`.

### Required reading

- Installed Pi `docs/extensions.md`, `docs/configuration.md`, and `docs/session-format.md` for current hook, project trust, context-building, and session-tree contracts. Resolve the active installed path at execution time rather than copying the planning package-store hash.
- `pi/profiles/default/skills/pi-extension/SKILL.md` and `skills/prompting/SKILL.md` for lifecycle, model-visible context, and cache stability.
- `pi/profiles/default/extensions/compaction.ts` and `docs/compaction.md` for the profile's compaction behavior.
- `pi/profiles/default/lib/subagents/launch.ts` and `tests/subagent-launch-prompt.test.ts` for the explicit child-extension loadout.
- Pi's installed `examples/extensions/claude-rules.ts` only as a discovery/frontmatter comparison; its eager system-prompt listing is not the desired behavior.

### Verified starting behavior

Planning inspection used the default profile on 2026-09-27 at dotfiles revision `677dcc442f96fd60518b30be9aa3b5f91b410cdb`.

- Native Pi loads context files from the launch directory and ancestors; it does not provide this descendant path-scoped behavior.
- Pi exposes `tool_call` before execution and composable `tool_result` transformation after execution. `tool_result` may replace `content`, `details`, `isError`, and `usage`; this feature should change only `content`.
- Tool-result messages are persisted in session history. `SessionManager.buildContextEntries()` is branch- and compaction-aware, while `getBranch()` includes historical entries that may no longer be model-visible.
- Pi session entries form a tree. Compaction replaces older context with a checkpoint/summary and retained suffix, so a process-global delivered set is insufficient for resume, tree navigation, and compaction.
- The default profile already depends on `yaml`, uses Vitest and strict TypeScript, and has no direct minimatch/picomatch dependency. Existing code contains project-specific glob logic, but there is no reusable scoped-instruction implementation.
- Default subagents launch with `--no-extensions` and an explicit first-party extension list; a new orchestrator extension will not reach children unless added there.
- No `.pi/instructions` directory currently exists in the inspected repository. The reload monitor does not watch that path, which is consistent with first-activation reads and new-session replacement semantics.

### Work to preserve

The originating `main` checkout was ahead of `origin/main` by three commits and had unrelated changes when this plan was written:

- modified `pi/profiles/default/extensions/profile-reload.ts`
- modified `pi/profiles/default/skills/agent-process/references/instruction-feedback.md`
- untracked `.specs/lean-pi-runtime/`

Recheck before execution. Do not discard, rewrite, or absorb those changes. Carry this spec into the task worktree without deleting its source copy prematurely.

### Execution coordinates

- Integration target: current checkout `C:/Users/mglenn/.dotfiles`, branch `main`; re-record its actual revision and status before execution.
- Proposed task branch: `feature/pi-scoped-instructions`.
- Proposed dedicated worktree: `C:/Users/mglenn/.dotfiles-worktrees/pi-scoped-instructions`.
- Planning profile: verified `default` through Pi session `01a0e32f-1647-7716-aeb8-dce9d1e9b258` on 2026-09-27.
- Intended implementation and validation profile: `default`. Record actual runs by date/path/profile/result. Legacy is excluded.

## Decisions and implementation contract

### Discovery and matching

The implementation should expose a small testable core separate from the Pi adapter. It must:

1. Establish a session boundary without using Git as a scope boundary. Walk from `ctx.cwd` through its ancestors for existing `.pi/instructions`; the outermost discovered owner is the outer boundary. If none exists, use `ctx.cwd` as the boundary.
2. For each explicit target path, resolve it against the tool/session working directory, reject paths outside the session boundary, and walk its ancestors back to that boundary to discover nested `.pi/instructions` roots. A nonexistent write target uses its nearest existing/lexical parent chain.
3. Index each root's `**/*.md` files in deterministic order. Parse optional YAML frontmatter; strip it from injected body content. Missing `applyTo` means owner-wide. An invalid frontmatter mapping or non-string `applyTo` must not silently become owner-wide; skip it and surface one bounded warning.
4. Match normalized owner-relative paths. Outer and nested applicable files are additive and ordered outermost root first, then source path. Do not add precedence semantics.
5. Use stable repository-relative source labels. Resolve symlinks for containment and duplicate protection without placing absolute paths in model-visible text.

Structured built-ins use their declared path (`read`, `edit`, `write`) or scope path (`grep`, `find`, `ls`, with omitted path treated as the current tool scope). Conventional custom-tool string fields may contribute targets. Shell extraction is deliberately heuristic: identify literal path-like arguments and `cd`/`pushd` targets, reject URLs/flags/dynamic expressions and out-of-bound paths, and never infer scopes from stdout/stderr.

### Delivery and persisted identity

At `tool_call`, compute applicable, not-currently-visible instruction sources and reserve them to that `toolCallId` in call order. This prevents parallel sibling calls from receiving duplicate copies. Do not block or mutate the call. At the matching `tool_result`, read the reserved files, append one deterministic scoped-instruction text block after all original content blocks, and preserve every other result field.

The appended block must contain a stable machine-readable source marker plus clear model-facing framing. Source identity, not content hash, controls same-session deduplication so an edited already-delivered file is not reintroduced. A content hash may be retained in the marker/details for diagnostics, but must not change the agreed live-update behavior. Empty, deleted, or unreadable reserved files should produce a bounded warning and become eligible for a later call rather than being marked delivered.

Rebuild delivered state from tagged injected blocks in `ctx.sessionManager.buildContextEntries()` at session start/reload and after events that change the active tree or compact context. Scan only the extension's tagged tool-result contributions, not arbitrary summary prose or raw pre-compaction history. Clear abandoned pending reservations on session replacement/shutdown. This yields:

- resume after delivery: no duplicate;
- branch from before delivery: eligible on that branch;
- return to a branch containing delivery: still delivered;
- compaction retaining the tagged tool result: still delivered;
- compaction removing it: eligible on the next matching call.

### Cache and prompt contract

Do not modify the base/system prompt, available-tool metadata, or earlier transcript messages. Append exact, deterministically ordered instruction bytes once at the first applicable result. This design preserves the preceding provider-request prefix where the provider supports prefix caching; static analysis alone must not be reported as a measured cache hit or cost reduction.

### Documentation and ownership

Place the runtime under the default profile, with a small extension adapter and reusable/testable library modules as implementation evidence warrants. Document authoring, optional frontmatter, root/nested-root semantics, delivery timing, mutation tradeoff, compaction/resume behavior, trust, and known shell limits in a focused default-profile document linked from `pi/README.md`. Record the user-facing feature in the root `CHANGELOG.md`.

## Execution guidance

Create or resume the recorded dedicated task worktree and branch. Record actual coordinates and target before editing. Preserve unrelated work and carry task-owned uncommitted plan content without deleting its source.

Before delegating plan work, consult Strategist unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead still follows its own Strategist-first workflow. Assign at most one named plan task per subagent, split larger tasks further, and use only roles from the active catalog.

Implement the settled behavior above. Adapt routine file/module boundaries when repository evidence requires it, but do not change activation timing, path/result semantics, trust, scope ownership, deduplication, live-update behavior, or acceptance without approval. Continue independent work around blockers. Do not add optional UI, commands, eager prompt content, security policy, telemetry, or another configuration format. Fix demonstrated task-related defects and stop when the finite checks pass.

Keep checkbox state, concise evidence, blockers, and next action accurate. Unfinished integration and cleanup remain unchecked. Planning does not authorize execution.

## Tasks

- [x] **T1: Implement deterministic instruction discovery, parsing, matching, and path extraction**
  - Depends on: execution authorization; no implementation-task dependency.
  - Files/inputs: proposed `pi/profiles/default/lib/scoped-instructions.ts` or a proportionate small module group; proposed `pi/profiles/default/tests/scoped-instructions.test.ts`; existing `yaml` dependency and native tool input contracts.
  - Change: implement the testable core for ancestor/nested `.pi/instructions` discovery, trusted-boundary containment, recursive Markdown inventory, optional `applyTo`, stable ordering/source identity, body extraction, structured tool targets, and bounded Bash/PowerShell literal-path extraction. Keep tool-result text formatting in the same core if that makes byte-stability tests clearer.
  - Complexity / split hints: the interacting concerns are Windows/POSIX normalization, nonexistent write targets, symlink containment, glob semantics, and shell token false positives. Keep shell support intentionally bounded rather than importing Damage Control's complete safety analyzer or creating another shell framework.
  - Verify: focused Vitest cases cover missing and explicit `applyTo`, normalized paths, outer plus nested roots, absence of Git-boundary behavior, recursive `.md` ordering, malformed frontmatter, symlink/out-of-bound rejection, nonexistent targets, structured tools, Bash/PowerShell literals/navigation, omitted search paths, dynamic/URL/output exclusions, and deterministic framing.
  - Done when: a pure/testable API returns the exact ordered instruction candidates for explicit tool inputs without reading returned tool output or enforcing mutation policy.
  - If blocked: ask only if repository/runtime evidence makes the settled single-string glob or configuration-root semantics impossible; do not silently add a dependency or broaden activation.
  - Evidence: Implemented and covered by `scoped-instructions.test.ts`; focused suite passed 24/24 across T1-T3.

- [x] **T2: Integrate one-time post-result delivery with Pi sessions and compaction**
  - Depends on: T1's discovery/matching contract.
  - Files/inputs: proposed `pi/profiles/default/extensions/scoped-instructions.ts`; proposed lifecycle/integration coverage in `tests/scoped-instructions.test.ts` or a focused companion test; installed Pi extension/session APIs.
  - Change: register `session_start`, `tool_call`, `tool_result`, active-tree/compaction lifecycle, and shutdown handling. Reserve candidates by tool-call order, append one text block without changing status/details/usage, inject on successful and failed results, rebuild delivered sources from compaction-aware tagged tool-result entries, and keep already-delivered content frozen for the session branch. Remain inert for untrusted projects.
  - Complexity / split hints: parallel tool calls and branch/compaction reconstruction are the main correctness boundary. Test against actual session entry shapes or SessionManager helpers where practical rather than only a process-global mock.
  - Verify: tests prove no blocking or argument mutation; original content remains a prefix; success/error/details/usage survive; overlapping and parallel calls inject each source once; resume/reload does not duplicate; branching before/after delivery behaves correctly; retained versus removed compaction entries produce the agreed eligibility; unreadable/deleted files warn without poisoning future delivery.
  - Done when: every applicable first-touch tool result receives deterministic context once, and active model-visible history rather than stale process memory controls later delivery.
  - If blocked: preserve post-action semantics and report the exact unsupported Pi lifecycle contract; do not substitute a pre-call failure or eager system-prompt injection.
  - Evidence: Extension lifecycle integration implemented; focused delivery, trust, parallel, branch, resume, and compaction tests passed.

- [x] **T3: Load scoped instructions in subagents and document the operator contract**
  - Depends on: T2's extension entry point and behavior.
  - Files/inputs: `pi/profiles/default/lib/subagents/launch.ts`, `pi/profiles/default/tests/subagent-launch-prompt.test.ts`, proposed `pi/profiles/default/docs/scoped-instructions.md`, `pi/README.md`, root `CHANGELOG.md`; task-related corrections to T1/T2 tests only with coordinated ownership.
  - Change: add the extension to the explicit child launch set for every default-profile role. Document centralized file placement, optional `applyTo`, examples, nested `.pi` ownership, activation only from explicit arguments, after-result timing including first-touch mutations, session/live-change semantics, trust, deterministic injection, and shell limitations. Do not advertise result-path activation or access enforcement.
  - Verify: child-launch tests cover visible/headless ordinary roles and Team Leads without changing frozen tools/skills; documentation examples match tested syntax and behavior; run the focused tests and complete default-profile check below.
  - Done when: orchestrator and delegated default-profile work share the same scoped-context behavior and operator documentation states its real guarantees and limits.
  - Evidence: Child loadout and operator documentation implemented; focused launch and scoped-instruction tests passed.

- [x] **T4: Archive and commit the authorized implementation**
  - Depends on: T1–T3 complete and agreed checks passing; later execution authorization.
  - Change: update task evidence, confirm `.specs/archive/pi-scoped-instructions/` has no existing plan, move this complete spec directory there in the task worktree, repair affected links, and commit implementation plus archived spec. Keep integration pending until actually delivered.
  - Verify: task commit contains only intended feature, documentation, tests, and complete archived spec; unrelated source-checkout work remains preserved.
  - Done when: the task branch is committed and a closeout manifest records exact task/target coordinates, commit, archive path, and validation evidence.
  - Evidence: Archived and committed with the implementation after validation.

- [x] **T5: Integrate locally and clean up**
  - Depends on: T4's committed task and closeout manifest; authorized execution without `--no-merge`.
  - Change: the orchestrator dispatches Integrator from the recorded target checkout. Integrator owns local integration, completion metadata, and clean task-worktree removal under its existing skill. No push or deployment.
  - Done when: changes are on the recorded target, completion metadata is committed, and task-worktree cleanup is verified. With `--no-merge`, leave this unchecked and report the intentional retained worktree.
  - Evidence: Merged into `main` at `bd891cf794cd2d37d9b595f41efe784f3d1b2f8c`; completion metadata committed at `9023239c920477b475b70bfeb2887038ff994a75`. Task worktree cleanup verified below.

## Agreed validation and current handoff

Run focused checks from `pi/profiles/default/` in the task worktree:

```sh
pnpm test scoped-instructions.test.ts subagent-launch-prompt.test.ts
pnpm run typecheck
```

Then run the repository-owned complete default-profile check from the repository root:

```sh
make check-pi-default
```

The focused suite must establish:

- optional/global and narrowed glob behavior;
- ancestor and nested `.pi/instructions` roots without Git boundary semantics;
- structured and bounded shell argument extraction, with no result-output activation;
- deterministic ordering/framing and original-result prefix preservation;
- no blocking for reads, searches, edits, writes, failed calls, or shell calls;
- one delivery per active model-visible branch across parallel calls, resume/reload, tree navigation, and retained/removed compaction history;
- project-trust gating and subagent loadout.

Review one assembled fixture payload to confirm instruction source markers and content contain no absolute machine path, timestamp, or incidental ordering. Static prefix/byte inspection establishes deterministic cacheability conditions only. Do not claim provider cache effectiveness without representative provider usage, which is not an acceptance requirement.

- Status: implemented, validated, integrated, and closed out locally.
- Completed work and evidence: T1-T5 completed. `pnpm test scoped-instructions.test.ts subagent-launch-prompt.test.ts` passed 24/24 and `pnpm run typecheck` passed. `make check-pi-default` reached runtime smoke and typecheck successfully; its full suite remained red only in unrelated environment/baseline failures (missing optional checkout/dependency/authentication plus existing timeouts/assertions), reproduced from the originating checkout. No scoped-instruction test failed.
- Next: none. Push and deployment remain unauthorized.
- Blockers/open decisions: none. The repository-wide suite has unrelated baseline/environment failures; focused acceptance and typecheck pass.
- Verification limits: arbitrary shell filesystem access, prompt adherence, and real provider cache hits cannot be guaranteed by unit/type checks. Later operator use may reveal a specific need for pre-mutation context; that is intentionally deferred and does not block this post-action MVP.

## Closeout

After implementation and agreed agent-owned checks pass, update task evidence and record integration as pending. Confirm `.specs/archive/pi-scoped-instructions/` does not contain another plan, then move this entire spec directory there in the task worktree and repair affected links. Commit the implementation and archived spec together. Do not archive unfinished implementation.

For authorized `/do-it` execution, after the task commit dispatch the Integrator from the recorded target checkout with the closeout manifest. The Integrator owns local integration and cleanup; the orchestrator owns user questions and final reporting. If integration is blocked, retain the worktree and report implementation/checks separately from pending delivery. If `--no-merge` applies, skip mutating integration and retain the committed task worktree intentionally.

The Integrator verifies target and archive, records actual completion date/status/evidence, commits that metadata, then removes the clean task worktree. Push and deployment require separate explicit authorization. Operator manual testing is useful later evidence but does not block closeout.

## Integration evidence

Focused tests passed 24/24 and pnpm typecheck passed. `make check-pi-default` runtime smoke and typecheck passed. Full-suite failures were unrelated baseline/environment failures reproduced on the originating checkout, with no scoped-instruction failures. Integrated locally into `main` with the disjoint existing Herdr completion. Push and deployment were not authorized and were not performed.

### Final response

Start with one explicit outcome:

- 🟢 **COMPLETED**: checks passed, integrated, completion metadata committed, and cleanup verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed but integration blocked; give reason and exact action needed first.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: a consequential decision or prerequisite prevents completion; state the precise question and recommendation first.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and changes committed under `--no-merge`; retained worktree is intentional.
- 🟡 **CLEANUP PENDING**: changes and completion metadata are on target, but cleanup remains; name the remnant and next action.

Then report concise checks, spec path, branch/commits, merge result, and remaining worktree state. Do not present passing checks as completed delivery while integration is pending.
