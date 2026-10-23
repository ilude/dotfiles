---
created: 2026-10-23
status: completed
completed: 2026-10-23
---

# Use native Herdr for same-server session communication

## Goal and settled scope

Make the existing tools and instructions agree on how independent agent sessions communicate:

- Use native Herdr agent operations for sessions on the **same connected Herdr server**, including supported non-Pi CLI agents. The boundary is the server, not the machine.
- Use Onclave for supported agent instances outside that server. Onclave is not a universal transport for arbitrary remote CLI sessions.
- Keep owned delegation on `subagent` / `subagent_control`. Keep Onclave registration, service/vault tools, and terminal callbacks unchanged.
- Resolve supplied Onclave IDs to live sessions on the connected Herdr server. Mentioning an Onclave ID identifies the session, not the transport: when the session is present here, existing Herdr operations must find and address its current pane. Expose pane/tab/workspace context so the session is recognizable.
- Fix demonstrated Herdr wrapper identity and presentation defects so the model can select the intended session and interpret the result accurately.
- Use plain prompts, native lifecycle waits, and terminal reads. No new message action, envelope, receiver extension, correlation store, facade, broker, or automatic reply service.

The operator rejected the earlier protocol-based draft as over-engineered and authorized simplifying and reviewing this plan. “Mike's way” here means following the existing repository rules: investigate actual capabilities, use native operations, implement the requested outcome, fix evidenced defects, and stop. Do not turn usage limitations into new safeguards, workflow gates, or approval questions.

Planning is not implementation authorization. `/do-it` authorizes implementation, dedicated task worktrees, local commits, and local integration unless `--no-merge` is specified. Push and deployment require separate authorization.

Non-goals: Pi/Herdr upgrades, remote deployment or inventory, Pi Durable, Onboard, changing agent CLI input behavior, new Claude-side configuration, new delegation restrictions, Onclave core/protocol changes, and any access to `pi/profiles/legacy/`.

## Fresh-context handoff and evidence

Paths are dotfiles-root-relative unless prefixed with `modules/onclave/`. Read current root/default instructions and the Onclave module's instructions for its changes.

Owners:
- Dotfiles owns `pi/profiles/default/lib/herdr-agent.ts`, `extensions/herdr-tools.ts`, their tests, the Herdr skill, profile docs, and root `CHANGELOG.md`.
- `modules/onclave/` owns the Pi adapter and its tool guidance. Keep its branch attached to and tracking `origin/feature/v2-broker-core`. Commit its changes before pinning the gitlink in dotfiles. Do not duplicate adapter code in the loader.

Read the files above plus `pi/profiles/default/docs/{herdr,onclave}.md`, `pi/profiles/default/skills/herdr/SKILL.md`, `pi/profiles/default/tests/herdr-tools.test.ts`, and `modules/onclave/extensions/onclave-pi/src/onclave-pi.ts`. Use the prompting/pi-extension skills and installed docs for the actual APIs being changed. Relevant feedback: AIF-086 in `pi/profiles/default/skills/agent-process/references/instruction-feedback.md`, including its 2026-10-23 recurrence.

Verified investigation, 2026-10-23:
- Fable planning inspected Herdr client/server 0.9.5 and installed Pi 1.3.0 using source, documentation, and read-only Herdr inventory. No live prompts or mutations were performed.
- Native `herdr agent` supports prompt/read/wait/send-keys. Prompt submits terminal text plus Enter. Acknowledgment is not an answer, and a lifecycle wait does not identify a particular prompt's completion.
- Busy Pi input can steer current work; blocked agents reject prompt submission. These are native semantics to describe, not reasons to replace native communication.
- Live inventory had unnamed Pi agents with `agent: "pi"`, lifecycle status, pane/tab/workspace IDs, cwd, and `agent_session.value` containing the session path. The wrapper currently mistakes `agent` for a live name and `agent_session.kind: "path"` for agent type. Its fixtures do not reflect that live shape.
- `extensions/herdr-tools.ts` requires `name` in inventory schemas and renders a waited prompt as “prompt completed”. Both need alignment with actual native results.
- Onclave's schema is `request | response | note`, without outbound waits. `docs/onclave.md` still describes old `ask/request/inform` behavior.
- Onclave's default instance ID is `pi-<session UUID>`; its short alias is `pi-` plus the first eight characters of the UUID's final segment. Fable's review confirmed these against `buildAgentCard`/`shortInstanceId`. Herdr's native session metadata supports this default identity lookup without a registry, but carries no authoritative mapping for `--onclave-id` overrides. Such overrides are not resolvable by this mechanism. Derived IDs do not establish registration: label them accordingly, for example `onclave_default_id` and `onclave_alias`.
- Keep this published identity-format conversion self-contained in the Herdr wrapper, with a source comment identifying the Onclave functions and a known-UUID fixture. Do not import the Onclave adapter or its dependencies into Herdr tools. This implements the public ID format at the consumer boundary, not a second adapter or copied product implementation.

