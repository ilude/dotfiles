---
created: 2026-09-08
updated: 2026-09-09
status: completed
completed: 2026-09-09
---

# Risk-based Damage Control, script preapproval, and failed-call protection

## Authority and scope

This is the canonical execution plan. It reconciles the original T1-T8 scope and recorded D1 decision in `66a2f416`, the operator's routing/readability follow-up, and subsequent execution and correction approvals. The operator requested this cleanup for a fresh session on 2026-09-09. Earlier assistant drafts and worker reports do not override those decisions.

Approved outcomes:

1. Align all policy families in the completed risk review around actual consequences. Routine recoverable work stays quiet; meaningful unique-data loss, damage to recovery mechanisms or important system state, sensitive disclosure, and substantial irreversible resource loss warrant intervention. Independent publication, push and deployment authority still applies.
2. Use the existing Luna reviewer for contextual decisions, with the complete pending call and relevant evidence. Ordinary temporary-resource lifecycles can be allowed without a statically known generated pathname. Replace opaque migration-order policy IDs with understandable semantic identities.
3. Add `/dc scan` and single-script preapproval through parallel read-only subagents. Never execute scripts to review them. Reuse unchanged completed reviews; matching approvals skip script-body analysis, with ordinary runtime analysis on a miss.
4. Share approval records across Git worktrees through the common Git directory. Outside Git, use the operation's current project/location `.pi/`. Support whole-script or argument-specific approval where arguments affect risk.
5. Add `Allow once and review for future use`. Permit the current call without waiting for review; a qualifying review establishes future approval without another confirmation.
6. Replace repeated-success restrictions with the narrow adjacent-failed-call watchdog specified below.
7. Complete the agreed finite checks, reconcile documentation, archive the completed task, and integrate locally into the recorded parent `main`.

**Authorization:** Full implementation, local task commits, archival and local integration were approved. No push, deployment, production relinking, submodule changes or new dependency installation is authorized. This plan-cleanup turn does not resume implementation.

**Excluded:** A separate delivery stage or extra acceptance gate; another judge or shadow-mode framework; a special-case temporary-directory parser; a new permissions framework, sandbox, universal safety proof, dependency manager, mandatory environment inventory, security audit, telemetry system, watchdog service, or delegation runtime. No legacy-profile changes. No separate login, credential copying, model substitution, or new platform setup to make tests pass. Preserve existing direct-operator-shell and `/commit` exemptions rather than auditing them as part of this task.

## Resume location and reading

- Parent checkout: `C:/Users/mglenn/.dotfiles`, branch `main`.
- Task worktree: `C:/Users/mglenn/.dotfiles/.worktrees/damage-control-risk-alignment`.
- Task branch: `feature/damage-control-risk-alignment`.
- Latest task checkpoint: `f0dc7ba9`, following merge `9cc9c578` of `main` at `fa1c2976`. Earlier implementation commits include `f1cca879`, `d79153b0`, and `66a2f416`. Do not reset to them or recreate the task.
- Implement and validate in the task worktree. Paths below are relative to that repository root. **Default** means `pi/profiles/default/`; bare Damage Control filenames refer to its `lib/damage-control/` directory.
- Read applicable `AGENTS.md`, `pi/README.md`, the planning skill, and the testing skill when changing tests. Read default `docs/damage-control-port.md`, `docs/damage-control-setup.md`, and the co-located [risk review](damage-control-risk-review.md) as needed for the next task. The review is completed input, not an audit to repeat. [Policy dispositions](policy-dispositions.md) preserve the historical mapping.
- For watchdog hooks or reviewer integration, inspect the relevant installed Pi API documentation/source and default `docs/subagents.md`. The default subagent runtime has already been delivered and merged into this task. Do not take over another worktree or rebuild its runtime.

### Profiles and existing changes

The active profile was verified on 2026-09-09 as `C:/Users/mglenn/.dotfiles/pi/profiles/default`. Task code and policy live in the worktree's default profile. Existing default-profile authentication/catalog may be reused through supported Pi APIs while testing task-owned code. Code isolation does not require a separate login. Record which paths each actual check uses; do not confuse the active profile with the code under test.

Recheck Git status before implementation. Preserve all existing work:

