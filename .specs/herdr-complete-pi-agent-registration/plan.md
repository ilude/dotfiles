---
created: 2026-09-13
status: ready
completed: null
---

# Keep every live Pi agent visible in Herdr

## Goal and scope

- Every live interactive default-profile Pi tab and every visible Pi subagent must appear in Herdr's Agents pane with the correct session identity and current lifecycle state.
- Headless helpers must remain excluded.
- Preserve Herdr's generated Pi lifecycle integration. Make the repository launcher expose the real Pi process to Herdr rather than replacing the lifecycle integration or adding reconciliation machinery.
- Live isolated Herdr behavior is required acceptance. Mocked tests prove only the exercised local boundary.
- Do not expand into general command telemetry, Onclave registration, unrelated Herdr UI work, or `pi/profiles/legacy/`.
- Execution, local task commits, and merge into the originating `main` branch are authorized when this plan is invoked for execution. Push and deployment are not authorized.

## Fresh-context handoff

All paths are relative to `C:\Users\mglenn\.dotfiles`. Read repository `AGENTS.md`, `pi/profiles/default/AGENTS.md`, and the default `herdr`, `pi-extension`, `typescript`, and `testing` skills before editing.

### Required implementation reading

- `scripts/pi-herdr-launch.mjs`
- `scripts/pi-subagent-host.mjs`
- `scripts/pi-herdr-setup.mjs`
- `pi/profiles/default/extensions/herdr-agent-state.ts`
- `pi/profiles/default/extensions/herdr-ui-prompt-state.ts`
- `pi/profiles/default/extensions/session-launch.ts`
- `pi/profiles/default/lib/subagents/launch.ts`
- `pi/profiles/default/lib/subagents/visible.ts`
- relevant Herdr lifecycle, launch, visible-subagent, and isolated-live tests
- `pi/profiles/default/docs/herdr.md`, `pi/profiles/default/docs/subagents.md`, and `pi/README.md`

### Verified cause and behavior

Investigation was completed on 2026-09-13 with Pi 0.85.1 and Herdr client/server 0.9.0.

- Production had eight panes running Pi while `herdr agent list` returned only three. Five plugin-launched Pi panes were `agent_status:"unknown"` and omitted.
- A fresh isolated Herdr server, config, plugin registry, socket, workspace, and plugin pane reproduced the failure. The normal `local.pi` command remained absent from `herdr agent list` for the full 15-second observation window.
- `scripts/pi-herdr-launch.mjs` changes JavaScript `process.argv` and dynamically imports Pi into the launcher process. The operating-system command line remains `node ...\pi-herdr-launch.mjs ...\cli.js`.
- Herdr 0.9.0 process detection therefore does not recognize that foreground process as Pi. The lifecycle source `herdr:pi` is full-lifecycle authority and Herdr gates unanchored reports on recognized Pi process presence.
- Herdr's API handler returns `result.type:"ok"` after queuing a valid report even when terminal-state rules ignore the report. An API acknowledgment is not a registration postcondition.
- In a second fresh isolated run, changing only the plugin command to launch Pi's real `cli.js` process made the pane appear in `herdr agent list` within 500 ms. By 4.5 seconds it had the correct Windows session path and `idle` lifecycle state. It remained correctly listed through the 15-second observation window.
- This A/B result establishes the wrapper-hidden process identity as the direct-tab registration defect. It does not establish process races, stale sequencing, or the previously contaminated production pane as causes.
- `scripts/pi-subagent-host.mjs` already uses the correct comparable structure: it spawns the real Pi CLI as a child with inherited terminal streams. Visible subagents therefore need an explicit live list/state assertion, not a second launcher redesign.
- The installed generated integration is version 8 and reported current by the installed Herdr 0.9.0 binary. A locally available newer Herdr source snapshot contains generated Pi integration version 9 with cross-platform path handling, but it is not the installed integration contract.
- Follow-up experiments verified the proposed wrapper-parent/spawned-Pi arrangement: exact agent registration and independently matched session identity, native input, Pi exit, and launcher-owned pane removal all passed.
- Both original `reload` and translated `startup` preserved a registered same-session Pi pane in fresh live tests. The translation was unnecessary, not demonstrated harmful. Remove it to minimize upstream divergence, not because it caused the missing agents. The earlier claim that session-replacement rules made it invalid for any reload was incorrect.
- Actual visible subagent runs using the existing host passed working/retained-idle registration, native session-content verification, reload, and pane/list cleanup. A matching headless run never appeared. No separate visible-subagent launcher defect was reproduced.
- Reproduction details, run identifiers, results, activation guidance, and limits are recorded in [experiments.md](experiments.md).
- Herdr's generated v8 integration used `file.startsWith("/")`, which rejects Windows session paths. The pending `node:path` absolute-path correction is independently valid. Use an implementation consistent with the generated v9 cross-platform form where practical.