Preserve the untracked `.specs/browser-agent-reliability/`, the feedback-log change, and all other existing work. Another independent Herdr tab owns remote-host readiness; do not duplicate its investigation.

Originating checkout: `C:/Users/mglenn/.dotfiles`, branch `main`. Proposed execution branch/worktree: `herdr-onclave-session-comms` / `.worktrees/herdr-onclave-session-comms`; record actual coordinates at execution. Consume runtime-prepared coordinates if present, without creating a second worktree.

Planning and intended execution profile: `pi/profiles/default`. Initial exploration recorded dotfiles `c5ef1012`, Onclave `a02f308`; recheck current state rather than treating these as required pins. No proposed behavior has been tested.

## Native workflow and instruction ownership

The interface stays `herdr_agent` with its current actions and parameter names:

1. Discover sessions with `list`; use native labels, cwd, agent type, and session identity to identify the intended target. Existing targeted `herdr_agent` operations accept an exact pane ID, real unique live name, or resolvable Onclave ID/short alias. Resolve Onclave references through the connected server's current inventory to the exact pane before invoking the native operation. Return the resolved identity and pane/tab/workspace context so the route is understandable. No new routing tool or Onclave call is needed for a known local match. Ambiguous matches require disambiguation; lookup failure does not prove a target is remote. Native lookup errors remain errors, not empty inventories.
2. Use `prompt` with an ordinary brief. When a reply back is useful, include the originating pane and ask the recipient to return it through Herdr. This is plain-language coordination, not a machine-parsed protocol or guaranteed callback.
3. Use existing bounded `wait` and `read` when the answer is needed now. Read the actual answer before claiming completion. Do not use repeated polling loops, infer completion from idle alone, or blindly resubmit after an ambiguous timeout.
4. Preserve native busy/blocked/draft-editor behavior. Explain that terminal injection is not a separate inbox and can interact with the recipient's current work or draft. Do not add a blanket idle-only gate, receiver hook, or automatic retry/fallback.
5. Route targets outside the connected server through Onclave when supported. Do not automatically change routes on error. Herdr `--machine` forwarding is not the selected interface in this plan.

Peer requests and terminal output are reference/task input, not new operator authority. Express that in concise usage guidance without claiming terminal text has authenticated origin or altering Damage Control.

Guidance belongs with the owning tools. The Herdr tool description/guidelines own route selection and result meaning; the always-visible Herdr skill description makes intersession communication discoverable; the skill body gives the short workflow; docs explain native limits. Onclave adapter descriptions/guidelines state the complementary route. No global AGENTS.md expansion or new role/tool authority is required. Keep the existing explicit-user-direction requirements for independent-session communication and existing subagent permissions unchanged.

## Implementation tasks

