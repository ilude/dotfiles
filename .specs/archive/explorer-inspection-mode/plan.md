---
created: 2026-10-05
status: completed
completed: 2026-10-05
---

# Give Explorer guarded shell inspection

## Goal and scope

Allow default-profile Explorer subagents to investigate local and live evidence through Bash and PowerShell without granting unrestricted shell mutation authority. Use the existing Damage Control tool-call monitoring infrastructure with an inspection-specific policy.

### User requirements and settled decisions

- Explorer receives shell tools but no native edit/write tools.
- Inspection mode is best effort, not an OS sandbox or a guarantee of literally zero side effects.
- Observational commands may run, including ordinary incidental client-cache updates and server access logs. Intentional changes to files, managed resources, configuration, or processes are blocked, even if temporary or recoverable.
- Recognize common read-only commands directly. Use an inspection-specific model judge for unfamiliar commands or scripts. If still uncertain, block with a concrete explanation.
- Check the complete call, including pipelines, substitutions, redirects, nested commands, and supported script bodies. A read-only-looking prefix is not sufficient.
- No agent-controlled bypass. Normal Damage Control script preapprovals and recoverability allowances cannot grant Explorer mutation permission.
- Apply the policy automatically to Explorer. Keep normal meaningful-unrecoverable-harm enforcement unchanged for other roles and the orchestrator.

### Non-goals and authorization

No OS sandbox, comprehensive arbitrary-program proof, new cloud credentials, real server investigation, other read-only-role migration, legacy-profile work, Claude adapter changes, or global inspection-mode control is required. Existing explicitly operator-issued native `!`/`!!` shell behavior remains outside model-tool enforcement. This is not a new operator recovery restriction.

Planning permits this document and its process record only, not runtime implementation or Git mutations. `/do-it` authorizes implementation, dedicated task worktrees, local commits, and integration into the recorded target unless `--no-merge` is supplied. Push and deployment require separate authorization and are not authorized here.

## Fresh-context handoff

All source paths below are repository-root-relative to the dotfiles repository. Read applicable `AGENTS.md` files before acting.

- Owning repository: dotfiles only. No submodule changes.
- Planning checkout and integration target: `C:/Users/mglenn/.dotfiles`, branch `main`, planning HEAD `b926df56192ab0cd2768a19a61730ebaed279da3`.
- Proposed task branch: `feature/explorer-inspection-mode`. Proposed worktree: `.worktrees/explorer-inspection-mode`. Execution must record actual coordinates, or consume matching runtime-prepared coordinates without creating another worktree.
- Verified planning profile: `PI_CODING_AGENT_DIR=C:/Users/mglenn/.dotfiles/pi/profiles/default`. Intended execution and validation profile: default. Installed Pi documentation examined: 0.99.1. Resolve installed package paths through the current runtime when executing, not a copied package-store hash.
- Existing unrelated changes to preserve: `CHANGELOG.md`, `pi/profiles/default/lib/browser-control.ts`, `pi/profiles/default/skills/browser-tools/SKILL.md`, and `pi/profiles/default/tests/browser-control.test.ts`. Recheck status before editing. Add this task's changelog entry without replacing or staging unrelated entries. The planning process record also must be preserved.

### Required reading

- `pi/README.md`
- `pi/profiles/default/docs/damage-control-port.md`
- `pi/profiles/default/docs/damage-control-setup.md`
- `pi/profiles/default/docs/subagents.md`
- `pi/profiles/default/agents/explorer.md`
- `pi/profiles/default/lib/subagents/launch.ts`
- `pi/profiles/default/extensions/subagent-child.ts`
- `pi/profiles/default/extensions/damage-control/index.js`
- `pi/profiles/default/lib/damage-control/{enforcement,analysis,shell,engine,judge,types}.ts`
- `pi/profiles/default/lib/damage-control/judge-prompt.md`
- Installed `docs/extensions.md` and the permission-gate example; follow affected API cross-references before implementation.
- Use the `pi-extension`, `typescript`, `prompting`, and `testing` skills as applicable.