### Herdr documentation confirmation

Herdr's upstream documentation was reviewed alongside installed CLI behavior and local source. The inspected `docs/next` snapshot is not proof that every detail matches the installed binary; live 0.9.0 experiments control behavior claims:

- `Agents` confirms Herdr first detects the pane's foreground process, then gives an active Pi lifecycle integration authoritative state/session control. This matches the observed failure when the wrapper hides Pi's real process.
- `Integrations` confirms `herdr:pi` reports are lifecycle authority, `source` must remain stable, and sequence values must be strictly increasing when reports can arrive out of order.
- `Socket API` explicitly states that stale same-source sequence reports are accepted by the API but ignored by pane state. It also defines `pane.get`, `pane.list`, and `agent.list` as the observable session/state surfaces. This confirms that `result.type:"ok"` alone is not a state-mutation postcondition.
- `Plugins` confirms pane commands are ordinary argv commands, receive Herdr's pane/socket environment, and may be implemented by normal executable code. It does not specify child-process signal or exit propagation. Those details remain the repository launcher's responsibility and must be verified through Node process tests plus the isolated live run.
- The integration documentation says `herdr integration install pi` writes the generated extension file. It provides no patch-preservation hook. The repository must therefore keep refresh instructions and a deterministic drift check for its Windows compatibility correction.
- The docs allow custom integrations to report custom agent labels without native executable support. That does not override the stricter installed `herdr:pi` full-lifecycle rules verified in Herdr 0.9.0 source and the live A/B test. This task retains the official Pi source/label and fixes process visibility rather than changing identity.

### Work to preserve

Earlier task-related edits have since been committed alongside other work (current HEAD during follow-up experiments: `8b47a7a4`). Recheck current Git state and edit the current source rather than replaying an old uncommitted patch:

- `pi/profiles/default/extensions/herdr-agent-state.ts`: keep the Windows absolute-path correction; remove the experimentally unnecessary reload translation.
- `pi/profiles/default/tests/herdr-agent-state.test.ts`: revise the mocked test so it covers the supported payload behavior and does not claim live registration.
- `pi/profiles/default/docs/herdr.md`: replace the incorrect two-patch explanation with the verified launcher/process requirement and maintained path compatibility patch.
- `CHANGELOG.md`: replace the premature fixed claim with the eventual verified implementation outcome.
- `.specs/herdr-complete-pi-agent-registration/plan.md`: preserve this revised plan.

Other uncommitted changes, including module state and the Onclave changelog entry, are unrelated and must remain untouched.

## Decisions and implementation contract

1. Replace in-process dynamic import for ordinary interactive plugin tabs with a spawned real Pi CLI process using exact argv, inherited terminal streams, the selected cwd/environment, cancellation/signal behavior appropriate to the existing launcher, and truthful exit propagation.
2. Keep the launcher process as the plugin-pane lifetime owner so its existing exact-pane retirement behavior still runs when Pi exits. Do not reintroduce a shell wrapper.
3. Preserve the existing constrained session/plan argument construction and Damage Control preflight behavior.
4. Keep visible subagents on their existing host-owned spawned-Pi path. Add live assertions that they appear with session/state; change that path only if the required assertion demonstrates a separate defect.
5. Keep bootstrap reporting best-effort. It may provide early state but is not readiness or registration proof. Do not remove it or add ongoing reconciliation without new evidence.
6. Parse API responses accurately where touched, but do not claim an accepted report mutated server state. The live postcondition is exact pane membership and state in `herdr agent list`/pane state.
7. Keep only the Windows session-path compatibility correction in the generated integration. Do not map `reload` to `startup`.
8. Protect the maintained generated-file correction from silent refresh loss using accurate setup/refresh documentation and a narrow deterministic check. Do not reject setup or take ownership of the full lifecycle extension.
9. Diagnostics, if still needed for a failed acceptance run, must be bounded and omit prompts, credentials, environment dumps, and full session paths.

