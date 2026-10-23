---
created: 2026-10-23
status: ready
completed: null
---

# Reliable browser approvals and actionable Brave interactions

## Goal and authorization

Make the default Pi browser tools usable on authenticated Office/SharePoint pages without disappearing approval dialogs, guessed controls, or manual scrolling workarounds. The operator approved the complete package on 2026-10-23 after research and discussion with Opus high and Fable high. Implementation is authorized; both advisors completed their written-plan checks and the resulting corrections are incorporated. No push or deployment is authorized by this approval.

The shipped attached-browser behavior in `c5ef1012` is settled: attached browsers do not intercept normal page-generated requests. Explicit agent actions retain policy checks. Pi-owned browsers retain request interception. These are proportionate tool controls, not a browser/network sandbox.

## Fresh-context handoff

Paths below are repository-root-relative, rooted at `C:/Users/mglenn/.dotfiles`. Read root and applicable profile `AGENTS.md` instructions. Work belongs to this dotfiles repository, under `pi/profiles/default/`; leave `pi/profiles/legacy/` untouched.

Planning profile: verified `default` by `pi_session`, 2026-10-23. Intended execution profile: default. No live browser validation was performed during this planning/research phase. The prior attached-mode change passed 122 focused tests and typecheck before publication; those results do not validate the new work.

Required sources:
- `pi/profiles/default/lib/browser-control.ts`
- `pi/profiles/default/lib/browser-request-policy.ts`
- `pi/profiles/default/lib/browser-effect-contract.ts`
- `pi/profiles/default/lib/browser-observations.ts`
- `pi/profiles/default/lib/damage-control/{context,enforcement,prompt}.ts`
- `pi/profiles/default/extensions/browser-control.ts`
- `pi/profiles/default/skills/browser-tools/SKILL.md`
- `docs/browser-security.md`
- Existing browser and damage-control browser tests in `pi/profiles/default/tests/`.

Verified starting facts:
- Browser request POSTs default to export candidates. Per-endpoint reviews and the 10-second intercepted-request deadline caused Office background prompts to appear and disappear. Attached-mode Fetch interception has since been removed.
- Explicit action policy calls still inherit a 20-second deadline, including human approval time.
- Browser and cross-tool contextual approval paths call `bindBrowserDecision`, saving reusable kind/origin/resource grants until the next native request and across reload. The UI says Allow once.
- Fill performs policy authorization twice. The second call also performs checks after secret resolution; retain these checks without a second decision.
- Snapshot's DOM walker provides selectors for inputs but not ordinary buttons, emits ambiguous fallback selectors, and silently caps the first 16,000 characters. It does not support a subtree selector.
- Page tools have no scroll operation. Click/fill inspect the first `querySelector` match; duplicate selectors and disabled-control no-ops can look successful.

Work preservation: the root worktree was clean when this plan was authored. Recheck before execution. Preserve unrelated changes and independent module work.

Integration target: originating checkout `C:/Users/mglenn/.dotfiles`, branch `main`. Proposed task branch `fix/browser-agent-reliability`, worktree `C:/Users/mglenn/.dotfiles/.worktrees/browser-agent-reliability`; record actual coordinates before implementation. A runtime-prepared plan run's coordinates take precedence. Do not create another worktree when prepared coordinates already exist.

## Settled implementation contract

### Approval correctness

- Keep attached no-interception and end-of-run tooling disposal. Preserve Brave and operator tabs.
- For explicit agent actions, separate human decision lifetime from automated deadlines. Policy prompts wait for answer, denial, caller cancellation, session/task invalidation, or tooling disposal. Automated intent/reviewer calls retain their configured deadlines; CDP/DNS and resource revalidation remain bounded. Explicit local-file authorization is a policy decision and follows the human decision lifetime, including both observation and navigation authorization; only subsequent frame/file revalidation stays bounded. Revalidate target/frame/identity/control after approval before acting.
- This explicit-action rule applies in attached and owned modes, including explicit navigation. The existing 10-second deadline on owned-browser background Fetch requests is unchanged; do not silently convert that request path to indefinite holds.
- Allow once covers the current pending action only. Stop creating reusable manual browser grants from both browser effects and cross-tool private-data export approvals. Existing serialized `operator-decision` entries must remain parseable, but must not authorize future actions after restore or reload. Keep independent request interpretation and per-action review; no promise that interpretation alone can authorize every repeated consequential action.
- One fill requires at most one policy decision for that fill. Preserve the post-secret identity, frame, warning, control-facts, and protected-metadata checks before dispatch. Do not weaken credential origin/frame/form binding or observation export checks.
- Click/fill effect evidence must state the actual mode's enforcement, not claim attached transfers are independently checked.