- Task checkpoint contains the implemented policy, evidence, trust-store, prompt and reviewer work.
- Uncommitted task changes include `judge-prompt.md`, `shell.ts`, and `scripts/damage-control-eval.ts`: contextual prompt clarifications, neutral unsupported-effect wording, existing-login reuse, and an evaluation case filter. They have partial live evidence below, not a completed final acceptance run.
- Task and parent also have approved planning-skill/feedback changes. Task `CHANGELOG.md` has an associated entry. Reconcile task-owned copies during integration without absorbing unrelated changes.
- An untracked task file, default `commands/commit/trim-trailing-whitespace.d.mts`, was added by the assistant to address an unrelated TS7016 diagnostic. It is not a requested Damage Control feature or a new prerequisite. Do not silently include unrelated command work in the task commit; preserve and account for it when reconciling task-created extras.
- The parent has unrelated dirty Bedrock implementation/tests, changelog and feedback content, and `.specs/subagent-reload-and-live-ux/`. Do not stash, discard or commit that work to make integration possible.
- The speculative code/auth profile-splitting edits in `lib/subagents/{launch,rpc,runtime}.ts` and `lib/damage-control/script-review.ts` were removed. No dependency was installed. Do not restore that workaround merely because it appeared in an earlier worker assignment.

## Decisions and contracts

### 1. Policy and contextual judgment

Use the existing allow/review/user/block mechanism:

- Established ordinary work allows without Luna or UI. Do not add review to every call.
- Context-dependent operations reach the existing Luna reviewer once with the complete pending call. A confirmed review operation can genuinely execute and still be safe; it need not be dismissed as a false positive.
- Generic recursive/forced deletion is not automatically a human-only operation. Luna can recognize `scratch=$(mktemp -d); ...; rm -rf "$scratch"` without a concrete generated path. A variable name alone is not evidence of disposability.
- Retained direct-user rules must express independent human-only boundaries, not command mechanics. Retained confirmed blocks, including root/home destruction and established forbidden sensitive disclosure, still win.
- Review failure, timeout or invalid output escalates normally. Cancellation or stale calls cannot execute. Keep at most one judge call per pending call and no general pending-call approval cache; script preapproval is the separately specified mechanism below.
- Active IDs use semantic lowercase kebab-case, not numeric ranges, positions, reason-text exceptions, dotted IDs, or a new `source:` schema field. Path, sequence and runtime evidence must identify the actual protection. Preserve `tests/damage-control/fixtures/policy-migration.json` as history and the existing disposition table outside runtime authority.
- Pass relevant static/inherited evidence only with truthful provenance and bounded redaction. Gate-time process observations are not the final shell environment: shell startup, prefixes, spawn hooks and remote contexts may override them. No environment dump or shell evaluation to discover values.

The reviewed family outcomes remain:

| Finding | Required behavior and representative contrast |
| --- | --- |
| R1: cleanup/local tooling | Rebuildable caches and empty-directory removal stay quiet. Images, volumes, environments and package purges depend on actual consequences; meaningful volume data is not disposable merely because local. |
| R2: mechanics | Remove prohibitions based only on flags, encoding, scheduling, history clearing or privilege. Harmless encoded operations can pass; actual destructive targets remain protected. No new shell dialect is required. |
| R3: files/sensitive paths | Remove hygiene-only restrictions on lockfiles, generated artifacts and recoverable documents. Public certificates can pass; actual private-key disclosure cannot be excused by a filename exclusion. No blanket content inventory. |
| R4: existing work | Containment below cwd does not establish recoverability. Known scratch can pass; credible unique/uncommitted-work loss prompts. No recursive inventory, per-delete Git subprocess or creation ledger. |
| R5/R7: variables | Literal, static and supported inherited evidence for the same disposable target should support equivalent outcomes. Parser uncertainty alone is not danger; materially unknown target consequences can require intervention. |
| R6: sequence | Recent sensitive access plus an unrelated upload is reviewable evidence, not proof of disclosure. Actual sensitive-source upload remains protected. Evidence resets with its owning session. |
| R7: remaining families | Apply the same philosophy to Git, cloud, infrastructure, hosting and publication. Recoverable metadata/disposable resources can pass with evidence; unique work, backups and sensitive publication remain protected. Push/deployment authority is independent. |
| R8/R9 | The watchdog and script-reuse contracts below apply. |

