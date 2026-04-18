# Research Notes: Pi Workflow Borrowed Features

This document captures external research for the top three prioritized items from `plan.md`.

## Research Questions

### 1. Unified `/status` and `/doctor`
What established patterns exist for:
- CLI/TUI environment diagnostics
- plugin/tool health inspection
- actionable doctor/remediation flows
- concise health summaries with drill-down

### 2. Persistent background task dashboard
What established patterns exist for:
- background jobs in CLI/TUI apps
- progress/status dashboards
- task cancellation and retry
- token/cost/runtime visibility for agentic workflows

### 3. Interactive permissions management and retry UX
What established patterns exist for:
- allow-once/session/project authorization
- approval queues or pending actions
- replay/retry after approval
- trust and audit surfaces for dangerous operations

---

## 1) Unified `/status` and `/doctor`

### High-signal references

1. **Homebrew troubleshooting / `brew doctor`**  
   https://docs.brew.sh/Troubleshooting
   - Strong precedent for a single diagnostic entrypoint before issue filing.
   - Pattern: make doctor output part of bug-report hygiene.
   - Borrowable idea: Pi `/doctor --json` should produce a support bundle summary for issue reports.

2. **Flutter bug-report guidance / `flutter doctor -v`**  
   https://docs.flutter.dev/resources/bug-reports
   - Strong precedent for collecting verbose diagnostic output as a standard support artifact.
   - Pattern: doctor output should be comprehensive enough to paste into issues.
   - Borrowable idea: add `-v` and structured sections for provider/model/tool/env state.

3. **Gemini CLI feature request for a unified `doctor` command**  
   https://github.com/google-gemini/gemini-cli/issues/18692
   - Very close to Pi’s needs: installation health, permissions, configuration, extensions, skills, MCP, and invalid references.
   - Pattern: one-stop validation across config + extensions + linked resources.
   - Borrowable idea: validate Pi extensions, skills, routing assets, and broken references in one pass.

4. **Basecamp CLI**  
   https://github.com/basecamp/basecamp-cli
   - Includes `basecamp doctor` and `basecamp doctor --verbose` in its documented troubleshooting flow.
   - Pattern: concise default output with optional verbose mode.
   - Borrowable idea: default `/doctor` should be green/yellow/red and actionable, with a verbose drill-down mode.

5. **Community “doctor” pattern in other CLIs**  
   Search examples also surfaced tools like `suiup doctor`, `procli doctor`, and diagnostics-first install flows.
   - Pattern: doctor commands work best when they check install, auth, config, and dependent tooling together.

### Borrowable patterns for Pi

- **One command, multiple sections**
  - installation/runtime health
  - active model + provider availability
  - prompt router health
  - extension load state
  - tool availability (`bash`, `pwsh`, web, todo, subagent)
  - validator/quality-gate state
  - auth/config sanity
  - repo/session context sanity

- **Actionable remediation, not just status**
  - “missing X” → exact command/path to fix it
  - “extension failed to load” → file path + error + likely fix
  - “router asset missing” → point to `pi/prompt-routing/model.pkl`

- **Support-oriented output**
  - `/doctor --json`
  - `/doctor --verbose`
  - optional “copy issue bundle” output

- **Preflight validation**
  - validate referenced files in skills/specs/config
  - validate extension registration and load failures
  - validate model-routing prerequisites

### Recommendation for Pi

Best borrowed shape:
- `/status` = lightweight operator-facing snapshot
- `/doctor` = full preflight and troubleshooting report
- `/doctor --json` = machine-readable output for future automation or issue templates

---

## 2) Persistent background task dashboard

### High-signal references

1. **lazyactions**  
   https://github.com/nnnkkk7/lazyactions
   - Lazygit-style terminal UI for GitHub Actions.
   - Features include real-time updates, logs, trigger/cancel/rerun, filtering, and keyboard-first navigation.
   - Borrowable idea: Pi background work should support inspect/cancel/retry with a compact multi-pane TUI mental model.

2. **Oban Web**  
   https://github.com/oban-bg/oban_web
   - Mature background-job dashboard with live updates, filtering, detailed inspection, batch actions, queue controls, access control, and action logging.
   - Borrowable idea: Pi task UX should separate overview, filtered inspection, bulk actions, and audit logging.

3. **Oban Web docs**  
   https://oban.pro/docs/web/overview.html
   - Reinforces mature patterns: real-time monitoring, batch cancel/retry, queue controls, detailed job state views.
   - Borrowable idea: treat agent jobs as first-class objects with lifecycle state and operator actions.

