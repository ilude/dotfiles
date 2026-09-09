---
created: YYYY-MM-DD
status: draft
completed: null
---

# <Outcome-oriented title>

## Goal and scope

- User requirements and settled decisions: <requested outcomes and preserved behavior>.
- Non-goals: <important exclusions, not speculative restrictions>. Do not add rollback work unless requested.
- Authorization: <planning or execution; local Git restrictions; explicit push/deployment permission>.

The user's request and subsequent changes are authoritative. Keep unapproved
recommendations and optional work outside tasks and completion criteria.

## Fresh-context handoff

All paths are relative to <repository root> unless stated otherwise. Read current
applicable `AGENTS.md` files before acting.

- Owning repositories and boundaries: <where changes belong>.
- Required reading: <small relevant list; label proposed files>.
- Verified starting behavior: <revision/date, facts, and evidence limits>.
- Work to preserve: <known overlapping changes; recheck before editing>.
- Worktree and integration target: <originating checkout/branch, proposed task path
  and branch until execution records actual values>.
- Profiles, when relevant: <verified planning profile, intended execution profile,
  and dated actual runs kept distinct>.

## Decisions and implementation contract

State fixed outcomes, interfaces, defaults, ownership, and behavior branches needed
by later tasks. Distinguish them from adaptable technical approaches. Resolve
consequential uncertainty while authoring; if user judgment is still needed, keep
`status: draft`, explain the choices and recommendation, and ask a focused question.
Do not predetermine routine implementation details.

## Execution guidance

Create or resume the recorded dedicated task worktree and branch. Record the actual
path, branch, and originating integration target before editing. Preserve unrelated
work and carry task-owned uncommitted plan content without deleting its source.

Implement the settled intent through the agreed checks. Adapt technical mechanisms
when repository evidence requires it, but do not change user intent, scope, settled
decisions, or acceptance without approval. When blocked, continue independent tasks
and ask only for the specific consequential input or external prerequisite. Do not
add audits, optional improvements, speculative fixes, or acceptance requirements.
At meaningful phase boundaries, remove only task-introduced drift and resume the
next required step.

Keep checkbox state, concise evidence, current blockers, and the next action accurate.
Do not stop at a phase boundary or substitute a promise for available work. Fix
demonstrated task-relevant failures and stop testing when the finite agreed checks pass.

## Tasks

- [ ] **T1: <specific outcome>**
  - Depends on: <none or task IDs>.
  - Files/inputs: <existing or proposed paths>.
  - Change: <bounded work and any contract consumed later>.
  - Verify: <command and cwd, or exact comparison>.
  - Done when: <observable result>.
  - If blocked: <specific branch without guessing consequential intent>.
  - Evidence: Not started.

<Repeat only as needed. Combine fields or sections when that improves clarity. Include
an integration/closeout task when execution is authorized; do not create a second
state registry, mandatory reviewer sequence, or user-acceptance gate.>

## Agreed validation and current handoff

List finite agent-owned checks tied to requirements, with expected results and actual
profile where relevant. Record limitations honestly. Unperformed operator manual or
live testing is a non-blocking verification limit, not remaining work or a reason to
keep implementation active.

- Status: <draft / ready / in progress / integration pending / completed>.
- Completed work and evidence: <task IDs and concise results>.
- Next: <first actionable unchecked task>.
- Blockers/open decisions: <specific issues or none>.
- Verification limits: <unverified behavior without claiming it passed>.

## Closeout

After implementation and agreed agent-owned checks pass, update task evidence and
record integration as pending. Confirm `.specs/archive/<stub>/` does not contain
another plan, then move this entire spec directory there in the task worktree and
repair affected links. Commit the implementation and archived spec together on the
task branch. Do not archive unfinished implementation.

Unless explicitly disabled, merge the task branch into its recorded originating
checkout and branch without stashing, discarding, or committing unrelated target
changes. If integration is blocked, retain the worktree and report implementation
and checks separately from pending delivery. If `--no-merge` applies, keep the
committed worktree and report integration as intentionally pending.

After a successful merge, verify the target contains the changes and archive and no
active plan copy remains. Then set the archived plan's `status: completed` and
`completed: YYYY-MM-DD`, mark closeout done, and commit that final metadata update on
the target. Only then declare completion. Rerun affected checks only if conflict
resolution changed checked content. Remove the task worktree only when integration
succeeded and it has no uncommitted or unmerged work. Push and deployment require
separate authorization. Operator manual testing does not block this closeout.
