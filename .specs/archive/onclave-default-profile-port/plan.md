---
created: 2026-09-07
status: completed
completed: 2026-09-07
---

# Port Onclave orchestrator communication to default Pi

## Goal and scope

Make Onclave communication available between the orchestrators of independent default-profile Pi instances, using the existing Onclave adapter rather than a second implementation. Keep routine communication automatic and low-ceremony on the operator's protected VLAN/tailnet.

### User requirements

- The orchestrator is the primary model the user interacts with in a Pi instance.
- Onclave is for orchestrator-to-orchestrator communication across independent Pi instances. Subagents must not use it to communicate with subagents or other instances.
- Onclave and subagent behavior belongs in their respective tooling instructions, not global `AGENTS.md`. The global orchestrator definition is already recorded.
- Trusted incoming requests may start a turn when idle; when busy, queue until current work finishes. Informational messages do not trigger turns.
- Prefer simple communication over preserving legacy security gates and ceremony automatically. No routine cross-host confirmation prompts for this closed-system workflow.
- Restart/resume recovery of pending conversations is not required for this port.
- Live two-instance/service validation is the operator's post-implementation work. It is not a plan task, completion gate, or reason to keep the plan open.

### Non-goals

- Implementing subagents, delegation, orchestration registries, or a replacement execution pool.
- Porting legacy metrics, Herdr, transcript tracing, or session hooks as dependencies.
- Redesigning the broker, adding protocol versions, MCP, full A2A support, webhooks, or other adapters.
- Adding persistent adapter queues/correlation, a trust framework, or a new setup wizard.
- Adding pause/connect/disconnect commands: these were suggestions, not selected requirements. Keep the existing `/onclave` status command.
- Changing `/yt`, `/yt-local`, live service configuration, infrastructure, or site secrets.
- Rollback work, deployment, and live broker testing. Git authorization was expanded by the subsequent worktree/merge request.

Authorization: the operator subsequently requested implementation in a worktree, merge back to the original checkout, and plan archival. Local commits/merges are authorized; Onclave publication precedes the parent gitlink under repository rules. No dotfiles push or deployment is authorized. The user's subsequent decisions override this document. Keep unapproved optional work outside the checklist and completion criteria.

## Context for a fresh session

All paths below are relative to the dotfiles repository root unless explicitly identified as module-relative. Re-read applicable instructions and current Git state before acting.

### Ownership and required reading

- Dotfiles: root `AGENTS.md`, `pi/profiles/default/AGENTS.md`, `pi/README.md`, and `pi/profiles/default/skills/testing/SKILL.md`.
- Onclave, all relative to `modules/onclave/`: `AGENTS.md`, `README.md`, and `docs/extensions/onclave-pi/{PRD,implementation-plan,status}.md`. Historical documentation is evidence, not authority over the operator decisions above.
- Adapter source, all relative to `modules/onclave/extensions/onclave-pi/`: `src/onclave-pi.ts` and `src/lib/{delivery,correlation,connection,framing,run-summary,subagent-eligibility,bws,http-client,http-signer,policy}.ts`.
- Existing adapter tests: `modules/onclave/extensions/onclave-pi/tests/`. Shared wire contracts: `modules/onclave/packages/envelope/src/a2a.ts`.
- Legacy loader: `pi/profiles/legacy/extensions/onclave-pi.ts`. Default integration: `extensions/{tool-search,tool-visibility,operator-footer}.ts`, `lib/tool-activation.ts`, `vitest.config.ts`, and `scripts/usage-smoke.mjs`, all under `pi/profiles/default/`.
- Before implementation, read the installed Pi extension documentation and relevant examples completely, following its relevant API references. Verify session lifecycle, tool guidance, `sendMessage` follow-up behavior, and assistant error/abort fields against the installed SDK, not older assumptions.

Dotfiles owns only the loader, profile integration, and coordinating plan. Adapter implementation and its contracts/tests remain in `modules/onclave/`. Infrastructure and secrets remain with `modules/homelab-infra/`; no changes there are planned.

