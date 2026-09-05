# Pi autonomy and workflow ceremony investigation

Status: Incomplete. The first pass was too centered on recent failures. Investigation only; no runtime or instruction changes.
Prior task reference: `470fdcf6-c1be-4cca-ad59-67319baaa8ee`
Source baseline: `4549dca9545c38d460719a69698a75da9091b51d` on main, observed 2026-09-05.

## System-wide question

How does an ordinary request accumulate extra requirements, procedures, reviews, state, tools, and tests, and why do attempts to simplify the system regenerate that machinery?

The investigation must follow the whole request-to-completion path across instructions, skills, commands, delegation, design, testing, recovery, and closeout. Assess mechanisms that work as designed as well as broken ones. Compare independent work types and direct successful work. Distinguish necessary constraints from preferences that became universal rules, and identify the feedback that turns each local disappointment into more policy.

Completion requires a coherent minimal operating model and evidence-backed removal/consolidation boundaries, not merely fixes to the recent goal failure. Existing findings remain useful bounded evidence; their proposed changes are provisional rather than the complete simplification scope.

## First-pass findings

The strongest findings are a cross-extension controller identity defect, failed goal startup leaving a procedural tool blockade, user-only lifecycle initialization, inadequate recovery of the original objective, counter-driven test interruptions, and tests that miss real host boundaries while preserving review procedure.

Recommend removing procedural coupling and conflicting instructions together. Commands should share useful agent-callable operations. Preserve exact intent, real safety/ownership checks, unattended continuation, and recovery of partially completed work. Do not replace the removed ceremony with another enforcement framework.

## Read next

1. [Findings](findings.md): observed failures, source mechanisms, counterevidence, and limits.
2. [Runtime, instructions, and tests](runtime-and-tests.md): path map, retained protections, removal candidates, and qualified worker evidence.
3. [Solution-planning inputs](solution-inputs.md): recommended approach, proposed slices, behavior checks, unfinished-state risks, and unresolved operator choices.
4. [Installed mechanisms and history](upstream-and-history.md): Pi 0.84.4 APIs, example discrepancy, and relevant commits.
5. [Continuation](continuation.md): closeout state and exact evidence locators.

## User intent and scope

Make Pi simple and flexible. Slash commands are conveniences, not exclusive access to useful capabilities. Allow execution and recovery within the request without inventing requirements, silently choosing consequential behavior, or repeatedly patching unproductive tests. Investigate runtime and instruction causes together.

Only this investigation directory was authorized for file changes. Runtime, skills, instructions, tests, existing plans, live systems, and Git state were not changed by this investigation. No managed planning/goal workflow, benchmark, or development check was run; no repair allowance was consumed.

Pre-existing untracked paths included `.specs/duckdb-sqlite-log-analytics-benchmark/` and `pi/browser-profiles.json`. They were preserved. Other sessions may change the shared worktree; the source baseline is not a claim that live files remain frozen.

## Evidence standard and completion

This is a mechanism-focused investigation using selected exact sessions, source, targeted tests/history, installed documentation, and three read-only inspections. It is not an exhaustive historical census or a runtime verification report. The notes distinguish observation, source-established mechanism, plausible contribution, and unresolved behavior. No copied raw transcripts or sensitive exports are stored here.

The first pass supplies specific source-linked findings but does not establish the requested system-wide diagnosis. Further investigation must address the machinery-generation pattern across independent cases rather than accumulate more evidence about the same failure. Implementation and its verification remain separate work.