4. **gh-dash**  
   https://github.com/dlvhdr/gh-dash
   - Rich terminal dashboard with per-repo sections, custom actions, vim-style navigation, and YAML config.
   - Borrowable idea: let users define which sections matter in Pi tasks view: running, waiting approval, failed, completed, expensive.

5. **Backlog.md**  
   https://github.com/MrLesk/Backlog.md
   - Not a runtime dashboard, but highly relevant for AI-agent workflow visibility via markdown-native task management and terminal board views.
   - Borrowable idea: keep Pi tasks inspectable and durable, not purely ephemeral transcript artifacts.

6. **awesome-tuis**  
   https://github.com/rothgar/awesome-tuis
   - Useful discovery source rather than a single solution.
   - Pattern: best TUI dashboards are keyboard-first, filtered, stateful, and progressive in disclosure.

7. **claws**  
   https://github.com/clawscli/claws
   - Multi-pane TUI with filtering, command mode, diff/detail views, and optional read-only mode.
   - Borrowable idea: task dashboards benefit from fast filtering, detail panes, and safe read-only browsing of results.

8. **xcsh** (search surfaced async background jobs + await pattern)  
   https://github.com/f5xc-salesdemos/xcsh/
   - Mentions background execution with configurable concurrency and explicit waiting.
   - Borrowable idea: Pi could model detached subagent runs with an `await`/attach concept rather than transcript-only streaming.

### Borrowable patterns for Pi

- **Persistent job objects**
  - id
  - agent/team/command source
  - start/end times
  - status
  - token/cost/runtime
  - final output summary
  - error/retry metadata

- **Operator actions**
  - cancel running task
  - retry failed task
  - reopen details/logs
  - batch-clear completed tasks

- **Good dashboard layout**
  - sections: running / blocked / awaiting approval / failed / completed
  - quick filter/search
  - detail panel for selected task
  - compact statusline pill for in-flight work

- **Progressive disclosure**
  - collapsed summary by default
  - expand for tool calls, final output, usage, and errors

- **Auditability**
  - action log for cancel/retry/manual intervention
  - persisted summaries outside transcript scrollback

### Recommendation for Pi

Best borrowed shape:
- a first-class `/tasks` or `/jobs` command
- backed by a durable task registry rather than only inline tool rendering
- with cancel/retry/details and per-task usage visibility

---

## 3) Interactive permissions management and retry UX

### High-signal references

1. **GitHub Copilot CLI tool-permission docs**  
   https://docs.github.com/en/copilot/how-tos/copilot-cli/allowing-tools
   - Strong examples of layered control:
     - available/excluded tools
     - allow/deny tool rules
     - fine-grained command patterns
   - Borrowable idea: Pi can cleanly separate “tool availability” from “approval policy”.

2. **GitHub Copilot CLI best practices**  
   https://docs.github.com/copilot/how-tos/copilot-cli/cli-best-practices
   - Documents “allow just this time” vs “allow for rest of session” and reset flows.
   - Borrowable idea: session-scoped approval state should be inspectable and resettable from a command.

3. **VS Code agent tools / permissions picker**  
   https://code.visualstudio.com/docs/copilot/agents/agent-tools
   - Strong UX precedent for explicit permission levels: Default Approvals, Bypass Approvals, Autopilot.
   - Borrowable idea: Pi could expose coarse-grained approval modes while keeping fine-grained rules under the hood.

4. **Claude Code security docs**  
   https://code.claude.com/docs/en/security
   - Explicitly documents approve-once, allow automatically, trust verification, fail-closed matching, and prompt-fatigue mitigation.
   - Borrowable idea: Pi should expose current trust/approval state to reduce mystery and prompt fatigue.

5. **Claude Code issue: permission audit logging**  
   https://github.com/anthropics/claude-code/issues/40634
   - High-value audit insight: log the *approval method*, not only whether the tool ultimately ran.
   - Borrowable idea: Pi should record whether an action was allowed by static rule, session approval, project approval, or manual one-time approval.

6. **Copilot CLI issue: view and revoke current permissions/tools**  
   https://github.com/github/copilot-cli/issues/2441
   - Direct validation that long-running sessions need centralized inspect/revoke UX.
   - Borrowable idea: `/permissions` should show effective access scope, not just static config files.

7. **claws read-only mode**  
   https://github.com/clawscli/claws
   - Not a permission system in the same shape, but a strong pattern for a visible safe mode.
   - Borrowable idea: Pi could expose an obvious “read-only / safe mode” toggle for inspection-only sessions.