### Verified starting behavior and limits

Source inspection on 2026-10-05 establishes:

1. `agents/explorer.md` declares file-inspection/search/analytics tools and the parent helper, but no shell. The operator's pasted incident describes assignments requiring live CLI access and reassignment to Developer. That incident was not independently replayed or inspected through historical session logs.
2. `lib/subagents/launch.ts` uses native Pi with `--no-extensions`, explicit extensions and tools, and frozen `PI_SUBAGENT_AUTHORITY`. Damage Control is explicitly loaded for visible and headless children. Developer's native edit/write tools make its read-only assignment a prompt boundary, not enforced write prohibition.
3. Damage Control currently has `default` and `noshell` session modes. Its normal engine allows calls without applicable rules; it is not an inspection classifier.
4. `analysis.ts` supplies `findTrust()` to the shell parser. `analyzeScript()` in `shell.ts` skips body analysis when that normal approval matches. Inspection must disable that shortcut before parsing, not merely reject approvals afterward.
5. Existing effects are useful but not a complete read-only verdict. For example, the network branch can label a URL-bearing request metadata without fully distinguishing HTTP methods/output flags, and arbitrary program analysis deliberately models only selected calls. Native parsed command arguments and supported source bodies may need an inspection-specific local projection.
6. Normal judge evidence excludes parser internals and script bodies. An inspection judge evaluating an unfamiliar script needs its relevant available source, not just the invocation or SHA. Keep this addition inspection-specific and respect existing protected-source read policy and source bounds.
7. The Damage Control bootstrap awaits initialization before installing its tool-call handler. Initialization can throw. Pi's extension contract reports failures and may continue, so granting Explorer shell requires a retained failure blocker for this path, not an assumption that a failed extension prevents execution.
8. Cancellation, pending-call identity, session generation, redaction, and existing offline loader/gate fixtures are already available. Reuse these mechanisms rather than adding a separate monitor or persistent authorization database.

No implementation checks or live judgment evaluations have run for this feature.

## Decisions and implementation contract

### Mode selection and authority

Inspection is a Damage Control enforcement policy selected from frozen Explorer role authority at child initialization. Both launch surfaces use the same rule. Trusted project definitions still control their declared tools; an agent named `explorer` remains inspection-bound rather than escaping through a project override. No launch-tool argument is added that lets the model select a weaker policy.

Freeze the role restriction in the running gate. Do not re-read mutable command-prefix environment variables as authority for each call. Setting `/dc off`, requesting `default`, reloading, retained follow-up instructions, or user text authorizing a mutation must not reduce Explorer's model-tool inspection restriction. Existing operator shell exemptions and controls outside Explorer remain unchanged. A stricter `noshell` setting may still block shell access; changing that setting cannot remove the inspection restriction.

A blocked call returns a normal recoverable tool denial identifying mutation, unresolved inspection status, or review failure. Explorer may use another allowed inspection or report the blocker to its parent for reassignment. It must not receive an approval path that converts a forbidden mutation into permission.

### Classification and judge boundary

Expose an inspection result with three routes: established observation, established mutation, or needs inspection review. Concrete type names and module layout are implementation choices.

