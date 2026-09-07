---
created: YYYY-MM-DD
status: draft
completed: null
---

# <Outcome-oriented title>

## Goal and scope

- User requirements: <requested outcomes and preserved behavior>.
- Non-goals: <important exclusions, not speculative restrictions>. Do not add rollback work unless the user requested it.
- Authorization: <planning, implementation, deployment, and Git actions actually requested>.

The user's request and subsequent changes are authoritative. Keep unapproved
optional work outside the task checklist and completion criteria; do not generate
speculative optional-work backlogs.

## Context for a fresh session

All code paths below are relative to <selected repository root>, unless stated
otherwise. Read current applicable AGENTS.md files before acting.

- Owning repositories and paths: <existing source and deployment boundaries>.
- Required reading: <small, relevant file list; label proposed new files separately>.
- Verified starting behavior: <facts, relevant revision/date, and evidence limits>.
- Existing work to preserve: <known overlapping work; recheck on resume>.

### Pi profiles (omit if irrelevant)

- Planning profile: <verified name and portable profile path, or unknown>.
- Intended implementation/validation profile: <name/path; distinguish from actual runs>.
- Other affected profiles: <what must remain unchanged>.

| Date | Actual profile/path | Work or check | Result / relevant model settings |
| --- | --- | --- | --- |
| <date> | <verified profile> | Planning | No implementation or runtime verification |

## Decisions and contracts

Distinguish user-selected behavior from assistant proposals. Resolve factual gaps
by inspection or a bounded investigation task; don't invent user preferences.

| Decision | Source/status | Choice or exact question | Affected tasks |
| --- | --- | --- | --- |
| <D1> | <user requirement / proposed / unresolved / verified> | <choice, evidence, or question> | <T1> |

<Define necessary interface shapes, errors, defaults, ownership, and behavior
branches here. Don't manufacture precision for choices not made yet.>

## Execution guidance

**Before expanding work:** Which existing requirement needs this addition, and
what evidence justifies it? Do not turn optional improvements into tasks or
completion criteria.

**At scope checkpoints:** Check whether recent work advances the agreed
requirements or has drifted into repeated verification, speculative cases, or
unnecessary complexity. Continue required work without starting another audit.

**Recovery when drift is found:** Stop the detour and remove unnecessary code,
tests, and plan items you introduced during this task without disturbing
pre-existing or concurrent work. Resolve cleanup independently; note anything
that cannot be safely removed in the final handoff. Restore the agreed completion
criteria and resume the next required step.

## Tasks

- [ ] **T1 — <specific outcome>**
  - Depends on: <none or task IDs>.
  - Inputs/files: <existing sources; explicitly label files to create>.
  - Do: <bounded change or investigation and its concrete output>.
  - Verify: <command and working directory, or specific manual comparison>.
  - Done when: <observable completion criterion>.
  - If blocked: <concrete branch; don't guess a consequential choice>.
  - Evidence: Not started.

<Repeat for independently useful steps, including integration and final checks.
Place brief scope-checkpoint steps at meaningful phase boundaries, referring to
Execution guidance above. Do not add them after every task or tool call or require
user approval. Don't create a second task-state registry or mandatory per-file
task graph.>

## Agreed validation and finish

<Finite checks tied to requirements; include expected results, execution profile,
and relevant limitations. Reference task checks rather than duplicating checkboxes.
Fix demonstrated failures and rerun affected checks, not an expanding audit.>

## Current handoff

- Status: <consistent with frontmatter>.
- Completed work: <task IDs and concise evidence>.
- Next: <first actionable unchecked task>.
- Blockers/open decisions: <specific unresolved issues or none>.
- Verification limits: <what hasn't been tested; no guarantees from prose review>.

## Completion and archive

When the described work and agreed checks finish, set `status: completed` and
`completed: YYYY-MM-DD` above, record the result and actual profile runs, and move
this entire directory to `REPO_ROOT/.specs/archive/<stub>/`. Repair inbound links
and never overwrite an existing archive. Leave incomplete work active. Archiving
does not authorize committing, pushing, deploying, or deleting unrelated work.