- [x] **T1: Correct native Herdr discovery and result presentation**
  - Depends on: none.
  - Files: `pi/profiles/default/lib/herdr-agent.ts`, `pi/profiles/default/extensions/herdr-tools.ts`, `pi/profiles/default/tests/herdr-tools.test.ts`.
  - Distinguish a real optional live name from agent type. Derive agent type from native agent fields, never from session-path kind. Retain exact pane identity and lifecycle state. Expose useful existing labels, pane/tab/workspace coordinates, Pi session UUID, and the corresponding default Onclave ID/short alias from native responses. Reuse existing layout information where practical. Do not add per-workspace discovery loops, native renaming, alias registration, or a registry. Labels absent from one response can remain optional.
  - Add bounded target resolution inside the existing wrapper for supplied Onclave full IDs and short aliases, using actual Pi session identity in current native Herdr inventory. Apply the same resolution to targeted get/read/prompt/wait/sendKeys actions so an Onclave reference can directly address the local session. Preserve native pane/name targeting and pass the resolved pane to Herdr. Only `pi-`-form targets need the additional identity lookup; ordinary pane/name targets keep their current direct path. For these lookups, exact native names remain valid, but if a native name and a derived identity select different panes, return ambiguity with candidate context rather than choosing precedence. Multiple derived matches are likewise ambiguous; a name and alias selecting the same pane are one match. Do not match fuzzily, route through another server, or treat unavailable/truncated inventory as a definitive no-match. Use the complete fetched native inventory before display truncation. Missing references produce useful no-local-match errors, not remote claims. Do not discover custom-ID mappings through Onclave or add registration machinery.
  - Correct `herdr_layout list`'s pane mapping and collapsed renderer too: distinguish `agent_name` from native agent type, populate `kind` from native fields, and prefer real names/labels over a generic `pi` type in presentation. `pane list` supplies pane labels; reuse it for enriched agent discovery where needed, without per-workspace loops.
  - Update schemas and renderers consistently, including any duplicated inventory shape. Prefer recognizable labels/name/cwd/type in collapsed output while retaining exact IDs in model-visible results and expanded details. Keep current bounds and input actions.
  - Replace “prompt completed” with wording that accurately reports submission and observed settled state, not a correlated answer. Render `wait`'s actual nested agent status instead of stringifying its response object as `[object Object]`. Preserve native errors.
  - Checks: existing `herdr-tools.test.ts` with live-shaped unnamed/named agent and pane fixtures, optional-field behavior, output-schema compatibility, nested `agent wait` status, corrected waited-prompt wording, and full-ID/short-alias resolution to the correct native pane. Cover ambiguous and absent references with no prompt submitted, including a native-name/alias conflict, and preservation of direct pane/name targets. Use the existing test file; no new live-test harness.
  - Done when mentioning a default Onclave ID or unique short alias can get/prompt/read the matching local session through the existing Herdr actions, discovery supplies recognizable pane/tab/workspace context, inventory no longer mislabels `pi` as a unique name or `path` as agent type, and result wording does not claim work completed from lifecycle alone.
  - Evidence: Implemented optional live names versus type, pane-list enrichment, Pi UUID and derived default IDs/aliases, complete-inventory resolution for every targeted action, contextual ambiguity/no-match errors, layout mapping, and lifecycle presentation. Results expose `pane_id`, optional `tab_id`, `workspace_id`, `label`, `tab_label`, `workspace_label`, `cwd`, `pi_session_uuid`, `onclave_default_id`, `onclave_alias`; resolved actions add `requested_target` and `resolved_agent`. Final `pnpm test herdr-tools.test.ts`: 31 passed; final default `pnpm run typecheck`: passed (2026-10-23). Existing tests cover live-shaped named/unnamed inventory, schemas, all identity-targeted actions, full-inventory matching, ambiguity/name conflicts/no-match/incomplete/unavailable inventories with no prompt submission, direct targets, and rendering. No live prompts or model calls.

- [x] **T2: Align routing and native communication instructions**
  - Depends on: none; final wording uses T1's actual fields. T1 and T2 share `extensions/herdr-tools.ts`, so assign sequentially if delegated.
  - Dotfiles files: `extensions/herdr-tools.ts` tool descriptions/guidelines; `skills/herdr/SKILL.md`; `docs/herdr.md`; `docs/onclave.md`, all under `pi/profiles/default/`; root `CHANGELOG.md`.
  - Onclave files: `modules/onclave/extensions/onclave-pi/src/onclave-pi.ts`, only the relevant peer-tool descriptions/guidelines and corresponding existing tests if needed. No schema, delivery, registration, or service changes.
  - Replace contradictory routing/recovery-only wording with the native workflow above. Cover Pi and other Herdr-supported CLI agents without promising identical busy-input behavior or a structured automatic response. Keep examples ordinary: list, prompt an exact pane, wait/read, optionally ask for a return prompt to the originating pane.
  - Explain that an Onclave ID does not mandate Onclave transport: existing Herdr target resolution finds a matching same-server Pi session and uses its current pane. Show a plain prompt addressed by Onclave ID as well as direct pane targeting, and explain ambiguity/no-match and custom-ID limits. Do not require discovery through both systems on every interaction or treat unmatched identity as proof of remote placement.
  - Correct the stale Onclave Communication section against the actual implementation; leave unrelated sections alone. Preserve service/vault instructions and owned-subagent behavior. Distinguish the Herdr skill's automatic process/log invocation policy from explicitly directed independent-session communication so they do not contradict. Add a concise material-change changelog entry and normal reload/activation note.
  - Review affected composition once: always-visible skill description and active Onclave guidance; activated Herdr description/guidelines; loaded skill body. Avoid repeating procedure in all layers. No real peer messages or model calls required for this prose check; no cache-performance claim.
  - Done when both routes describe the same boundary, existing native actions suffice, and no old protocol-based requirements remain in this spec or changed instructions.
  - Evidence: Updated owning Herdr tool description/guidelines, skill catalog description/body, native workflow docs/examples, stale Onclave Communication section, adapter peer guidance, and root changelog. Composition checked once across the always-visible skill description and Onclave guidance, activated Herdr tool guidance, and loaded skill body. Procedures remain in the skill/docs; routing and result meaning remain with tools. Existing explicit-direction requirements, subagent ownership, registration, services/vault, and callbacks are preserved. Installed Pi 1.3.0 extension/skill contracts and existing adapter delivery code informed wording. No cache-performance or live-interaction claim.