- Established observations can pass inspection without a model call. Recognize complete argument forms, not broad executable prefixes. Initial families: ordinary file/text/process inspection, common Git status/diff/log/show queries, selected AWS identity/describe/list/get metadata calls, and Kubernetes get/describe/logs with leading context/namespace options.
- Established mutations are blocked before any judge or normal approval. Cover native edit/write if encountered, file write/delete/truncate actions, mutating Git/cloud/Kubernetes operations, process termination, file-output options/redirections, and intentional temporary-resource creation/cleanup. Memory-local variables, cwd selection within a call, and stdout/stderr routing are not operational mutations by themselves.
- Unfamiliar operations, supported scripts/interpreters, and probes such as TLS diagnostics may be reviewed for observation. `kubectl exec`, HTTP GET, an executable name, or a source hash alone is not proof of observational behavior. AWS `get-*` names also cannot serve as a universal safe prefix.
- Preserve executable contexts versus quoted data so searching for mutation examples does not become a mutation. Inspect pipeline filters that can execute code, such as awk/PowerShell script blocks, rather than treating all text-processing commands as harmless.
- Unknown commands receive the complete pending input and relevant available supported script source through a protected, redacted inspection-only projection. Missing source or unresolved relevant execution remains explicit evidence. Do not execute scripts to discover their effects or invent a general dependency resolver. Bounded supported analysis plus contextual judgment is the accepted best-effort boundary.
- The inspection judge evaluates observation versus mutation, not recoverability or task authorization. It has no tools. An explicit observational verdict permits only the unchanged pending call. Mutation, uncertainty, malformed output, unavailable/disabled judge, timeout, stale result, or cancellation blocks. Explanations distinguish these outcomes.
- Normal script preapproval must never suppress inspection source/body analysis. Do not save inspection verdicts as general script trust or add an approval cache.

Reuse the current shell grammars and request analysis where suitable, adding inspection-only metadata or options rather than silently changing normal classifications. A generic execution wrapper or an absence of modeled mutations is not sufficient for a direct observation allowance.

### Existing protections

Inspection is an additional restriction, not a replacement for protected reads, disclosure rules, sequence checks, or watchdog behavior. An observational call must still satisfy existing Damage Control restrictions. Normal human approval may continue to settle an independently approval-gated read, but cannot override an inspection mutation/uncertainty denial. Existing meaningful-harm judge context and outcomes stay unchanged for normal mode.

Retain a blocking handler when inspection initialization fails so shell-enabled Explorer cannot run unguarded. Keep this correction focused on the new Explorer requirement; do not expand it into a general launcher/readiness redesign.

## Execution guidance

Create or resume the dedicated task worktree, recording actual path/branch and originating integration target before edits. Carry task-owned plan content without discarding its source. Preserve unrelated changes.

Before delegating plan work, consult Strategist unless the user explicitly requests a single-agent handoff, including a Team Lead. A Team Lead retains its own Strategist-first workflow. Assign at most one named task per subagent; split further if a task exceeds a bounded assignment. Use only active catalog roles.

Continue independent work around blockers. Adapt routine mechanisms within settled intent, but ask before changing scope, policy decisions, or acceptance. Keep checkbox/evidence state current. Stop after finite agreed checks pass and demonstrated task-related defects are resolved; no mandatory reviewer sequence or broader audit.

## Tasks

- [x] **T1: Classify complete shell calls for inspection**
  - Depends on: none.
  - Ownership: proposed `pi/profiles/default/lib/damage-control/inspection.ts` and inspection types; inspection-specific changes to `analysis.ts`, `shell.ts`, and `types.ts`; proposed `tests/damage-control/inspection.test.ts` plus affected parser tests.
  - Change: establish the three-route contract and inspection evidence needed by T2/T3. Reuse parsed executable contexts, capture full invocation arguments where needed, and disable normal script trust for inspection. Supply relevant available script source through the existing controlled read boundary. Implement bounded direct observations/mutations for the families above; route unsupported forms to review rather than default allowance. Do not change normal analysis behavior.
  - Complexity/split hint: existing effects intentionally omit some argument semantics and arbitrary-program effects. Do not turn coarse metadata into universal read-only proof. If needed, separate the evidence interface from additional family recognizers before assigning work.
  - Verify: focused inspection/parser/analysis tests using actual grammars and inert inputs. Include Bash and PowerShell; compound reads plus hidden writes; stdout descriptor routing versus file writes; options before cloud/Kubernetes verbs; quoted mutation text; mutating filters; nested interpreters; script-body mutation despite a normal trust match; and an unfamiliar operation routed to review.
  - Done when: downstream consumers can distinguish observation/mutation/review and obtain relevant inspection evidence without changing normal-mode results.
  - Evidence: Committed `6292ac1`. Actual-grammar inspection tests and Damage Control regression suite: 294 passed, 1 skipped; typecheck and diff whitespace passed. Complete request and controlled source/omission evidence exported, unredacted locally; normal script trust disabled only for inspection.