This is family-level acceptance, not a test or approval dialog for each historical detector. The original Herdr call remains unchanged as inert data at default `tests/damage-control/fixtures/reported-herdr-command.txt`. Its unassigned `$PID` is not a new requirement to prove an exact disposable identifier. Never execute the regression command.

### 2. Script identity and storage

Continue the existing small YAML record implementation, indexed in memory. Records bind repository-relative script identity and byte-content SHA-256 to a completed outcome/reason and either whole-script approval or exact approved argv. Add cwd/environment equality conditions only when materially relevant to the review, not a condition language or broad regex grants.

- Discover the repository from the operation's cwd. Store Git approvals in `<git-common-dir>/pi/damage-control-trust.yaml`; submodules are separate repositories. Outside Git, use `<ctx.cwd>/.pi/damage-control-trust.yaml`.
- Shared records must match the actual worktree's bytes. Changed bytes/conditions, missing records, and unreadable/malformed stores fall back to ordinary analysis, not another permission requirement. Never update a hash merely to retain approval.
- Runtime still reads/hashes covered bytes but skips their body parsing/effect extraction and model review. Cache the store index, notice other instances' writes, and use existing locking plus atomic updates. No database or background crawler.
- Protect trust-file edits through the existing narrow confirmation mechanism. Only a qualifying explicitly commissioned review creates approval; script text and ordinary reviewer file-write tools cannot grant it.
- The implemented flat helper hashes cover consequential local helpers/command definitions when relevant. Changed required helpers invalidate the record. No dependency resolver, package lock system or automatic rejection merely because helpers exist. Document ambient interpreter/package/startup assumptions rather than claiming a sandbox.
- Outer arguments, redirections, substitutions and appended commands retain normal analysis. A body's approval cannot erase an adjacent command's effects. Do not claim to recheck skipped internal hard blocks without parsing.
- Completed nonqualifying results may be reused to avoid duplicate reviews, but never bypass runtime analysis.

### 3. Scan and operator flow

One coordinator serves `/dc scan` and `Allow once and review for future use`, through the delivered subagent runtime. Review inputs identify the frozen script bytes, invocation/conditions, risk context, repository/worktree and originating session. Only completed qualifying results approve the bytes actually reviewed. Mutation, failure or cancellation cannot approve a new version.

- Scan project-owned supported scripts and extensionless shebang scripts. Use tracked/nonignored files in Git and bounded traversal outside Git; exclude ignored dependencies/generated output. Include package command definitions only as concrete entrypoints/helpers, not a dependency ecosystem scan.
- Use a small parallel set of read-only reviewers. Never execute submitted scripts or grant shell/write/delegation authority for review. Preserve normal host visibility and lifecycle behavior. The coordinator validates results and stores approvals; valid completed results may survive another batch's failure/cancellation.
- Reuse unchanged completed results. Keep progress concise and provide script-specific nonapproval reasons. Reuse existing cancellation/inspection, not another job dashboard.
- Offer the prompt choice for identifiable local scripts, not arbitrary direct deletion patterns. Preserve `Allow once` as the initial selection, Details, Escape-deny, RPC and no-UI behavior.
- The choice permits the whole current call once and starts review asynchronously without delaying that call. Future approval covers only the reviewed invocation. Failure leaves future runtime analysis in place. No second confirmation, fallback model, retry loop or scheduled continuation. Late results must not write to another project or notify another session.

### 4. Failed-call watchdog

**D1 is settled:** unrelated calls reset the failure streak. Only adjacent exact failures count. Success of that signature and direct operator resumption also reset. The earlier proposal for independent per-signature streaks is not authorized.

- Key: tool name + stable arguments + effective cwd, preserving command text without fuzzy matching. Count actual Pi-reported failures, including changed error output, not words in successful output. Observe all model-callable tools, even without a Damage Control adapter, and count each call ID once.
- Allow 12 failed attempts; refuse equivalent attempt 13 and halt that agent run with tool/input summary, cwd and count. No unattended approval/retry loop. Do not stop unrelated servers or instances.
- Successful repetition is unlimited. Session-owned state survives ordinary assistant turns and compaction. Verify reload/session lifecycle using the installed API, without persistent global counters or a durable service.
- Once tripped, the run stays stopped until a new direct operator instruction. Automatic queued follow-ups or sibling results must not clear that stopped state. An unrelated call resetting an untripped streak is not permission to resume a tripped run.
- Child instances inherit protection through normal Damage Control loading and report to their owner through the existing runtime.