- [ ] **T3: Verify and close out the scoped change**
  - Depends on: T1 and T2.
  - Run from `pi/profiles/default`: `pnpm test herdr-tools.test.ts` and `pnpm run typecheck`. Run the Onclave module's `pnpm run check` for its change. Review changed prose/diff for routing contradictions and scope drift. Reuse already-current results rather than rerunning per task.
  - Record actual checks and limits. Do not add isolated multi-session infrastructure, an exhaustive lifecycle matrix, or operator-acceptance gates. Real attached-client interaction remains a non-blocking verification limit.
  - Commit the Onclave module change locally on its required branch before the dotfiles gitlink. No pull/publication is required for a local pin. Follow Closeout for the task branch, archive, and authorized integration.
  - Done when checks pass, changes and spec are committed, and authorized integration/cleanup is complete or accurately reported as pending.
  - Evidence: Agent-owned implementation/checks complete on 2026-10-23. Final default checks passed: `pnpm test herdr-tools.test.ts` (31 tests), `pnpm run typecheck`. Onclave `pnpm run check` passed typecheck and 398 tests with one skipped. Scoped diff/prose composition and `git diff --check` passed. Fresh worktree required frozen module dependencies and default runtime links; no runtime/dependency versions changed. Onclave guidance committed as `8196cd8` on `feature/v2-broker-core` tracking `origin/feature/v2-broker-core`, then fast-forwarded locally into the originating module checkout before the parent pin. No publication/deployment authorized or performed. Real attached-client interaction remains a non-blocking verification limit.
  - [x] Implementation and agreed checks.
  - [x] Whole-spec archival prepared for task commit at `.specs/archive/herdr-onclave-session-comms/plan.md`.
  - [x] Local task commit and authorized target integration/completion metadata. Task commit `e581339c4dbf8154ff1d440dedccc881a9e5bf33` fast-forwarded into `main`; metadata committed in target commit `47aaa292487dd6ad87c0d09d650637234fba7693`.
  - [x] Exact-origin retirement observed after operator release.
  - [ ] Task-worktree cleanup. Bounded `git worktree remove` is blocked because the registered task worktree contains submodules. Retain `.worktrees/herdr-onclave-session-comms/` until cleanup can complete without affecting its ignored dependencies or the target module checkout.

## Execution and stopping rules

Consult Strategist before delegating execution unless the user explicitly requests a single-agent handoff; Team Leads keep their own Strategist-first workflow. Assign at most one named task per subagent. This plan is small; do not manufacture parallelism around shared files.

Continue independent work around blockers, choose equivalent implementation details directly, and ask only before changing scope, settled behavior, or acceptance. A native limitation already described here is not permission to resurrect the rejected protocol. Preserve unrelated work. Do not access legacy or send live prompts to unrelated sessions.

Stop when the finite checks pass and demonstrated task-related defects are resolved. No extra review loop, broad runtime audit, remote deployment, or repeated approval stop is part of execution.

Execution coordinates: `C:/Users/mglenn/.dotfiles/.worktrees/herdr-onclave-session-comms`, branch `task/herdr-onclave-session-comms`; recorded target `C:/Users/mglenn/.dotfiles`, branch `main`, starting commit `c5ef1012873e28fb6e3062000e8a88c223863bd9`. Runtime-prepared coordinates were used without another worktree. The Onclave module was initialized at the parent pin and attached to `feature/v2-broker-core`, tracking `origin/feature/v2-broker-core`.