- [x] **T2: Judge unfamiliar operations against the inspection contract**
  - Depends on: T1's committed inspection result/evidence interface, including controlled available script source.
  - Ownership: proposed `lib/damage-control/inspection-judge.ts` and `inspection-judge-prompt.md`; shared `judge.ts` helpers only as needed for reuse; proposed inspection-judge tests. Paths are under `pi/profiles/default/`.
  - Change: implement a tool-free inspection review using existing configured Luna resolution, redaction, deadline, cancellation, and provider behavior. Reuse transport/helpers where practical without changing normal judge's evidence contract. Supply the whole pending call plus relevant available source and honest omission notes. Validate observational/mutating/uncertain results strictly; never let user authorization or recoverability turn mutations into observations. Avoid an independent telemetry system.
  - Verify: real projection and response parsing with provider completion stubbed. Check observation, mutation, uncertainty, source inclusion/redaction, source unavailable, invalid response, disabled/unavailable provider, timeout, cancellation, and stale generation. Confirm normal judge tests retain their existing prompt/projection and outcomes.
  - Done when: an unfamiliar call can receive a scoped observational verdict or a concrete denial reason, with no approval/reuse authority.
  - Evidence: Committed `22ebfd48`. Focused inspection-judge plus normal judge regression tests: 20 passed; typecheck and diff whitespace passed. Tool-free strict verdict, redacted whole-call/source projection, omissions and fail-closed lifecycle/provider outcomes implemented.

- [x] **T3: Enforce role-bound inspection through Damage Control**
  - Depends on: T1 classification and T2 judge implementations.
  - Ownership: `lib/damage-control/enforcement.ts`, `extensions/damage-control/index.js`, and targeted enforcement/bootstrap tests under `tests/damage-control/`.
  - Change: freeze Explorer inspection selection from existing child authority, run its checks before normal permissive shortcuts/approvals, and retain normal protection for allowed observations. Reject native mutations if they reach the gate. Ensure bypass/mode setters and normal script trust cannot weaken inspection. Preserve stricter noshell behavior, cancellation/freshness, and normal-mode controls. Retain the Explorer failure-state blocker if initialization fails.
  - Verify: integrated gate tests with real request analysis and only provider/UI boundaries stubbed. Show read passes, recoverable/temporary mutation blocks without mutation approval, uncertain or failed inspection review blocks, protected reads retain normal restrictions, and `/dc off`/default mode/preapproved scripts cannot remove the role restriction. Exercise initialization failure, retained turns, session/tree invalidation, and late allow results. Contrast with normal-mode allowances.
  - Done when: Explorer model-tool calls cannot bypass inspection through existing Damage Control control paths, and initialization failure leaves them blocked.
  - Evidence: Committed `50de819`. Real analysis gate and bootstrap tests cover frozen authority, controls, protections, stale/cancelled results and real initialization failure. Damage Control suite: 332 passed, 1 skipped; typecheck and whitespace passed.