### Actionable observation and interaction

- Snapshot lists ordinary buttons, links and supported interactive roles as well as current fields. Emit bounded role/tag, name, disabled/visibility facts, and selectors verified to resolve uniquely within the represented exact frame. Never emit an ambiguous bare-tag fallback. If a unique bounded selector cannot be emitted, say it is unavailable rather than guessing.
- Use bounded separate text and control budgets so long text does not consume the whole control budget. Report truncation explicitly. Preserve secret filtering, private-source provenance, and screening on all output, including labels, selectors and truncation metadata.
- Add an optional subtree selector to snapshot, scoped to the exact frame. Reject missing/ambiguous roots with recovery guidance. This is the remedy for document-order truncation; scrolling alone does not change that order.
- Click/fill reject ambiguous selectors and disabled controls with actionable errors rather than first-match execution or successful no-ops. Reuse consistent matching semantics with emitted selectors at every resolution point: inspection, click's final evaluation, and `browserFillExpression`'s final setter evaluation must each reject multiple matches.
- Visibility is reported in snapshot control facts and in click/fill results when the acted-on control was not rendered, rather than returning an unqualified success. It is not a new blanket refusal. Do not add force-click, automatic retargeting, or automatic mutating retries. Missing/changed control errors tell the agent which target/frame to snapshot again.
- Add bounded read-like scrolling for an exact frame: document or selected container, and scroll an element into view. Return actual movement/position and reached-boundary facts rather than claiming all virtualized content was read. Preserve ownership, frame/session revalidation, and existing warning/privacy checks. Scroll may cause application lazy-loading; attached normal traffic remains normal traffic.
- Update owning tool guidance and the browser skill for snapshot, focus/subtree, scroll, re-snapshot, then act. Prefer state/selector evidence over network-idle waits on Office pages. No new generic wait API is required.

### Explicit exclusions

No new browser driver/dependency, full accessibility-ref system, generic find, arbitrary evaluation, cookie/storage access, hosted service, endpoint allowlist, logging framework, automatic Shields/TLS/Safe Browsing changes, broad action-classifier redesign, or consent/fragment-link policy change. Existing uncertain actions remain reviewable. Chrome-only remote-debugging changes are not assumed to apply to Brave. Real SharePoint usage remains unverified until a separately authorized live run.

## Execution guidance

Consult Strategist before delegating execution unless the user explicitly hands the whole job to one agent. Assign at most one named task per subagent. Tasks share `browser-control.ts`; do not assign overlapping write ownership concurrently. T1A and T1B run concurrently through the unchanged `BrowserPolicyHandler` interface, then T2, then T3 is the default dependency chain. A task may be further split only at a concrete interface boundary without duplicating ownership or expanding scope.

Use existing default-profile pnpm tooling. Read relevant skills/docs before implementation. Continue independent available work around blockers; adapt mechanisms within these outcomes, but ask before changing scope, behavior decisions, or acceptance. Do not add mandatory external reviews, live acceptance gates, or a full-suite audit. Keep evidence and checkboxes current.

## Tasks

Within task ownership lists, abbreviated `lib/`, `extensions/`, and `tests/` paths are relative to `pi/profiles/default/`. Root documentation and spec paths are repository-relative.

- [x] **T1A: Make manual browser and cross-tool approvals genuinely one-shot**
  - Depends on: none. Parallel with T1B through the unchanged `BrowserPolicyHandler` signature.
  - Owns: `lib/damage-control/enforcement.ts`, `lib/damage-control/context.ts`, and `tests/damage-control/{browser-contextual-policy,browser-contract,browser-local-file,enforcement}.test.ts`. Do not change browser executor files or their integration tests.
  - Stop creating reusable grants at both approval callsites. Keep old serialized entries parseable but inert on restore/reload, with independent interpretation and per-action review preserved.
  - Verify the owned focused tests, including no manual reuse across actions, tools, or reload. T1B supplies the fill executor change; a transient duplicate fill decision while only T1A is applied is not a reason to restore grants.
  - Done when Allow once creates no future authority and old grants cannot silently reauthorize actions.
  - Evidence: both grant writers removed; historical manual entries inert. Five focused files/100 tests passed, including cross-tool/reload cases. Documented default runtime links established.