### Verified starting state, 2026-09-07

- Default has no Onclave loader. Legacy dynamically imports the module adapter and adds optional startup-metrics hooks. The adapter can register without those hooks.
- The module checkout is clean but **detached at `7858190`**, contrary to the required branch invariant. The existing local `feature/v2-broker-core` branch tracks `origin/feature/v2-broker-core`. Do not build on detached HEAD or switch to `main`.
- Adapter currently exposes two tools (`onclave_instances`, `onclave_message`), `/onclave`, and `--onclave-id`/`--onclave-url`. It registers on session start, reconnects through `HttpLink`, receives by long polling, and publishes footer status under `onclave-v2`.
- `isPiSubagent()` prevents registration for `PI_SUBAGENT_RUN_ID` or `PI_SUBAGENT_TREE_RUN_ID`. Preserve this existing eligibility check without implementing future subagents.
- Incoming delivery currently confirms cross-host requests unless a profile-local host allowlist accepts them. Same-host requests do not prompt.
- Incoming turns already use `sendMessage(..., { triggerTurn: true, deliverAs: "followUp" })`; informs use `triggerTurn: false`. Verify the installed Pi queue semantics before adding any queue machinery.
- The reply path marks tasks completed at `agent_end` without checking assistant stop reason. Correlation, deduplication, and pending waits are memory-only. Status delivery currently ignores the boolean correlation result when deciding whether to deliver a turn.
- Correlation source warrants focused checking: `acceptStatus()` resolves an active waiter for intermediate states too, and `clear()` clears timers without resolving waiters. These are source findings, not reproduced runtime failures.
- Endpoint precedence is flag, `ONCLAVE_API_BASE`, then BWS bootstrap. Requests use the existing SSH signing implementation. This is not a request to inspect private keys or secret values.
- Adapter audit state uses `getAgentDir()`. Default footer already includes extension status slots, so do not presume a footer rewrite is necessary.
- Default `tool_search` can reactivate any registered tool, including one hidden by the adapter. Connection readiness must be checked in execution, not inferred from tool visibility.
- Module package manifest declares Pi `^0.75.4`; the current default installed Pi is `0.85.0`. Actual loader compatibility must be checked. Do not upgrade unrelated dependencies as part of the port.
- Existing tests use Vitest; default aliases Pi to `tests/pi-web-api.ts`. A passing aliased unit test is not proof that the actual loader resolves the module and workspace packages.

### Existing work to preserve

At planning time, unrelated Damage Control code/tests/docs and its failure-log entry are dirty. The orchestrator definition, AIF-011 feedback entry, and changelog wording were changed earlier in this conversation. Preserve these and any concurrent work; recheck status before editing. Do not copy module files into dotfiles or overwrite shared logs/changelog wholesale.

### Pi profiles

- Planning profile: verified `PI_CODING_AGENT_DIR=C:\Users\mglenn\.dotfiles\pi\profiles\default`, portable path `pi/profiles/default/`, selected by bare `pp`.
- Intended implementation profile: default. Intended validation: module-owned offline checks plus default-profile checks and an isolated offline loader smoke test.
- Legacy loader/configuration is not being migrated or rewritten. Shared adapter changes also reach legacy because it loads the same implementation. In particular, prompt simplification and reply correctness changes are shared behavior; do not claim legacy runtime is entirely unchanged or fork the adapter to preserve old ceremony.

| Date | Actual profile/path | Work or check | Result |
| --- | --- | --- | --- |
| 2026-09-07 | default / `pi/profiles/default/` | Source inspection and planning | No implementation, runtime test, network/service validation, or dependency installation |
| 2026-09-07 | default; code under `.worktrees/onclave-default-port/` | Module typecheck/unit suite, default typecheck/3 tests | Passed: 229 module tests, 1 existing skip; affected 27 tests repeated after test-output isolation |
| 2026-09-07 | isolated temporary empty profile, installed Pi 0.85.0 | Default Onclave loader smoke | Passed in worktree and original checkout after merge/dependency setup; registered real module tools/command/hooks with no session, credentials, provider, or service calls |