- [x] **T4: Enable guarded Explorer shells on both child surfaces**
  - Depends on: T3's enforced role-bound policy and failure blocker.
  - Ownership: `agents/explorer.md`, `lib/subagents/launch.ts` and `extensions/subagent-child.ts` only if necessary for authority handoff, plus `tests/subagent-definitions.test.ts` and relevant launch/child fixtures. Paths are under `pi/profiles/default/`.
  - Change: add native Bash and PowerShell tools, keep edit/write/codemode/delegation permissions unchanged, and describe local/live read-only evidence investigation with parent reporting for blocked mutations. Prefer existing authority payload over a new mutable setting. New children receive the change after the normal settled-only reload; do not retrofit active children or add an obligatory tool-confirmation ceremony to every assignment.
  - Verify: actual definition loading and launch construction for visible/headless children, including a trusted Explorer definition and a normal Developer contrast. Confirm explicit Damage Control loading, frozen role selection, shell availability, and absence of new write/delegation authority. Inspect composed Explorer guidance for conflicting local-only instructions and deterministic content.
  - Done when: newly launched Explorer children have guarded shells on both surfaces without gaining other tools or altering other roles.
  - Evidence: Committed `0f7a3bd`. Actual definitions and launch prompt fixtures cover both surfaces, project Explorer vs Developer, frozen tools, Damage Control loading and deterministic guidance. 38 focused tests and typecheck passed.

- [x] **T5: Document, validate, and deliver the completed feature**
  - Depends on: T1-T4 integrated in the task worktree.
  - Ownership: `pi/README.md`, default `docs/damage-control-{port,setup}.md`, `docs/subagents.md`, root `CHANGELOG.md`, targeted offline bootstrap smoke coverage, and this spec's execution/closeout metadata.
  - Change: document the normal versus role-bound inspection policies, examples, denial behavior, no agent bypass, normal operator-shell exemption, activation boundary, and best-effort limits. Preserve the original meaningful-harm purpose explicitly for normal mode. Extend the existing offline supported-loader check with an Explorer observational input and blocked mutation/init-failure evidence without executing submitted operations or contacting services. Add the task changelog entry without overwriting existing browser work.
  - Verify: the finite checks below; fix demonstrated task-related failures. Review the complete plan once for accurate task states and closeout evidence.
  - Done when: checks pass, implementation/spec are archived and committed, authorized integration is complete, completion metadata is committed, and worktree cleanup is verified; or accurately record the no-merge/blocked exception.
  - Evidence: Documentation and offline supported-loader smoke completed. Agreed final tests: 29 files passed, 385 tests passed, 1 skipped; typecheck, check:runtime and root diff whitespace passed. Smoke verifies real Explorer observational allowance, mutation denial and retained initialization-failure blocker without executing submitted operations or model calls. Windows Node 25.9 immediate CLI exit crashed after successful assertions; temporary fixture-only preload preserves exit codes and lets Node drain naturally. Integrated into `main`; completion metadata was committed in `409ae7d3`, and the task worktree was removed after exact-origin retirement.

T1 supplies shared prerequisites. T2 then T3 then T4 are dependent outcomes, not parallel assignments. Documentation can be drafted independently against the fixed contract, but T5's validation and closeout wait for integration. Shared files must have sequential ownership.

## Agreed validation and current handoff

From `pi/profiles/default/` in the task checkout:

```sh
pnpm test tests/damage-control subagent-definitions.test.ts subagent-launch-prompt.test.ts subagent-loader.test.ts subagent-child-outcomes.test.ts
pnpm run typecheck
pnpm run check:runtime
```

Also run `git diff --check` from the task root. Add a newly named focused child/inspection test filter to the first command if it is outside `tests/damage-control/`; do not accidentally omit tests created for T3/T4. No dependency reinstall is required unless actual dependency evidence demands it. Use pnpm only for default Pi TypeScript.

Tests must not execute mutation examples, use real AWS/Kubernetes services, read credentials, or submit private source to live evaluation. Stub only provider/UI boundaries when testing gate decisions; use actual grammars, projections, role definitions, and bootstrap where those are the behavior under test. Automated provider stubs verify wiring and prompt construction, not real model judgment quality. Live judge quality, production cloud diagnostics, and attached-client experience remain non-blocking verification limits, not claimed results.

