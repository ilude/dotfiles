---
created: 2026-09-08
updated: 2026-09-08
status: completed
completed: 2026-09-08
---

# Default Pi subagents, Team Leads, and councils

## Goal

Add lightweight, Markdown-defined delegation to the default Pi profile: direct subagents, Team Leads, independent/adversarial advice, and explicitly requested councils. This is a handoff for Sol on low thinking effort, not a specification of every internal mechanism. Use normal engineering judgment within the requirements below.

Execution was authorized to completion: implement, validate, document, locally commit, archive, and merge without recurring approval requests. Push, deployment, production plugin relinking, and genuine safety/credential blockers remain separate.

## Required behavior

- **Definitions own authority.** Explicit tool lists and separate delegation permissions, enforced during execution, reload, continuation, and user intervention. `tools: []` means no model-callable tools. Invalid definitions fail safely; no per-call tool widening. Trusted project definitions may override profile definitions without fallback to a more powerful profile on error.
- **Simple delegation.** One `subagent` launch tool for all roles. Root may delegate directly or through a coordinator; coordinators may commission permitted leaves, including writers without having direct write tools. No leaf delegation or coordinator nesting. Skills provide domain specialization; assignments provide perspective.
- **Instruction-only guidance.** Up to four Team Leads, eight children per lead, or twelve direct subagents where a lead is unnecessary. Prefer small, clear jobs that finish relatively quickly. No runtime quotas, combined budgets, count-based queues, forced batching, job timers, or headless overflow.
- **Visibility.** Visible children by default inside Herdr, without stealing focus; headless outside, with explicit headless override. Never silently switch surfaces. Preserve current shell-free direct launching and safety checks.
- **Conversation and outcomes.** Retain context when further exchanges are requested, including council opening, rebuttal, and synthesis. Distinguish a turn reply from assignment completion, result delivery, process exit, and pane cleanup. Support complete, partial, blocked, failed, and cancelled outcomes; blank output plus successful exit is not completion. Bound returned output and permit inspection of retained results.
- **Questions and user help.** Parents answer factual blockers. User-only approvals remain user-only. Direct user intervention suspends competing parent steering, preserves permissions/context, and has explicit handback. Relay headless questions through the originating parent; do not leave headless children waiting after it exits. Ordinary work needs no manual completion command.
- **Lifecycle.** Children continue through `/reload` and same-process chat changes. Results belong to the originating chat, not whichever chat is active. Closing the main instance stops ordinary children but leaves visible children the user is directly helping, marked parent unavailable. Do not recreate a parent.
- **Temporary panes.** Capture results and settle owned processes before cleanup. Close finished panes immediately even if another pane loses zoom. No deferred cleanup or zoom restoration. Failed work alone is not a reason to retain an interactive pane.

No durable task registry, workflow engine, mandatory stage/review sequence, automatic council, voting/consensus gate, permanent worker service, new orchestration dependency, or wholesale legacy import. Keep legacy and Onclave module code unchanged. Children must not register with Onclave or gain general Herdr process/layout authority. Tool ceilings are not OS sandboxes: preserve Damage Control and native-file boundaries without claiming shell-enabled roles cannot mutate files.

## Implementation direction

These are starting decisions, not a mandate for particular private modules or wire formats:

- Markdown frontmatter: required `name`, `description`, `tools`; optional `model`, `effort`, `skills`, `delegates`; body is the role prompt. Accept YAML tool arrays and legacy comma-separated tools. Discover profile definitions through `getAgentDir()` and project `.pi/agents/` through established project trust. Freeze authority for each conversation. Call model/effort overrides take precedence; missing explicit models fail clearly rather than silently changing provider.
- Use the installed bundled Pi CLI: native TUI in Herdr, RPC headless, with a child extension and authenticated local communication. Reuse `scripts/pi-herdr-launch.mjs`; do not add a shell launcher. Load only the child resources needed for its tools, providers, safety, and UI. Prevent deferred activation or UI paths from escaping its authority.
- Keep one process-local owner for the descendant tree, with fresh session bindings across reload. Separate result capture, origin-scoped delivery, and exact-owned cleanup. A cancelled foreground wait detaches rather than cancelling the child; explicit cancellation stops it. No durable broker or restart-recovery service.
- Public surface: `subagent` takes an agent and instructions, with cwd/model/effort/skills, background, surface, and retained-conversation options. `subagent_control` provides inspect, message, answer, escalate, finish, and cancel. An explicitly permitted child helper asks its parent or reports a partial/blocked result. Provide simple `/subagents` inspection/cancellation and `/subagent-return` handback, not a dashboard.

### Initial roles

Use these defaults in editable definitions. All get native read/search tools. Add web tools for developer, reviewer, researcher, advisor, Team Lead, and council; log analytics for explorer, developer, reviewer, and Team Lead. Only developer gets edit/write tools; developer and validator get shell. Give parent-question/report capability explicitly, not as a hidden tool.

