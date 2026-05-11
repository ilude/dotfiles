# UX Researcher PRD Readiness Review

## Finding 1 — High — Display/noise defaults are underspecified

**Severity:** High

**Evidence:** The PRD requires `hidden`, `compact`, and `full` display modes, configurable nudge intervals, completed-task collapsing, persistent/compact visualization, and suppression of nudges while tasks are running. However, it does not define the default display mode, default nudge interval, maximum visible task count, what qualifies as “highest-priority,” or when the system may interrupt the operator.

**required_fix:** Define explicit default UX contracts: default display mode, compact/full caps, priority ordering, default nudge interval, disabled-state behavior, interruption rules, and examples of rendered output for zero/one/many/blocked/running/error tasks. Defaults should be conservative and low-noise.

## Finding 2 — High — Resume/orphan recovery flow lacks operator decision paths

**Severity:** High

**Evidence:** The PRD says to “detect orphaned running tasks on session resume and notify once” and “offer retry/cancel/mark complete path,” but acceptance criteria only require a one-time notification. It does not specify whether stale tasks are paused, still considered running, blocked from auto-cascade, or how the operator acts from the notification.

**required_fix:** Specify the full resume flow: stale-task detection threshold, exact status shown, default safe state, available actions, whether auto-cascade is suspended, how often reminders recur after dismissal, and `/tasks` commands or menu actions used to resolve each orphan.

## Finding 3 — Medium — `/tasks` command model vs interactive settings/menu is unclear

**Severity:** Medium

**Evidence:** The PRD requires `/tasks` list/show/create/start/complete/skip/cancel/retry/clear completed/settings flows, but does not define whether settings are command flags, subcommands, prompts, an interactive menu, or both. It also does not define discoverability aids such as help text, command aliases, validation messages, or suggested next actions.

**required_fix:** Add a `/tasks` UX specification covering command grammar, help/discoverability, settings flow, error states, confirmation prompts for destructive actions, and whether an interactive menu is required or explicitly out of scope for v1.

## Finding 4 — Medium — Auto-cascade and dependency behavior may surprise operators

**Severity:** Medium

**Evidence:** The PRD includes optional auto-cascade, dependency output injection into dependent prompts, skipped tasks unblocking dependents, and task execution tools. Open questions ask whether auto-cascade is enabled by default, but acceptance criteria do not require an operator-visible consent or preview step before newly unblocked tasks execute.

**required_fix:** Define auto-cascade as opt-in or off by default, require visible pre-execution summaries for cascaded work, specify stop/pause affordances, and document how skipped/completed/cancelled blockers are represented before dependents run.

## Finding 5 — Medium — Failure warnings lack copy, placement, and persistence rules

**Severity:** Medium

**Evidence:** The PRD requires user-visible warnings for corrupt files, disk write failures, deleted task directories, and auto-clear data-loss risks. It does not define where warnings appear, whether they persist in `/tasks`, how they are acknowledged, or how to prevent repeated warning spam.

**required_fix:** Specify a warning UX contract: severity labels, one-shot vs persistent behavior, display location in widget/list/show output, acknowledgement/clear commands, exact states that suppress mutation success, and sample warning copy for corrupt storage, failed writes, and auto-cleared IDs.