8. **Open agent-tooling/blog ecosystem**
   Search results repeatedly surfaced approval-mode writeups and security guidance emphasizing human oversight, approval fatigue mitigation, and mode-based autonomy.
   - Pattern: the best systems combine fine-grained rules with an understandable high-level mode.

### Borrowable patterns for Pi

- **Central `/permissions` surface**
  - active rules
  - session approvals
  - project-scoped approvals
  - recent denied actions
  - recent auto-approved actions

- **Approval provenance**
  - rule-based allow
  - one-time manual allow
  - session allow
  - repo allow
  - hard deny

- **Retry flow**
  - select a denied action
  - approve with scope
  - replay exact tool call

- **Clear mode model**
  - default guarded mode
  - session-trusted mode
  - read-only mode
  - maybe future auto mode, if Pi ever wants it

- **Revocation/reset UX**
  - revoke session approval
  - clear cached approvals
  - inspect tool/path/url scope

### What seems overbuilt for Pi right now

- full autopilot-style permission modes with silent clarifying-answer automation
- very granular enterprise policy layers before a basic inspect/revoke flow exists
- broad remote trust frameworks before local permission provenance is implemented

### Recommendation for Pi

Best borrowed shape:
- `/permissions` with current effective access + recent decisions
- ability to reset or revoke session-scoped approvals
- ability to replay a blocked action after explicit approval
- provenance logging for how permission was obtained

---

## Cross-cutting themes from the research

### Repeatedly validated patterns
- **Progressive disclosure** beats noisy always-expanded output.
- **Actionable remediation** beats passive status reporting.
- **Operator control surfaces** matter as much as the underlying automation.
- **Session durability** becomes important once workflows are long-running.
- **Audit provenance** is essential once approvals and autonomy increase.

### Most compatible with Pi’s current architecture

Most compatible near-term additions:
1. `/status` + `/doctor` backed by current extension/runtime state
2. a durable `/tasks` registry layered under current subagent execution
3. `/permissions` on top of existing damage-control and confirmation logic

Least disruptive implementation order:
1. `/status`
2. `/doctor`
3. task registry + `/tasks`
4. permission provenance logging
5. `/permissions` inspect/reset/retry UX

---

## Pi-native and Pi-adjacent implementations already on the web

This section answers a narrower question than the earlier research: **do public Pi repos/packages/forks already implement these features, or close enough versions to borrow from?**

Short answer: **yes for status/task/permission building blocks, but not a clear single vanilla-Pi package that combines them into the exact integrated UX proposed for this repo.**

### Classification used
- **Pi-native** = built as an extension/package/frontend for `@mariozechner/pi-coding-agent`
- **Pi-adjacent** = fork, frontend, or companion project built around Pi data/session formats or APIs
- **Reusable non-Pi** = adjacent systems worth borrowing from but not Pi-specific

### 1) Unified `/status` and `/doctor`

#### Pi-native findings

1. **`sids/pi-extensions` — `status/`**  
   https://github.com/sids/pi-extensions
   - Repo README explicitly lists `status/` as a **live status widget for model, repo, timing, and PR context**.
   - Classification: **Pi-native**
   - Relevance: proves there is already a public Pi implementation for a richer status surface than stock Pi.

2. **`nicobailon/pi-powerline-footer`**  
   https://github.com/nicobailon/pi-powerline-footer
   - Powerline-style status bar with **git integration, context awareness, token intelligence, thinking indicator, and extension status**.
   - Classification: **Pi-native**
   - Relevance: strong reusable statusline implementation, though it is not a full doctor command.

3. **`rytswd/pi-agent-extensions` — `statusline`**  
   https://github.com/rytswd/pi-agent-extensions
   - Repo README describes **condensed status bar with usage, VCS, and context**.
   - Classification: **Pi-native**
   - Relevance: another existing Pi-native status implementation with a slightly different UX.

4. **`pi0/pi-vscode`**  
   https://github.com/pi0/pi-vscode
   - VS Code frontend with **status bar button**, live package management, diagnostics, and bridge tools into editor state.
   - Classification: **Pi-native frontend**
   - Relevance: not `/status` in the terminal, but a Pi-specific operator surface already exists in editor form.

#### Pi-adjacent findings

5. **`mksglu/context-mode`**  
   https://github.com/mksglu/context-mode
   - README explicitly says **Pi Coding Agent runs context-mode as an extension** and exposes `ctx-doctor` and `ctx-insight`.
   - Classification: **Pi-adjacent / Pi-compatible extension**
   - Relevance: strong evidence that doctor-like diagnostics and analytics are already being shipped around Pi, even if via a broader cross-agent package.