| Role | Purpose | Default model / effort |
| --- | --- | --- |
| explorer | Local code/evidence lookup | Luna / low |
| developer | Bounded implementation and relevant checks | Luna / medium |
| reviewer | Independent, evidence-based review | Sol / low |
| validator | Run checks, report results; no source edits/autofix | Luna / low |
| researcher | Original external sources, versions, citations | Luna / low |
| advisor | Balanced, proponent, or adversarial advice as assigned | Sol / low |
| teamlead | Delegate to the six leaves above and integrate | Astra / low |
| council | Coordinate requested deliberation using non-writing leaves | Astra / low |

Model IDs: `openai-codex/gpt-5.6-luna`, `openai-codex/gpt-5.6-sol`, `openai-codex/gpt-6-astra`. Skills start empty and may be selected for assignments. Validator's no-edit rule is an instruction, not a shell sandbox.

Council defaults are prompt guidance: three relevant perspectives, independent openings, one focused rebuttal, then synthesis while members retain their context. Report strongest arguments, changed positions, disagreements, and evidence gaps. No forced agreement or automatic implementation. Use the ordinary delegation/conversation tools, not a separate debate engine.

## Restart context

All code paths are repository-root-relative. Read root/default `AGENTS.md`, `pi/README.md`, and the planning/testing skills, then only the source and installed API docs needed for the next task.

- Repository/merge target: `C:/Users/mglenn/.dotfiles`, `main`. Reviewed baseline: `15c7aee6`; recheck status at execution start and preserve unrelated work.
- Active worktree/branch: `C:/Users/mglenn/.dotfiles/.worktrees/default-subagents`, `feature/default-subagents`, targeting `main`. Created from `15c7aee6`; the uncommitted plan was copied into it and the original remains untouched pending integration.
- Planning used `pi/profiles/default/`. Implementation and validation must use the task worktree's absolute default-profile path, not a launcher resolving to the lasting checkout. Legacy stays unchanged.
- Existing launcher/UI: `scripts/pi-herdr-{launch,setup}.mjs`, `pi/herdr/herdr-plugin.toml.in`, default `extensions/session-launch.ts`, `lib/herdr-cli.ts`, `extensions/herdr-ui-prompt-state.ts`, and `docs/herdr.md`. Leave generated `extensions/herdr-agent-state.ts` unchanged.
- Existing runtime/safety: default `lib/process-scheduler.ts`, `extensions/tool-{search,visibility}.ts`, `lib/tool-activation.ts`, and `extensions/damage-control/`. Borrow process-lifetime ownership, not the scheduler's follow-active-chat delivery behavior.
- Narrow legacy references: `pi/profiles/legacy/extensions/subagent/{agents,workspace-policy,run-manager,tree-runtime}.ts` and its agent definitions. Extract useful responsibilities, not their task/workflow dependency graph.

**Verified planning evidence:** installed Pi 0.85.0 docs/source and one offline extension-loader probe support the bundled CLI direction. Standalone SDK import failed on missing internal `@earendil-works/pi-server`; do not repair that path or add a dependency. `sendMessageWithReceipt` does not exist. Use actual session events/entries for delivery evidence, and `agent_settled`, not `agent_end`, for settled work. Resolve installed docs/CLI through the linked package, not a hardcoded pnpm store path. Completed runtime and visible acceptance evidence is recorded below.

The completed `.specs/archive/default-herdr-processes-and-direct-launch/` is the current Herdr foundation. The cancelled `.specs/archive/herdr-visible-subagents/plan.md` offers evidence for restricted visible launches and owned cleanup, not reload continuity or authority to resume its implementation. Its zoom findings do not justify deferred cleanup.