No operator scope decision remains open. Discoverable API behavior is implementation work, not a reason to ask again about D1.

## Tasks and completion evidence

Checked tasks mean their implementation/offline acceptance is recorded; whole-task live acceptance remains T7.

- [x] **T1 - Establish execution seams and dispositions.**
  - Inputs: completed risk review, policy/engine/path/sequence sources, native shell/tool-event API.
  - Done: existing worktree resumed; baseline exact Herdr input reproduced without execution; confirmed `user` matches prevented Luna. Existing harmless inherited-variable probe reused. Dispositions and truthful environment-evidence boundary recorded.
  - Evidence: `f0dc7ba9`, 335-row historical mapping. No repeat audit or probe is required.

- [x] **T2 - Align reviewed policy families and identities.** Depends on T1.
  - Files: default `damage-control-rules.yaml`, `policy.ts`, `paths.ts`, `analysis.ts`, `engine.ts`, `shell.ts`, and associated tests.
  - Done: 321 active semantic detectors, narrowed path restrictions, removal of numeric/reason-text authority exceptions and blanket user-to-review conversion; reviewed family contrasts covered offline. Historical migration fixture preserved.
  - Evidence: checkpoint suite below. Fix only demonstrated remaining failures, not another inventory or classifier.

- [x] **T3 - Supply relevant contextual evidence to Luna.** Depends on T1/T2.
  - Files: `types.ts`, `shell.ts`, `analysis.ts`, `context.ts`, `sequence.ts`, `engine.ts`, `judge.ts`, `judge-prompt.md`, `enforcement.ts`, relevant evidence/gate tests.
  - Done: complete-call/semantic/path/sequence evidence, bounded environment observations with override warnings/redaction, one-review gate and safe cancellation/failure behavior implemented. Static/inherited evidence does not assert a final spawn environment it cannot observe.
  - Evidence: checkpoint offline suite; subsequent prompt/evaluator changes and partial live results below. Final sampled judgment is T7, not proved by mocked verdicts.

- [x] **T4 - Complete the failed-call watchdog.** Depends on T1; independent of live scan.
  - Files: `breaker.ts`, watchdog portions of `enforcement.ts`, extension hooks, `tests/damage-control/breaker.test.ts` and enforcement fixtures.
  - Existing: adjacent exact failure counting and attempt-13 rejection. Basic counter tests are not full lifecycle acceptance.
  - Remaining: implement the settled halt/reset/session contract through actual hooks, keeping watchdog state separate from ordinary analysis/sequence invalidation. Current `invalidate()` resets the breaker and is attached to abort/session events; current `Breaker` has no stopped latch and expires counts after 30 minutes. These facts require reconciliation with the contract, not a new design project.
  - Verify: offline synthetic throwing/native nonzero failures, changed error text, 12 failures then prevented attempt 13, repeated successes, success/unrelated resets, call-ID accounting, sibling preflight/result ordering, queued continuation, compaction/reload/session behavior and direct operator resumption. Pi preflights siblings before concurrent execution; `terminate: true` alone is insufficient for a mixed batch. Use the actual supported abort/event API. No model calls to simulate a failure loop.
  - Done: removed expiry, added a persisted stopped latch, terminating sibling preflights, call-ID deduplication, and direct-input-only resumption. Abort/cancellation invalidation no longer clears watchdog state. Focused lifecycle tests cover changed errors, successes/unrelated resets, attempt 13, sibling results, queued input, reload restore, and direct resumption.

- [x] **T5 - Implement shared, source-bound preapproval storage.** Depends on T1/T2.
  - Files: `script-trust.ts`, `script-review.ts`, source identity/analysis integration and trust tests.
  - Done: common-Git-dir storage with worktree-relative identities, hash/argv/helper matching, stat-invalidated cache, locked atomic writes, malformed fallback, source snapshots and pre-parse body skipping. Trust-store writes require confirmation.
  - Evidence: disposable Git/worktree tests, helper mutation/concurrent-write/fallback tests in checkpoint suite. Full live reuse remains T7.