- [x] **T1B: Correct browser approval lifetimes and mode-aware evidence**
  - Depends on: none. Parallel with T1A through the unchanged `BrowserPolicyHandler` signature.
  - Owns: `lib/browser-control.ts`, `lib/browser-request-policy.ts`, policy handler lifetime documentation in `lib/browser-effect-contract.ts`, and browser-control/request-policy/login-integration/task-security-integration tests. Do not change T1A-owned files.
  - Implement human decision lifetime for explicit controls, navigation and local-file authorization, preserving owned background Fetch deadlines. Make click/fill effect text mode-accurate. Replace fill's second decision with complete revalidation including the unique post-secret protected-metadata check.
  - Complexity: separate cancellation domains without accepting stale task/frame decisions. Capture pre-approval identity, bound I/O separately, and preserve secret-origin/frame/form constraints.
  - Verify owned focused tests with human wait beyond the previous deadline, cancellation, single fill decision, truthful mode evidence, and unchanged owned background timeout. Run the full relevant integration checks after T1A is present.
  - Done when explicit approvals do not disappear on automated deadlines, stale approval cannot execute, fill asks at most once, and owned background timeout is preserved.
  - Evidence: four owned files/115 tests passed without unhandled errors; request-policy rerun after local-file cases passed 43 tests. Combined T1A/T1B checks passed 5 files/145 tests, including simulated long human waits and retained Fetch timeout.

- [x] **T2: Expose actionable bounded snapshots and precise targeting failures**
  - Depends on: T1A/T1B's settled policy and browser-control changes, avoiding overlapping edits.
  - Owns: `lib/browser-observations.ts`, snapshot/inspect portions of `lib/browser-control.ts`, snapshot schema/dispatch in `extensions/browser-control.ts`, focused observation/control/integration tests.
  - Implement controls with unique selectors, separate budgets, explicit truncation and optional unique subtree root. Refuse ambiguous/disabled action targets, report visibility, and give exact-frame stale recovery. Preserve screening and redaction.
  - Complexity: structural selectors must uniquely identify their original control in repeated layouts; observation output must not leak input values or protected reflections. Keep the existing model-facing surface compatible except for the approved additions/refusals.
  - Verify `pnpm test browser-observations.test.ts browser-control.test.ts browser-task-security-integration.test.ts` from the default profile, plus any directly affected existing fixture. Cover no-id/repeated controls, controls after long text, subtree omission recovery, truncation truth, ambiguous/disabled targets, and secret-free output.
  - Done when agents can obtain a uniquely targetable button/link from a bounded snapshot and focus omitted content without guessed selectors or silent first-match behavior.
  - Evidence: actionable bounded snapshots, unique selectors/subtrees, action-time matching, disabled refusals, visibility and exact original-page/frame recovery implemented. Continuation resolved OOPIF recovery and verified redacted selector unavailability. Four focused files/117 tests passed. Typecheck passed before T3.

- [x] **T3: Add bounded exact-frame scrolling**
  - Depends on: T2's snapshot/action interface and completed shared-file edits.
  - Owns: scroll path/types in `lib/browser-control.ts`, schema/dispatch in `extensions/browser-control.ts`, affected Damage Control adapter action validation, focused browser tests.
  - Add document/container scroll and element-into-view with bounded parameters and truthful movement/position/boundary output. Route through existing identity/read/warning/privacy boundaries. Add `scroll` to both the adapter action allowlist and its `isRead` effect projection, with an adapter test proving it is not projected as an upload. Do not introduce arbitrary evaluation or general keyboard/mouse APIs.
  - Verify focused browser-control, contextual-policy/adapter tests and relevant integration fixtures. Cover nested-frame/container movement, no movement/end, invalid bounds, missing/ambiguous selector, and stale identity refusal.
  - Done when the tool can move within a virtualized page's chosen frame/container and return useful actual state for a fresh observation.
  - Evidence: exact-frame bounded by/into_view scroll implemented with movement/position/boundary results and adapter read projection. Five focused files/158 tests and typecheck passed.

- [ ] **T4: Align guidance, run agreed checks, and deliver**
  - Depends on: T1A, T1B, T2 and T3.
  - Owns: `docs/browser-security.md`, `pi/profiles/default/skills/browser-tools/SKILL.md`, material owning tool guidance, root `CHANGELOG.md`, this spec's evidence.
  - Document interaction loop, mode boundaries, one-shot decisions, human-vs-network deadlines, and non-blocking live-verification limits. Explicitly state that owned-browser background-request prompts can still expire at the retained 10-second network deadline and fail closed. Do not claim every button is semantically understood or network data is confined.
  - Final checks from `pi/profiles/default`: `pnpm test browser-control.test.ts browser-request-policy.test.ts browser-cdp-transport.test.ts browser-login-integration.test.ts browser-task-security-integration.test.ts browser-observations.test.ts browser-credentials.test.ts tests/damage-control/browser tests/damage-control/enforcement.test.ts`; `pnpm run typecheck`. Run `git diff --check` from the repository. Verify the Vitest filter selects the intended existing browser-focused files and add directly affected test files if a filter misses them. Fix task-established defects, not unrelated failures.
  - Done when checks pass, implementation/docs agree, and authorized delivery is complete. Recheck preservation and record actual execution profile/date/results.
  - Evidence: guidance, security documentation, and changelog aligned. Final agreed command plus directly affected adapter file selected all 10 existing browser-focused files, enforcement, and adapter tests: 12 files/323 tests passed. `pnpm run typecheck` and repository `git diff --check` passed on 2026-10-23. Default profile verified. No legacy changes, live browser run, push, or deployment. Implementation/checks complete; authorized integration and cleanup still pending.