Prior public research included [nicobailon](https://github.com/nicobailon/pi-subagents), [tintinweb](https://github.com/tintinweb/pi-subagents), [edxeth](https://github.com/edxeth/pi-subagents), [mjakl](https://github.com/mjakl/pi-subagent), [pi-crew](https://github.com/melihmucuk/pi-crew), and [HazAT](https://github.com/HazAT/pi-interactive-subagents). Useful ideas were explicit delegation rights, bounded results, and evidence-based roles. No package was installed or validated; preserve licensing if copying substantial material. No further broad survey is needed.

## Execution finding: authenticated visible transport

Source investigation selected the transport direction on 2026-09-08. The later implementation and live checks below, not that source probe alone, establish acceptance:

- The installed Herdr CLI can start a restricted Pi in an unfocused owned pane with exact argv/environment and can address it by returned pane ID. Herdr lifecycle states and terminal text are advisory only, never completion evidence.
- The archived visible-subagent experiments proved a loopback authenticated completion channel is necessary and feasible. Their legacy broker implementation is reference evidence only and remains unchanged.
- This implementation will use one process-local loopback server owned by the root descendant runtime, an unguessable per-child token, bounded JSONL frames, and exact child/run/origin IDs. Both surfaces use authenticated questions, delegation, and control. Headless RPC supplies turn/process events; native TUI children report settled turns over the authenticated channel, and their per-launch hosts report child process closure.
- The parent runtime alone validates delegation rights and commits the first terminal outcome. Blank, oversized, duplicate, wrong-child, wrong-run, and late frames fail closed. Process exit, Herdr state, and pane cleanup cannot invent assignment completion.
- Visible launch extends the existing repository-owned `local.pi` bootstrap with narrowly validated subagent inputs rather than adding a shell launcher or changing production plugin wiring. Acceptance temporarily linked the same `local.pi` entrypoint in an isolated registry and removed that link afterward. It records returned pane/process identity, preserves focus, and closes only exact owned panes immediately after result capture and process settlement. Main-process exit leaves only visible children under direct user intervention, marked parent unavailable.
- Reload rebinds a fresh extension instance to the process-global owner/server. Conversation authority stays frozen in each child record; origin delivery uses the recorded session ID and consume-once delivery state.

This is an implementation decision within the existing plan, not a new service, durable broker, workflow engine, or scope item. It makes the transport work the first slice of T2 and the shared prerequisite for T3/T4. If the bootstrap cannot preserve a server-independent child process identity for bounded termination, visible acceptance fails rather than falling back to headless.

## Tasks

Proposed new code lives under default `extensions/subagents.ts`, `extensions/subagent-child.ts`, and `lib/subagents/`; choose supporting file splits as needed. Add focused `tests/subagent-*.test.ts` alongside implementation. Tasks are ordered; each depends on the preceding task.

- [x] **T1 - Definitions and authority.** Implement loading, trusted overrides, model/skill resolution, explicit tools/delegates, and child guards. Use existing tool activation and safety code plus narrow legacy path helpers. Done when valid definitions resolve and tests demonstrate no widening through invalid overrides, empty tools, activation, reload, or native-file access.
- [x] **T2 - Headless delegation and conversation.** Extend the existing bootstrap and add the runtime, child extension, and public launch/control tools. Support parent questions, retained turns, bounded results, and cancellation. Done when an actual bundled-CLI child performs an assignment and a follow-up in the same context, with failures and tool limits observed through the real paths.
- [x] **T3 - Ownership, delivery, and lifecycle.** Add process-local reload survival, exact-origin result delivery without duplicates, and owned shutdown. Reuse the scheduler's ownership pattern, not its delivery semantics. Done when reload/chat-switch tests preserve work, results return only to their origin, and result/exit/cancellation races cannot invent success or target unrelated processes.
- [x] **T4 - Herdr and user intervention.** Add visible hosting through the current plugin, no-focus launch, immediate owned cleanup, question escalation/handback, and main-exit survival for visible user-owned children. Extend only the owned prompt-state bridge where needed. Done when both surfaces preserve the same authority and real hosting plus command/event-path tests exercise intervention and cleanup.

Scope check: keep this a delegation runtime. Remove task-created workflow, quota, layout, or unnecessary testing machinery before continuing; do not start another audit or approval stage.

- [x] **T5 - Roles and council.** Add the eight default `agents/*.md` files and concise orchestrator guidance. Done when the real definitions load, a Team Lead delegates and integrates, and a requested council retains member contexts through rebuttal/synthesis using ordinary tools. Counts and discussion structure must remain instructions only.
- [ ] **T6 - Validate, document, and integrate.** Complete the finite checks below. Add default `docs/subagents.md`; update `pi/README.md`, relevant Herdr docs/skill, and root `CHANGELOG.md`. Record results here, archive, commit, and merge. Done when code, docs, and archived plan are delivered to `main`, with no task-owned running resources or unsafe worktree/plugin links left.

## Validation and finish

Use pnpm and existing dependencies. Test actual permission, transport, lifecycle, and delivery behavior; deterministic model/input fixtures are acceptable, but do not mock away the behavior being checked or build a general test framework.

- From the worktree default profile: run the new `pnpm test subagent` filter, affected existing launcher/tool-visibility/prompt-state tests, `pnpm run typecheck`, and `pnpm run check:runtime`. Exercise the bundled loader rather than relying on standalone SDK imports.
- In isolated Herdr hosting with a disposable repository and the worktree profile, check: visible/headless restricted-read parity; one Team Lead with two leaves including a disposable edit; one three-member retained council; and user intervention/handback plus parent-exit cleanup/survival. Reuse earlier evidence where it covers the same boundary. Use scripted input where necessary; do not claim this proves physical keyboard experience or model reasoning quality.
- Keep live cases small and sequential, with bounded startup/cleanup and exact resource ownership. Do not change production sockets/plugin wiring, restart a shared server, rerun old capacity benchmarks, or manufacture a dangerous approval request. No mandatory attached-human pilot.
- Run repository-root `git diff --check`. Fix demonstrated relevant failures and rerun affected checks only. Stop when this acceptance set passes; routine implementation, tests, and local merge need no further approval. Report genuine blockers honestly and continue independent in-scope work.

When complete, record actual profile/runtime/check results, set completion status/date, and move this file's directory to `.specs/archive/default-subagents-and-council/` in the task worktree. Commit and merge into originating `main`, verify delivery, and remove the safely integrated worktree. Preserve unrelated changes; retain the worktree if integration is blocked. Do not push.

## Completed implementation and acceptance (2026-09-08)

Actual profile: `C:/Users/mglenn/.dotfiles/.worktrees/default-subagents/pi/profiles/default`. Bundled runtime: Pi 0.85.0 on Windows with Node 25.9.0. No standalone SDK repair, new dependency, legacy change, Onclave change, or production plugin relink was required.

- **T1:** Strict definitions, fail-closed trusted overrides (including invalid aliases), separate delegation permission, frozen tools, native-path/symlink checks, and selected-skill read exceptions. Actual bundled-CLI tests observe empty/read-only ceilings and blocked direct shell UI; the child authority extension is inert in ordinary parent sessions. The visible reload test rechecks the exact active ceiling. Shell-enabled roles are not OS-sandboxed.
- **T2:** Bounded LF-only RPC and authenticated loopback transport, actual bundled CLI launch, factual questions, user-only consent routing, retained turns, and cancellation. An actual Luna child asked a parent question, incorporated its answer, and recalled `cedar-417` in a later turn. Fixture processes check blank/clean-exit failure, stale output, cancellation settlement, and user denial without inventing a dangerous approval request.
- **T3:** Process-global ownership and origin-specific outbox acknowledgement. An offline bundled Pi test creates a real originating journal, launches a held child, changes chat, reloads actual extensions, releases the child, returns to the old journal, and reloads again. The result appears exactly once in its origin and never in the intervening chat. Foreground-wait detachment and process settlement have separate tests. An early Windows cleanup failure demonstrated that killing without waiting was insufficient; owned closure is now awaited.
- **T4:** Existing shell-free Herdr bootstrap plus a per-launch host retaining the actual child handle. The runtime verifies the plugin's repository bootstrap before opening a pane. Authenticated application readiness, settled turns, control acknowledgements, process closure, and exact pane cleanup are separate. The native child retains authority through reload and direct help. A temporary intervention marker lets its host preserve directly helped children after parent loss without a durable registry.
- **T5:** All eight real definitions load. Live headless Team Lead and council cases passed. The final isolated Herdr case also exercised visible Astra coordination: developer wrote a disposable file and explorer verified it; advisor, researcher, and reviewer retained their contexts for council rebuttal before synthesis. Counts and discussion structure remain instructions only.

Final finite checks:

- `pnpm test subagent herdr-launch.test.ts session-launch.test.ts tool-visibility.test.ts herdr-ui-prompt-state.test.ts`: 51 passed; three opt-in live cases skipped by default.
- `pnpm run typecheck`: passed. A test-only consent-context cast was corrected after the first final typecheck exposed it.
- `pnpm run check:runtime`: passed, including the bundled-loader Damage Control preflight and native schemas.
- `PI_SUBAGENT_HERDR_LIVE=1 pnpm test subagent-herdr-live.test.ts`: passed. It creates an isolated server/config/plugin registry and disposable Git repository; checks headless/visible restricted-read parity, no-focus hosting, child reload, actual scripted TUI input/intervention, explicit handback, retained recall, cleanup while another pane is zoomed, visible Team Lead/council work, ordinary-child shutdown, and parent-unavailable survival followed by the user's real `/exit` command. The temporary plugin is unlinked, server stopped, and scratch directory removed.
- The UI reload probe initially submitted input before Pi finished rebuilding its editor. The final test waits for the fresh native reload notice before typing. That is UI readiness evidence, not assignment completion inferred from terminal text.
- Web-tool fixtures needed their existing nested dependencies installed with `pnpm --ignore-workspace install --frozen-lockfile`; no manifest was changed.

These checks do not prove physical keyboard experience, audible/desktop notifications, model reasoning quality, Linux live behavior, or OS sandboxing. Production sockets, plugin wiring, and credentials were not modified or published.

**Integration:** implementation and validation are complete. Archive and local task commit are prepared; T6's main-branch delivery checkbox will be completed only after merge and verification. Preserve unrelated main-checkout edits and reconcile the original task-owned untracked plan. Do not push.