## Decisions and contracts

### Communication contracts

The role, incoming-turn, and validation decisions are operator-selected. The two-tool/message interface and timeout semantics are existing contracts to retain. Reply/correlation corrections below support the agreed reliable-response behavior; they do not add a new workflow.

| Area | Contract |
| --- | --- |
| Roles | Only independent Pi orchestrators register and communicate. Put this guidance on Onclave tools; preserve existing child-process exclusion. Future subagent tooling must enforce its own side of this boundary. |
| Inbound requests | Receive without routine host confirmation. Start while idle, follow up after current work while busy; never steer or interrupt the current turn. Reuse Pi's queue. |
| Inform | Point-to-point or broadcast; no task, no reply expectation, no turn. |
| `ask` | Address one instance and wait once for its correlated direct reply or input-required/terminal task outcome. Intermediate status must not finish the wait. Keep the existing bounded timeout; timeout does not mean cancellation or delivery failure. |
| `request` | Return publication identifiers after publication. Publication is not receiver acceptance or task completion. Deliver later correlated outcomes to the originating orchestrator. |
| Outcomes | Preserve identity/context/task IDs. Report actual assistant execution errors/aborts rather than publishing success merely because an agent run ended. Unrelated user turns must not produce Onclave replies. |
| Status events | Only outcomes correlated to this running instance's outbound work may initiate follow-up turns. Unmatched status can be displayed without starting work. No restart recovery is implied. |
| Shutdown | Stop poll/retry/heartbeat work, settle pending local waits, and release session-owned state. Do not add persistent recovery. |
| Validation | Offline checks are implementation acceptance. The operator performs live checks separately after completion. |

### Implementation defaults, not additional product requirements

- Preserve existing automatic session registration and transient reconnect behavior. Configuration failure should leave ordinary Pi use available and report a useful Onclave-specific error, not launch an interactive setup flow.
- Keep the two-tool interface, current flags, and `/onclave` status. Keep the `onclave-v2` status slot and existing profile-local audit location; no new analytics subsystem.
- Remove adapter host-confirmation/allowlist ceremony from this communication path. Keep existing wire validation, message deduplication, and peer framing as reliability/context boundaries without adding security hardening.
- Retain the existing signed API transport and endpoint lookup for compatibility with the service. Removing transport authentication is not necessary to eliminate confirmation prompts and would widen this into a service change. If inspection demonstrates that the existing bootstrap cannot work for default, report the concrete incompatibility rather than inventing another credential system.
- Keep existing task states and message schema. For observed assistant error use `failed`, abort use `canceled`, normal successful completion use `completed`, subject to the existing legal transitions. Do not invent a natural-language classifier to guess `input-required`; preserve handling of explicit protocol events and document any unsupported emission rather than advertising it.

No new user decision blocks plan authoring. T1 resolves factual compatibility/branch questions before code changes. A service/protocol redesign or materially different acceptance behavior requires a scope decision, not silent expansion.

## Execution guidance

**Before expanding work:** Which existing requirement needs this addition, and what evidence justifies it? Do not turn optional improvements into tasks or completion criteria.

**At scope checkpoints:** Check whether recent work advances the agreed requirements or has drifted into repeated verification, speculative cases, or unnecessary complexity. Continue required work without starting another audit.

**Recovery when drift is found:** Stop the detour and remove unnecessary code, tests, and plan items introduced during this task without disturbing pre-existing or concurrent work. Resolve cleanup independently; note anything that cannot be safely removed in the final handoff. Restore the agreed completion criteria and resume the next required step.

## Tasks