- [x] **T6 - Wire scan and asynchronous prompt review.** Depends on T3/T5 and the delivered runtime.
  - Files: default `extensions/damage-control/index.js`, `script-review.ts`, `prompt.ts`, `approval-view.ts`, `approval.ts`; delivered `lib/subagents/` API.
  - Done: one coordinator, bounded read-only review, frozen snapshots, source-mutation checks, cancellation propagation, session-safe notifications, incremental reuse and prompt flow implemented.
  - Evidence: deterministic coordinator/gate/UI tests and bundled-loader smoke. Actual model-backed scan remains unverified under T7; do not infer success from this checkbox.

- [x] **T7 - Complete finite integration checks and reconcile documentation.** Depends on T2-T6; independent checks may proceed alongside T4.
  - Inputs: existing eval/smoke scripts, bundled Pi loader, delivered reviewer runtime and the finite set below.
  - Remaining: finish sampled live Luna acceptance and the original two-child scan/prompt acceptance. Diagnose the smallest actual failing boundary if a check cannot run; distinguish the test harness from the product before changing code or claiming a setup blocker.
  - Docs: default `docs/damage-control-port.md`, `docs/damage-control-setup.md`, `pi/README.md`, root `CHANGELOG.md`, and co-located risk review. Existing updates are present; reconcile only remaining behavior/results, including hash reading versus skipped parsing and helper/environment limits.
  - Done: 191 Damage Control tests, typecheck, runtime smoke, the unchanged 25-case environment corpus (20 live Luna reviews), and the isolated real-child scan passed. The scan used two normal Herdr-visible read-only children and verified persistence, unchanged/cross-worktree reuse, changed-version fallback, and invocation review without executing scripts. Documentation now reports actual coverage and limits.

- [x] **T8 - Archive and integrate locally.** Depends on T7.
  - Commit task changes and the completed archived spec in the task branch, then merge to the recorded parent `main`. Reconcile the originating plan pointer and task-owned dirty copies without absorbing unrelated edits.
  - Verify implementation/archive are present in the parent and no active plan remains. Check only affected behavior if conflict resolution changes code. Remove the worktree only after clean integration with no uncommitted/unmerged task work.
  - Result: archived and committed in the task branch. Local integration was attempted but is blocked by unrelated dirty parent changes overlapping task-owned planning, feedback, changelog, and originating-plan paths. The task worktree is retained. No push or deployment.

## Agreed finite validation

Run default-profile commands from the task worktree's `pi/profiles/default/`. Reuse valid evidence and rerun only checks affected by relevant changes or failures.

1. `pnpm test tests/damage-control`. Include only affected subagent integration filters if those boundaries change, not wholesale unrelated suites.
2. `pnpm run typecheck` and `pnpm run check:runtime`. Use the existing bundled-loader smoke, extending only changed registration/load boundaries.
3. Existing `pnpm run eval:damage-control --environment`: real production analysis with synthetic facts, never command execution. The existing corpus already includes the six approved paired areas: disposable/unique work, safe/consequentially unknown variables, harmless/destructive encoding, unrelated/actual disclosure, disposable/meaningful resource data, recoverable/consequential Git/remote/publication operations. It also preserves the exact Herdr regression and minimal temporary lifecycle. Report initial route, actual judge invocation, final outcome and safe reason. Use `--case=<name>` for remaining/affected cases rather than create a second corpus. Sampled success is not exhaustive model safety.
4. One isolated bundled-Pi `/dc scan` integration over disposable harmless, argument-sensitive and nonqualifying scripts using two real read-only children. Verify persistence, unchanged rescan reuse, cross-worktree reuse and changed-version fallback. Exercise the prompt choice with an inert intercepted operation. Never execute reviewed scripts. Preserve normal visible behavior inside Herdr; no separate UI/capacity pilot or production relinking.
5. Task-root `git diff --check` and changed-document/link checks. Record Windows coverage; run affected offline filters on available native Linux tooling only, without installing another platform. Disclose unavailable coverage.