Current handoff: T1 and T2 implemented; agreed agent-owned checks passed. T1 was one bounded developer assignment; the orchestrator completed T2, checks, and archive preparation. Authorized local task commit and successor integration/cleanup remain next; plan completion is not yet claimed. Onclave guidance committed locally as `8196cd8` and fast-forwarded into the originating module checkout without publication. Its `pnpm run check` passed typecheck and 398 tests (one skipped). Fable 5.1 high-effort read-only review on 2026-10-23 confirmed the native approach and identity format. Its actionable findings are incorporated: self-contained format conversion without an adapter dependency, native-name/alias ambiguity handling, explicit layout mapping/rendering fixes, derived-ID labeling and override limits, and real wait-result rendering. Review used read-only source/CLI inspection, no prompts. Named-agent field shape was supported by CLI/binary evidence rather than an observed named live agent. These are planning findings, not implementation/test results. There are no open operator product decisions in this narrowed scope. Future execution starts with T1.

## Closeout

After implementation and agreed checks pass, update evidence, archive the whole spec to `.specs/archive/herdr-onclave-session-comms/` after checking the destination, and commit it with the task changes on the task branch. Never archive unfinished implementation as completed. Record actual worktree, branch, and target; leave unfinished integration/cleanup unchecked with blocker, next action, and action owner.

For authorized `/do-it`, dispatch Integrator from the recorded target checkout after the task commit. It owns local integration and cleanup. In a runtime-prepared Herdr run, use the admitted same-tab successor: it reports integration readiness, the orchestrator finishes any expressly authorized orchestrator-only obligations, then releases the exact origin for graceful retirement; successor cleans up and owns final reporting. Ordinary direct/run-here execution retains parent-owned communication. Preserve both panes/worktree if blocked before retirement. After delivery, report cleanup failure without rollback or recreating the origin. `--no-merge` intentionally retains the committed worktree and skips mutation by Integrator.

Integrator verifies integration/archive, records completion metadata in a commit, and removes the clean task worktree. Manual/live testing is a non-blocking limit. Push and deployment remain separately authorized.

Final reporting starts with explicit outcome: 🟢 COMPLETED, 🔴 NOT COMPLETE: MERGE BLOCKED or USER INPUT REQUIRED, 🔵 IMPLEMENTED: MERGE SKIPPED AS REQUESTED, or 🟡 CLEANUP PENDING. For blocked/pending outcomes lead with the reason, action needed, and owner before passed checks. Include checks, spec location, commits, integration result, and any retained worktree. No success claim from archive or checks alone.

## Integration evidence

T1/T2 implemented; final default pnpm test herdr-tools.test.ts: 31 passed; pnpm run typecheck passed. Onclave pnpm run check: typecheck and 398 tests passed, one skipped. Scoped prose composition/diff and diff --check passed. Onclave 8196cd8 committed on required feature/v2-broker-core and already fast-forwarded locally into target module checkout (clean), preserving origin tracking; no push/deployment authorized. Parent task e581339c pins that commit. Unrelated target feedback-log changes and browser-agent-reliability spec must remain preserved. Real attached-client interaction is a non-blocking limit. No new planning/review phase.

Closeout evidence: Target `main` fast-forwarded from `c5ef1012873e28fb6e3062000e8a88c223863bd9` to task commit `e581339c4dbf8154ff1d440dedccc881a9e5bf33`; completion metadata was committed in `47aaa292487dd6ad87c0d09d650637234fba7693`. The task gitlink and target module checkout both resolve to `8196cd851f95e36da7952b3a553a521abf01833c`; module worktree is clean on `feature/v2-broker-core` tracking `origin/feature/v2-broker-core`. No stash was created: after target merge the submodule pin was clean relative to parent HEAD, so helper integration completed with `stashState=not-needed`. Target unrelated feedback files and browser spec were byte-verified unchanged before and after integration; no target changes were staged. The exact-origin handoff was released and retirement observed. Cleanup remains pending: Git refused to remove the registered task worktree because it contains submodules. The retained task worktree has only ignored `pi/profiles/default/node_modules/` reported by status; do not remove the module pin or ignored dependencies by hand. The source-spec receipt and SHA-256 snapshot remain committed in `.specs/archive/herdr-onclave-session-comms/.pi-plan-run.json`.