- [x] **T1 — Establish the owning checkout and installed-Pi compatibility**
  - Depends on: implementation authorization.
  - Inputs: repository instructions, current module Git state, both package manifests, installed Pi API/docs, module adapter and default loader-smoke pattern.
  - Do: inspect ancestry and restore the module to its required tracking `feature/v2-broker-core` branch using only a safe attachment/fast-forward that preserves the pinned commit and existing work. Fetch branch metadata if needed; no reset, force, rebase, or alternate branch. If histories differ, record the exact blocker instead of discarding commits.
  - Do: verify actual installed dependency versions, workspace resolution, lifecycle events, follow-up queue semantics, and tool-registration API using the smallest offline import/registration experiment. Record the concrete hook/stop-reason mapping for T3 here. Do not read secrets or connect to the live API.
  - Verify: branch/upstream/cleanliness evidence and an offline loader result or exact compatibility failure. Confirm available module checks from `package.json` and Vitest configuration.
  - Done when: implementation can proceed on the owning branch with a known loader path and event contract. Repair only compatibility issues required by this port in subsequent tasks. If blocked, record the cause and leave this task unchecked.
  - Evidence: Canonical module attached to tracking `feature/v2-broker-core` and pulled to `39150c4`; implementation used the operator-requested separate module worktree branch `feature/default-profile-port`. Pi 0.85.0 docs/source confirm native follow-up queuing, inert triggerTurn:false, and agent_settled after retries. Module dev/peer versions updated from 0.75.x to 0.85.x because old types lack agent_settled.

- [x] **T2 — Simplify adapter communication and attach the tooling guidance**
  - Depends on: T1.
  - Files, relative to `modules/onclave/extensions/onclave-pi/`: `src/onclave-pi.ts`, `src/lib/{delivery,policy,framing,subagent-eligibility}.ts`, and existing `tests/`.
  - Do: remove routine cross-host confirmation and host-allowlist dependency from incoming communication. Remove policy code/tests only if now unused; do not remove unrelated service policy or audit implementation.
  - Do: add concise tool descriptions/guidelines defining orchestrator-to-orchestrator use and excluding subagents. Do not add Onclave/subagent instructions to global `AGENTS.md`.
  - Do: preserve direct/broadcast message contracts, automatic registration, transient reconnect, existing wire authentication, and profile-local paths. Require a registered, connected runtime when executing communication tools, including when `tool_search` has exposed them while offline.
  - Verify: focused adapter tests show a cross-host request causes no confirmation, informs remain inert, normal instances register, both existing child markers register nothing, and offline tool execution reports unavailability without publishing.
  - Done when: trusted communication has no routine adapter approval ceremony and tooling carries the role boundary.
  - Evidence: Removed adapter policy/confirmation path; tooling defines orchestrators and excludes subagents. Existing child markers still prevent registration. Execution checks actual connection independently of tool visibility. Tests pass.

- [x] **T3 — Make incoming turns and replies match the communication contract**
  - Depends on: T1 and T2.
  - Files, relative to `modules/onclave/extensions/onclave-pi/`: `src/onclave-pi.ts`, `src/lib/{delivery,correlation,run-summary,connection}.ts`; existing `tests/` plus focused new adapter test files as needed.
  - Do: reuse installed Pi follow-up delivery for idle/busy behavior. Do not add a parallel scheduler or queue. Verify that accepted work/replies remain matched when more than one peer message is pending; avoid acknowledging success for work not handled by the matching run.
  - Do: reproduce and fix the scoped reply/wait issues: intermediate status ending an `ask`, unmatched status initiating turns, errors/aborts reported as completion, and waits left unresolved on shutdown. Keep message/task correlation correct across repeated exchanges in one context; verify a task continuation cannot satisfy the wrong pending ask.
  - Do: ensure session replacement/shutdown closes old runtime activity before it can publish into the replacement session, and retain transient reconnect without duplicate receiver loops. No persistent recovery or exactly-once-across-restart claim.
  - Verify: exercise the real delivery/correlation logic with external transport and Pi boundaries substituted narrowly. Cover direct ask/reply, asynchronous request/outcome, inert inform, busy follow-up, success/error/abort, intermediate/unmatched status, shutdown with a pending wait, and existing reconnect behavior. Assert results and publications, not only hook registration.
  - Done when: the selected contracts work within a running session and its transient reconnect lifecycle. Record explicit limitations instead of extending task/protocol semantics.
  - Evidence: Native follow-up delivery retained; settled replies are partitioned by incoming messages, errors/aborts map to failed/canceled, intermediate/unmatched status does not complete asks/start turns, shutdown settles waits and stops activity. Existing trace_id carries each exchange ID in direct replies; status message_id identifies the originating exchange. No wire schema change or persistent recovery. 55 focused adapter tests passed.