Stop when these checks pass. Actual provider/runtime unavailability may leave a check unverified, but it does not authorize installations, another login, copied credentials, a fallback model, or a speculative runtime redesign. Continue independent implementation when a live check is unavailable.

## Validation record and limits

These are historical execution results, not checks rerun during this plan cleanup.

| Date | Code/profile used | Evidence and limits |
| --- | --- | --- |
| 2026-09-08 | Baseline `main fa1c2976`, synthetic path facts | Exact inert Herdr call returned `user` through `legacy-007`/`legacy-008`; Luna was not reached. Root cause was routing. |
| 2026-09-08 | Task checkpoint `f0dc7ba9`; explicit task default profile for offline checks | 188 tests in 18 Damage Control files passed; runtime smoke, diff whitespace and local Markdown targets passed. Later uncommitted prompt/shell/evaluator edits are not covered by that full-suite result. |
| 2026-09-08 | Task evaluator with worktree-local empty auth/catalog | Five deterministic outcomes passed; 20 model judgments were unverified, with zero provider calls. This historical run does not establish a need for another login. |
| 2026-09-08/09 | Task code/policy, existing parent default authentication/catalog | Live evaluator successfully used `openai-codex/gpt-5.6-luna`, high effort. Docker/Git cases initially escalated or returned invalid output; the full Herdr case timed out. Focused runs after relevant prompt/wording fixes passed `local-compose`, `disposable-volume`, `recoverable-git-reference`, and `reported-herdr-lifecycle`. Herdr allowed in 11,392 ms within the unchanged 20,000 ms deadline. No submitted command executed. |
| 2026-09-09 | Same task code and existing active authentication | Latest whole-corpus run was interrupted after nine reported passes: local-compose, local-kubernetes, local-database, owned-process, local-helm-reference, production-database, unknown-compose, broad-process and forged-local-output. No complete final 25-case pass is established. Resume remaining/affected checks rather than claiming all passed or all remain unverified. |
| 2026-09-09 | Task default `pnpm run typecheck` | Completed without diagnostics after the untracked unrelated `.d.mts` declaration was added. Before that, TS7016 referred to `tests/commit-whitespace.test.ts` importing `commands/commit/trim-trailing-whitespace.mjs`. Do not describe it as still failing or claim a clean checkpoint typecheck without noting the declaration. |
| 2026-09-08/09 | Worker scan attempt | Worker reported three reviewer attempts and a missing `@earendil-works/pi-server` import through installed `dist/experimental/server.js`; focused script-review tests passed 5/5. This is not the agreed successful two-child acceptance. The failing harness/native-child boundary was not conclusively established; claims that installation was required or the entire runtime could not start were withdrawn. No dependency was installed and no successful live scan is established. |
| 2026-09-08 | Windows and inspected WSL Ubuntu | Windows checks above ran. WSL lacked native Node and exposed a Windows pnpm shim, so native Linux validation was unavailable. No new platform setup is authorized. |
| 2026-09-09 | Plan cleanup in parent and task worktree | Reconciled approved scope, D1, evidence and next steps; no implementation or runtime tests performed in this cleanup turn. |

## Fresh-session handoff

- Status: implementation and agreed validation completed on 2026-09-09. The spec is archived and committed on the task branch; integration is separately blocked by unrelated dirty parent changes.
- T4 now persists the stopped latch in session entries and resumes only on new direct operator input. T7 reused the active default profile's existing authentication without copying credentials or relinking production.
- Preserve the partial live evidence and uncommitted fixes. Do not execute regression scripts, change expected outcomes or the review deadline, repeat the risk audit, or introduce another validation gate.
- The earlier staged delivery, reopened D1, separate-login prerequisite and asserted dependency-installation blocker are withdrawn. They are not instructions for the next session.
- Update progress/evidence as work finishes. Ask before materially changing approved scope, acceptance criteria or settled decisions. A test failure is evidence to diagnose, not authority to expand the task.

## Completion and archive

Completed on 2026-09-09. The full directory, including the risk review and disposition table, was moved to `.specs/archive/damage-control-risk-alignment-and-preapproval/`. Links were repaired. The task branch remains in its worktree because unrelated dirty changes in the parent checkout block a safe merge.