6. **`can1357/oh-my-pi`**  
   https://github.com/can1357/oh-my-pi
   - Search results/snippets show `/extensions (/status)` as an **Extension Control Center**, plus richer status line behavior.
   - Classification: **Pi-adjacent fork**
   - Relevance: not drop-in for vanilla Pi, but a very strong source for status/control-center ideas.

7. **`Dicklesworthstone/pi_agent_rust`**  
   https://github.com/Dicklesworthstone/pi_agent_rust
   - Search results describe a `doctor` command checking **config, directories, auth, shell setup, sessions, and extension compatibility**.
   - Classification: **Pi-adjacent reimplementation**
   - Relevance: closest public “doctor” implementation found, but not built on stock Pi.

#### Net assessment for feature 1
- **Status:** definitely already exists in the Pi ecosystem in multiple public forms.
- **Doctor:** partially exists in Pi-adjacent projects and Pi-compatible extensions, but I did **not** find a clear mainstream vanilla-Pi package that already provides the exact unified `/doctor` proposed here.
- **Implication:** build-vs-borrow should lean toward **borrowing status UX** and **designing a repo-specific doctor command**.

### 2) Persistent background task dashboard

#### Pi-native findings

1. **`kirang89/pi-todo`**  
   https://github.com/kirang89/pi-todo
   - Persistent todo widget + `todo` tool for tracking multi-step task progress in real time.
   - Session persistence, widget UI, and task state transitions already implemented.
   - Classification: **Pi-native**
   - Relevance: direct hit for durable task tracking in Pi.

2. **`tmustier/pi-extensions` — `tab-status`**  
   https://github.com/tmustier/pi-extensions
   - README describes terminal tab indicators for parallel sessions: **done / stuck / timed out**.
   - Classification: **Pi-native**
   - Relevance: public Pi-native implementation of background-work/session-status signaling.

3. **`nicobailon/pi-messenger`**  
   https://github.com/nicobailon/pi-messenger
   - Multi-agent communication and orchestration with **living presence**, **activity feed**, **task planning/work/review**, **stuck detection**, and a **chat overlay**.
   - Classification: **Pi-native**
   - Relevance: strongest Pi-native evidence that durable, inspectable background coordination already exists.

4. **`nicobailon/pi-interactive-shell`**  
   https://github.com/nicobailon/pi-interactive-shell
   - Supports **hands-free**, **dispatch**, and **monitor** modes with attach/poll/notification semantics for long-running CLIs.
   - Classification: **Pi-native**
   - Relevance: not a general `/tasks` dashboard, but a concrete Pi-native implementation of detached/background execution states.

5. **`tmustier/pi-extensions` — `usage-extension`**  
   https://github.com/tmustier/pi-extensions
   - Usage statistics dashboard across sessions.
   - Classification: **Pi-native**
   - Relevance: covers one part of the task-dashboard vision: durable cost/usage visibility.

6. **`mrexodia/agent-cost-dashboard`**  
   https://github.com/mrexodia/agent-cost-dashboard
   - Web dashboard reading `~/.pi/agent/sessions` with **session browser, subagent support, sortable cost/tokens/duration, transcript export**.
   - Classification: **Pi-adjacent companion**
   - Relevance: strong reusable basis for session/job observability, though outside the TUI.

#### Pi-adjacent findings

7. **`can1357/oh-my-pi`**  
   https://github.com/can1357/oh-my-pi
   - Search results mention **background job status indicator in status line**, **structured task management with phased progress tracking**, and improved concurrent task execution.
   - Classification: **Pi-adjacent fork**
   - Relevance: very strong evidence that the broader Pi family is already exploring this space in depth.

#### Net assessment for feature 2
- This is **not net-new to the Pi ecosystem**.
- There are already multiple public Pi-native implementations of pieces of the idea:
  - persistent todo/task state
  - parallel-session indicators
  - multi-agent activity/task orchestration
  - detached/dispatch/monitor execution
  - usage dashboards
- **Implication:** for this repo, the question is not “whether this exists” but **which implementation model to borrow**:
  - inline TUI widget (`pi-todo`)
  - statusline/tab indicators (`tab-status`)
  - richer activity/task overlay (`pi-messenger`)
  - web analytics/session browser (`agent-cost-dashboard`)

### 3) Interactive permissions management and retry UX