**Scope checkpoint:** The adapter should still be a two-tool communication integration. Do not add a trust framework, autonomous worker system, persistent inbox, extra operator controls, or a broker redesign.

- [x] **T4 — Wire the shared adapter into default Pi**
  - Depends on: T2 and T3.
  - New proposed files: `pi/profiles/default/extensions/onclave-pi.ts`, `pi/profiles/default/tests/onclave-pi.test.ts`, and `pi/profiles/default/scripts/onclave-smoke.mjs`.
  - Existing inputs: legacy loader, default `extensions/{tool-search,tool-visibility,operator-footer}.ts`, `vitest.config.ts`, and loader-smoke pattern.
  - Do: add a thin portable loader that resolves the owning module from the repository, as the legacy loader does, but without importing legacy startup metrics. Keep implementation source in Onclave and preserve the optional module entrypoint hooks used by legacy.
  - Do: verify existing generic footer handling displays `onclave-v2`. Change footer/tool integration only for a demonstrated incompatibility; do not add another status registry or activation owner.
  - Do: use existing pnpm dependencies/workspace links where sufficient. Any necessary dependency adjustment belongs in the owning package, with lockfile changes only when needed. Do not duplicate the module package into default.
  - Verify: default test covers loader resolution/registration without requiring live services. New smoke follows the existing real installed-Pi loader pattern with a temporary isolated profile, no credentials, no provider calls, and no broker connection. Confirm both tools and `/onclave` register through the actual module import, not a mocked replacement adapter.
  - Done when: default loads the same adapter implementation, the source resolves under installed Pi, and unrelated default tools/statuses remain intact. Legacy loader/config files remain untouched.
  - Evidence: Added thin asynchronous default loader, 3 passing resolution tests, and real installed-Pi 0.85.0 offline loader smoke. Existing generic footer already accepts onclave-v2; footer/activation infrastructure and legacy loader were not changed.

- [x] **T5 — Document the port and finish the bounded offline checks**
  - Depends on: T4.
  - Files: proposed `pi/profiles/default/docs/onclave.md`, `pi/README.md`, module `README.md` and relevant adapter contract/status docs, root `CHANGELOG.md`.
  - Do: document automatic connection, current endpoint/bootstrap prerequisites, two tools and message behavior, idle/busy delivery, `/onclave` status, errors and timeout semantics, shared-adapter effects on legacy, and no restart recovery. Correct stale loader-path references where touched. Keep secrets out of docs.
  - Do: describe only implemented task outcomes. State that trusted-network prompt simplification is intentional and that live validation is operator-owned after implementation. Do not add a live acceptance checklist or deployment gate.
  - Verify from `modules/onclave/`: `pnpm run check` (existing broker-free typecheck/unit suite). For targeted development use `pnpm test extensions/onclave-pi/tests`; do not run `just test-integration` or broker-backed suites for this plan.
  - Verify from `pi/profiles/default/`: `pnpm run typecheck`, `pnpm test onclave-pi.test.ts`, and proposed `node scripts/onclave-smoke.mjs`. Include an existing directly affected test file only if its production surface changed.
  - Verify: `git diff --check` separately in dotfiles and Onclave. Distinguish unrelated pre-existing failures from failures introduced by the port; do not repair unrelated Damage Control work to obtain a green aggregate result.
  - Done when: finite checks pass for the changed scope and documentation matches actual code and the operator decisions. If a pre-existing failure blocks verification, record it precisely and leave the affected check/task incomplete unless the operator changes acceptance. Do not claim a failed check passed.
  - Evidence: Module `pnpm run check` passed (typecheck, 229 passed/1 pre-existing skipped across 27 test files). Default typecheck, 3 loader tests, installed-Pi 0.85.0 offline smoke, and both diff checks passed. After isolating test audit output, the affected 27 tests passed again; generated test files were removed. Docs/changelog describe implemented behavior and operator-owned live verification. No live broker/service checks performed.