- Status: Implementation, agreed checks, archival, authorized local integration, completion metadata, and task-worktree cleanup completed.
- Execution coordinates: task `C:/Users/mglenn/.dotfiles/.worktrees/explorer-inspection-mode`, branch `task/explorer-inspection-mode`; recorded target `C:/Users/mglenn/.dotfiles`, branch `main`, starting commit `b926df56192ab0cd2768a19a61730ebaed279da3`. Matching `.pi-plan-run.json` verified. Existing target browser/changelog/failure-log changes remain untouched.
- Completed: source investigation and approved policy decisions recorded.
- Next: None. Closeout is complete; no push or deployment was authorized or performed.
- Blockers/open decisions: None.
- Actual runs: 2026-10-05, default profile, T1-T4 task commits `6292ac1`, `22ebfd48`, `50de819`, `0f7a3bd`; focused and final agreed automated checks passed as recorded above. No live model judgment, server probes, credentials inspection, push or deployment. Live quality and attached-client experience remain unverified non-blocking limits.

## Closeout

- [x] Implementation and agreed checks completed.
- [x] Entire spec archived and committed with task changes.
- [x] Integrated into the recorded target, unless intentionally skipped by `--no-merge`.
- [x] Completion metadata reconciled and committed in `409ae7d3`.
- [x] Clean task worktree removed and cleanup verified after exact-origin retirement.

After implementation and agreed checks pass, record integration pending, confirm `.specs/archive/explorer-inspection-mode/` does not contain another spec, move the whole spec directory there in the task worktree, repair affected links, and commit implementation plus archived spec. Do not archive unfinished implementation. Keep actual task/evidence/handoff state consistent with closeout, not just frontmatter.

For authorized `/do-it`, dispatch Integrator from the recorded target checkout after the task commit using the runtime closeout manifest. Integrator owns local integration and cleanup. Direct/run-here execution keeps operator questions and final reporting parent-owned. A matching runtime-prepared Herdr run uses its same-tab successor: establish integration readiness, finish explicitly authorized orchestrator-only obligations, release the exact origin for graceful retirement, then cleanup/report from the surviving Integrator. Do not create replacement worktrees or replace the recorded target. Readiness alone is not completion.

If blocked before retirement, preserve both panes/worktree; if cleanup fails afterward, retain the exact path and report it without rollback or recreating the orchestrator. Routine merge conflicts remain agent-owned. For `--no-merge`, do not dispatch Integrator for mutation; retain committed work intentionally. Push/deployment remain unauthorized. Operator manual/live testing never blocks archival, local commit, or authorized integration.

The Integrator verifies target/archive, records actual completion date/status/evidence and reconciles unfinished task/handoff prose, commits completion metadata, then removes the clean task worktree. Record any blocker with its concrete reason, next action, and action owner; do not mark pending integration or cleanup complete.

### Final execution response

Lead with one explicit outcome:

- 🟢 **COMPLETED**: passed checks, integrated changes, committed completion metadata, verified cleanup.
- 🔴 **NOT COMPLETE: MERGE BLOCKED**: implementation committed but integration blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED**: name the consequential question/prerequisite.
- 🔵 **IMPLEMENTED: MERGE SKIPPED AS REQUESTED**: checks passed and committed work intentionally retained under `--no-merge`.
- 🟡 **CLEANUP PENDING**: integration and completion metadata succeeded, cleanup remains.

For a blocked or cleanup-pending outcome, immediately give **Reason** and **Action needed**, including owner and exact next action, before passed-check summaries. Then report concise checks, archived spec path, branch/commits, merge result, and any retained worktree/remnants. Never imply automatic resumption or hand available agent-owned work back to the user.

## Integration evidence

Agreed pnpm tests: 29 files, 385 passed, 1 skipped; typecheck passed; check:runtime supported-loader Explorer observation/mutation/init-failure checks passed; root git diff --check passed. No live model judgment or service probes; no push/deployment authority.