## Design review and research evidence

Design discussed with retained Opus high (Clara) and Fable high (Maya). Both support attached no-interception, truthful effects, stable explicit approvals, and true one-shot authority. Their research followups support actionable controls before classifier changes and bounded scroll. Final selection follows Fable on reporting visibility rather than refusing it, and ships subtree focusing with truncation. Both advisors completed the written-plan check on 2026-10-23 and found no open behavior decisions. Incorporated their clarifications for local-file policy lifetime, both scroll adapter projections, action-time uniqueness, visibility feedback, explicit cross-tool tests, and disjoint T1A/T1B ownership.

Optional retained contacts in the current Pi process, not execution dependencies:
- Opus high / Clara: subagent `c15721c2-05d8-45cd-8d06-deafe5fa1852`, native session `01a1690a-8dbe-706b-9f6b-3dae84b8a6c5`.
- Fable high / Maya: subagent `ec2d785a-d9cc-4a48-a7a6-0f941a03f8fa`, native session `01a1690c-1099-760b-a7dc-23ea81da4a83`.
- Research / Nora: subagent `7f5b58a0-5b70-450e-828d-6022c2fa5bde`, native session not recorded here. Their relevant conclusions and source limits are incorporated above; no agent needs to be resumed to execute this plan.

At handoff, the EISA SharePoint browser session was deliberately disconnected and instructed not to reconnect. Do not resume that interaction or run live browser checks automatically as part of implementation. No implementation task has started. Run checks on the new work; do not reuse the previous attached-mode test results as evidence for it.

Research sources: [agent-browser commands](https://agent-browser.dev/commands), [Playwright snapshot/ref/subtree/find documentation](https://playwright.dev/mcp/snapshots), [Chrome remote-debugging announcement dated 2025-03-17](https://developer.chrome.com/blog/remote-debugging-port), [Brave Shields](https://brave.com/shields/). Current mutable/undated pages do not establish October 2026 release versions. Their interaction patterns are useful comparisons, not evidence of equal policy safety or proof of this implementation.

## Handoff and closeout

- Status: implementation and agreed checks passed; archival/task commit prepared. Local integration and cleanup pending; not whole-plan completion.
- Execution: 2026-10-23, active profile `default` verified with `pi_session`. Prepared branch `task/browser-agent-reliability` at `C:/Users/mglenn/.dotfiles/.worktrees/browser-agent-reliability`; target remains `C:/Users/mglenn/.dotfiles` branch `main`, starting `c5ef1012873e28fb6e3062000e8a88c223863bd9`. Initial status contained only the untracked selected spec directory; no tracked changes to preserve in the task checkout.
- Next: archive and commit task, then authorized successor integration into recorded `main` and cleanup. No push/deployment authority.
- Open behavior decisions: none. Implementation mechanisms remain flexible.
- Verification limits: no live Brave/Office/SharePoint validation; generated selectors can become stale on rerender, and Luna ask frequency remains unmeasured. Manual testing is non-blocking and not a substitute for the finite checks.

When executing with `/do-it`, use its authorized local worktree/commit/merge workflow. After all implementation tasks and agreed checks, archive the whole spec at `.specs/archive/browser-agent-reliability/` on the task branch, repair links, and commit with implementation. Do not archive unfinished code. Dispatch Integrator from the recorded target for local integration and cleanup; prepared Herdr runs use the admitted same-tab successor and exact origin retirement contract. Keep integration/cleanup pending accurately if blocked. Push requires separate authorization.

For direct execution outside `/do-it`, preserve its actual authorization boundaries; do not infer push, history rewrite, or deletion of unrelated work. Record any authorized local delivery mechanism rather than claiming integration that did not occur.

Final reporting is outcome-first: 🟢 COMPLETED, 🔴 NOT COMPLETE: MERGE BLOCKED / USER INPUT REQUIRED, 🔵 IMPLEMENTED: MERGE SKIPPED AS REQUESTED, or 🟡 CLEANUP PENDING, always with explicit text. For blockers lead with reason, exact next action and owner, then concise checks, spec, commits/integration and retained paths. A live/manual check does not block authorized closeout.