## Execution guidance

Create or resume a dedicated task worktree and branch from the current integration target. Preserve this plan and its experiment evidence, transferring only any still-uncommitted task content. Earlier lifecycle edits are now committed; do not replay them as pending patches. Record the actual path, branch, originating checkout, and integration target. Do not stash, discard, copy, or commit unrelated work. Concurrent edits to session-launch and documentation are present; inspect their current diff and preserve them.

Implement the established fix and finite checks below. Separate verified code defects, verified live behavior, hypotheses, and remaining validation limits in evidence. A mocked pass cannot satisfy a live checkbox.

## Tasks

- [ ] **T1: Expose the real Pi process from ordinary plugin tabs**
  - Depends on: none.
  - Files: `scripts/pi-herdr-launch.mjs`, `pi/profiles/default/tests/herdr-launch.test.ts`, and directly affected launcher tests.
  - Change: spawn the installed Pi CLI with exact existing arguments and inherited terminal streams instead of importing it into the wrapper process. Await its termination, preserve plugin-pane retirement, and propagate failure/cancellation truthfully. Preserve preflight, profile, resume, plan, and environment behavior.
  - Verify: focused launcher tests exercise argv/environment, process ownership, exit propagation, and exact-pane cleanup without a real production plugin relink.
  - Done when: the OS-visible foreground Pi process is the real CLI while launcher-owned cleanup and existing launch contracts remain intact.
  - Evidence: Not started.

- [ ] **T2: Correct the pending lifecycle patch and its maintenance guard**
  - Depends on: none.
  - Files: `pi/profiles/default/extensions/herdr-agent-state.ts`, `pi/profiles/default/tests/herdr-agent-state.test.ts`, and a narrow setup/runtime assertion at the existing comparable location.
  - Change: retain cross-platform absolute session-path recognition, remove `reload` to `startup` translation, distinguish socket API errors from successful responses where the generated integration is locally maintained, and add a deterministic check that catches loss of the required Windows path correction after integration refresh.
  - Verify: mocked tests assert only payload, response parsing, and path behavior. Test descriptions and failures must not claim Agents-pane visibility.
  - Done when: lifecycle payloads match Pi/Herdr-supported reasons, Windows paths survive, API errors are not treated as delivery, and refresh loss is detectable.
  - Evidence: Not started.

- [ ] **T3: Prove direct-tab and visible-subagent registration on an actual isolated server**
  - Depends on: T1 and T2.
  - Files: existing isolated Herdr test infrastructure, especially `pi/profiles/default/tests/subagent-herdr-live.test.ts`; add one narrowly scoped direct-registration live test or shared helper where appropriate.
  - Change: automate exact-pane checks for:
    - fresh ordinary plugin Pi tab,
    - correct Windows session identity and idle/working/settled states,
    - same-session settled `/reload` without disappearance or identity corruption,
    - visible subagent registration and lifecycle state,
    - headless helper exclusion.
  - Verify: use a named isolated Herdr server/config/plugin registry and pinned isolated socket. Do not relink production, stop the shared server, reuse `w27:pR`, or accept API acknowledgment as success.
  - Done when: every interactive/visible case is present with the expected exact pane/session/state and the headless control is absent.
  - Evidence: Not started.