#### Pi-native findings

1. **Official Pi example: `permission-gate.ts`**  
   https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/permission-gate.ts
   - Search results explicitly show an official example extension that **prompts for confirmation before dangerous bash commands**.
   - Classification: **Pi-native example**
   - Relevance: proves the core interception hook for permission UX already exists in official Pi examples.

2. **`prateekmedia/pi-hooks` — `permission/`**  
   https://github.com/prateekmedia/pi-hooks
   - Layered permission control with **four levels**: Minimal, Low, Medium, High.
   - Includes `/permission` to change levels and `/permission-mode` to switch ask/block behavior.
   - Classification: **Pi-native**
   - Relevance: strongest public Pi-native match for a user-facing permission management surface.

3. **`kcosr/pi-extensions` — `toolwatch`**  
   https://github.com/kcosr/pi-extensions
   - **Tool call auditing and approval system** with **SQLite logging**, dangerous-command blocking, and manual approval for sensitive operations.
   - Classification: **Pi-native**
   - Relevance: direct evidence that Pi-native approval provenance and audit logging already exist publicly.

4. **`rytswd/pi-agent-extensions`**  
   https://github.com/rytswd/pi-agent-extensions
   - Installation docs list a `permission-gate` extension among the package contents.
   - Classification: **Pi-native**
   - Relevance: another Pi-native signal that permission gating is already an established extension pattern.

5. **`qualisero/awesome-pi-agent` curated list**  
   https://github.com/qualisero/awesome-pi-agent
   - Aggregates Pi-native permission-related projects including `toolwatch` and `pi-hooks/permission`.
   - Classification: **Pi-native ecosystem index**
   - Relevance: confirms these are not isolated one-offs.

#### Pi-adjacent findings

6. **`can1357/oh-my-pi`**  
   https://github.com/can1357/oh-my-pi
   - Search snippets reference a **pending action store**, suggesting a richer internal model for deferred/interactive approvals.
   - Classification: **Pi-adjacent fork**
   - Relevance: useful inspiration for retry/replay UX, though not a stock Pi package.

#### Net assessment for feature 3
- This feature area **already has meaningful public Pi-native implementations**.
- What seems to be missing is not gating itself, but a more polished **single control center** that combines:
  - permission levels
  - active session approvals
  - provenance/audit logs
  - denied-action replay
- **Implication:** for this repo, a good approach is likely **compose/borrow** from `pi-hooks/permission` and `toolwatch`, rather than start from zero.

### Package-registry signal

The public Pi packages index (`https://shittycodingagent.ai/packages`) also surfaced relevant ecosystem signals in search snippets:
- a **status bar extension** for Pi
- a **layered permission control** extension
- a **usage statistics dashboard** for Pi
- a package that brings **Claude Code-style task tracking and coordination** to Pi

That strengthens the conclusion that these ideas are already active in the Pi package ecosystem, even when individual package pages were not easily fetchable through this toolchain.

### Practical conclusion for this repo

For the three top-priority items, the updated answer is:

- **Feature 1 (`/status` + `/doctor`)**
  - **Status:** already exists publicly in Pi-native packages/extensions.
  - **Doctor:** exists mainly in Pi-adjacent work and Pi-compatible cross-agent extensions, but I did not find a single obvious vanilla-Pi package to drop in.
  - **Recommendation:** borrow statusline/widget ideas; implement repo-specific doctor logic.

- **Feature 2 (`/tasks` dashboard)**
  - Already exists in several Pi-native forms.
  - **Recommendation:** evaluate borrowing from `pi-todo`, `pi-messenger`, `tab-status`, and `pi-interactive-shell` patterns before building anything new.

- **Feature 3 (`/permissions` inspect/retry/audit)**
  - Already exists in pieces in multiple Pi-native repos.
  - **Recommendation:** prefer composition from `pi-hooks/permission` + `toolwatch` + official permission-gate patterns.

### Revised recommendation

Before implementing any of items 1-3 in this repo, do a short code-level evaluation of these public Pi projects:
1. `sids/pi-extensions` (`status/`)
2. `nicobailon/pi-powerline-footer`
3. `kirang89/pi-todo`
4. `nicobailon/pi-messenger`
5. `nicobailon/pi-interactive-shell`
6. `prateekmedia/pi-hooks`
7. `kcosr/pi-extensions` (`toolwatch`)
8. `mrexodia/agent-cost-dashboard`
9. `mksglu/context-mode`
10. `can1357/oh-my-pi` (for fork-only inspiration)