**Scope checkpoint:** Stop when the agreed offline checks pass. Live service testing belongs to the operator and must not delay completion. Do not begin another security or edge-case audit.

- [x] **T6 — Record implementation results and archive the plan**
  - Depends on: T5.
  - Files: this plan and any inbound links to it.
  - Do: summarize changes by owning repository, actual profile/version used for validation, check results, and remaining limitations. Explicitly state that no live verification was performed. Record module and parent integration commits under the later worktree/merge authorization.
  - Done when: all required implementation/check evidence is recorded, no scope-required task remains, and the plan is completed/archived as below. The operator's later live check is not outstanding implementation work.
  - Evidence: Adapter `ceed8c3` committed, merged to tracking feature/v2-broker-core, and published before parent integration `985d748e`. Concurrent main commits were merged into the worktree, then original main fast-forwarded to `20e43e89`. Changelog conflict retained both entries; concurrent Damage Control work and dirty Herdr plan/investigation were preserved. Canonical module frozen dependencies installed and original-checkout offline smoke passed. Plan archived on 2026-09-07. Dotfiles was not pushed; no live validation performed.

## Agreed validation and finish

T2/T3 own behavioral checks; T4 owns real-loader integration; T5 owns the final finite offline commands. Mock external I/O where necessary, but do not replace the delivery/correlation code being tested. Passing offline tests is not evidence of deployed-service compatibility.

Do not repeatedly run full suites after unrelated edits. Fix demonstrated relevant failures and rerun affected checks. No network credentials, live Pi instances, broker containers, or infrastructure changes are required for acceptance.

If Git actions are later authorized, follow repository rules: pull inside the module before updating the parent pin, commit/push Onclave first, then commit the parent gitlink; never force-push, amend, or rebase an already-pushed module commit. Git publication is not part of this plan's completion criteria.

## Current handoff

- Status: completed on 2026-09-07; all tasks and offline checks complete, merged back and archived.
- T1–T6 complete. Onclave commit `ceed8c3` was fast-forwarded into canonical `feature/v2-broker-core` and pushed before the parent gitlink commit.
- Worktrees: dotfiles `.worktrees/onclave-default-port` (`feature/onclave-default-port`), nested module worktree (`feature/default-profile-port`). Original checkout remains `main`; unrelated concurrent edits must be preserved during merge.
- Parent integration `985d748e` reached original `main` through `20e43e89`. Original-checkout installed-Pi smoke passed after frozen module dependency setup. No implementation steps remain.
- Live verification remains operator-owned after implementation and is outside plan acceptance.
- Verification limits: no live service, credentials, or broker-backed suite validated. The operator handles live verification separately; no restart/reload recovery promised.

## Completion and archive

When the described implementation and agreed offline checks finish, set `status: completed` and `completed: YYYY-MM-DD` above, record actual profile runs, and move this entire directory to `.specs/archive/onclave-default-profile-port/`. Check that the destination does not exist, repair inbound links, and confirm the active copy is gone. Do not overwrite another archive. Leave incomplete/blocked work active. Archiving does not authorize commits, pushes, deployment, or removal of unrelated work.