- [ ] **T4: Align documentation and claims with verified behavior**
  - Depends on: T3.
  - Files: `pi/profiles/default/skills/herdr/SKILL.md`, `pi/profiles/default/docs/herdr.md`, `pi/profiles/default/docs/subagents.md`, `pi/README.md`, `CHANGELOG.md`.
  - Change: document the launcher/process identity contract, Windows path compatibility maintenance, API-acknowledgment limit, and actual live checks. Correct premature claims and explain that reload translation was unnecessary, not proven harmful.
  - Add a short troubleshooting pointer to the Herdr skill. Keep detailed intent, proven cause, tested versions, reproduction steps, activation instructions, and unresolved limits in `docs/herdr.md`, linked to this archived plan and `experiments.md`. This is the final implementation task before closeout so future recurrence has a concrete restart point without bloating the skill.
  - Activation instructions: reopen settled Pi sessions started through the old wrapper using the corrected launcher. Pi `/reload` cannot change an existing process's OS command line. No Herdr upgrade or full server restart was required by the experiments; do not automatically restart the shared server or interrupt unrelated work.
  - Verify from `pi/profiles/default/`:
    - `pnpm test herdr-agent-state.test.ts herdr-launch.test.ts`
    - focused session-launch, prompt-state, label, and subagent runtime tests affected by the launcher change
    - the isolated direct-tab registration live test
    - `PI_SUBAGENT_HERDR_LIVE=1 pnpm test subagent-herdr-live.test.ts` with the new registration assertions
    - `pnpm run typecheck`
    - `pnpm run check:runtime`
    - `git diff --check`
  - Done when: code, tests, docs, and changelog agree on the verified defect, fix, and evidence limits.
  - Evidence: Not started.

- [ ] **T5: Integrate and close out**
  - Depends on: T4.
  - Change: inspect the complete task diff, archive this spec, commit task changes on the task branch, merge into the recorded originating `main`, commit completion metadata, and remove the clean task worktree. Do not push.
  - Done when: `main` contains the implementation and archived completed plan, no active plan copy remains, and task worktree cleanup is verified.
  - Evidence: Not started.

## Agreed validation and current handoff

- Status: ready.
- Completed investigation: isolated baseline/direct-CLI A/B followed by a spawned-child wrapper prototype, both reload variants, and actual visible/headless subagent experiments. All three requested confidence checks passed; see [experiments.md](experiments.md). No production implementation was changed by the experiments.
- Next: T1 and T2 may proceed independently, then T3 proves the combined behavior.
- Blockers/open decisions: none. The established fix preserves the selected integration ownership and workflow.
- Remaining validation limits: the production launcher patch is not implemented. The prototype passed registration, input, same-session reload, and normal exit; final signal/error handling, resume/plan/preflight regressions, and integration tests must exercise the final production code. Visible-subagent lifecycle and headless exclusion passed with the current child stack. Unix behavior and attached-client rendering remain separately stated limits, not claimed passes. Operator manual testing will not block closeout after automated acceptance passes.

## Closeout

After implementation and all agent-owned checks, including isolated live registration checks, pass, update task evidence. Confirm `.specs/archive/herdr-complete-pi-agent-registration/` does not contain another plan, then move this entire spec directory there in the task worktree and commit the implementation and archived spec together.

Merge the task branch into the recorded originating `main` without stashing, discarding, or committing unrelated target changes. Resolve routine conflicts within settled intent. If integration is blocked, retain the worktree and report the blocker and action owner. After merge, verify the target contains the changes and archive, set the archived plan to `status: completed` with the completion date, commit that metadata on the target, and remove the clean task worktree. Do not push.

### Final response

Start with exactly one applicable overall outcome:

- 🟢 **COMPLETED** when live checks pass, changes are integrated, completion metadata is committed, and cleanup is verified.
- 🔴 **NOT COMPLETE: MERGE BLOCKED** when implementation is committed but integration is blocked.
- 🔴 **NOT COMPLETE: USER INPUT REQUIRED** when a consequential decision or external prerequisite prevents completion.
- 🟡 **CLEANUP PENDING** when integration and completion metadata are on `main` but task-worktree cleanup remains.

For any non-completed outcome, immediately state the reason, required action, and action owner. Then report verified code defects, verified live behavior, hypotheses, and remaining validation limits separately. Include checks, spec path, branch/commits, merge result, and retained worktree state. Never cite unit tests as proof of live Herdr registration.
