---
created: YYYY-MM-DD
status: draft
completed: null
---

# <Outcome-oriented title>

## Goal and scope

- Requirements and settled decisions: <requested outcomes and preserved behavior>.
- Non-goals: <important exclusions>.
- Authorization: <what the user authorized and any restrictions; planning alone
  authorizes no implementation or Git operations>.

The user's request and subsequent decisions are authoritative. Keep unapproved
recommendations and deferred work outside tasks, dependencies, and completion criteria.

## Fresh-context handoff

All paths are relative to <repository root> unless stated otherwise. Read applicable
`AGENTS.md` files before acting.

- Ownership and required reading: <repositories, boundaries, and a small relevant list>.
- Verified starting behavior: <facts, revision/date where useful, and evidence limits>.
- Work to preserve: <known overlapping changes>.
- Profiles, if relevant: <verified planning profile, intended execution profile;
  record actual runs separately by date, profile/path, scope, and result>.
- Selected workflow, if relevant: <include worktree/integration coordinates and
  closeout obligations only if used. For `/do-it`, follow its existing owning prompt
  at `pi/profiles/default/prompts/do-it.md` in dotfiles; link that source rather than
  duplicating command mechanics>.

## Decisions and implementation contract

<Fixed outcomes, interfaces, defaults, and behavior branches consumed by tasks.
Separate verified facts from proposals and adaptable technical approaches. Label
future files as proposed.>

Resolve consequential scope, architecture, and acceptance choices before marking
ready. Investigate discoverable facts and choose ordinary technical details without
asking. When user judgment is needed, explain the choices, recommend one with reasons,
and ask one question at a time; preserve settled answers. Keep `status: draft` for
unresolved choices, an intentionally requested draft, or a genuine external blocker.
For a blocker, name the missing prerequisite, action owner, and next action.

## Execution guidance

Consult Strategist before executing implementation plans unless the user explicitly
requests a single-agent handoff, including a Team Lead; the Team Lead retains its own
Strategist-first workflow. Assign at most one named task per subagent, splitting
larger outcomes further, and use only active roles. Follow the existing Steward
policy for post-implementation reviewer/validator findings when deciding whether
additional work is warranted, not for planning or initial implementation. Handle
evidence-proved corrections directly and reuse assessments for the same finding.

Preserve unrelated work. Adapt technical mechanisms within settled intent; ask before
changing scope, decisions, or acceptance. Continue independent tasks around blockers.
Do not add work, checks or gates beyond the request or comparable repository
patterns. Optional improvements stay outside scope until approved. At phase boundaries, remove only task-introduced
drift and continue available work, rather than starting another review cycle.

Keep task evidence and blockers current, including the next action and who must act.
Fix demonstrated task-related failures and stop when the finite agreed checks pass.

## Tasks

- [ ] **T1: <specific bounded outcome>**
  - Depends on: <none or task IDs and the specific prerequisite result>.
  - Parallel with: <independent tasks, if useful; omit otherwise>.
  - Files/inputs: <existing or proposed paths; disjoint write ownership if parallel>.
  - Change: <bounded work and contracts consumed later>.
  - Complexity / split hints: <difficult judgments or independently verifiable
    boundaries, if useful; leave staffing to Strategist>.
  - Verify: <finite command and cwd, or exact comparison, with expected result>.
  - Done when: <observable result>.
  - Evidence: Not started.

<Repeat only as needed. Combine fields or sections when clearer. Do not manufacture
extra tasks, a mandatory reviewer sequence, or a second state registry.>

## Validation and stopping point

<Finite agent-owned checks tied to requirements and their results. Record actual
profiles where relevant. State the selected workflow's completion obligations only
if they apply; do not assume a dedicated worktree, Integrator, archival, or merge.>

- Status: <draft / ready / in progress / completed, or a relevant pending state>.
- Completed work and evidence: <task IDs and concise results>.
- Next: <first actionable unchecked task, or none>.
- Blockers/open decisions: <issue, action owner, and next action, or none>.
- Verification limits: <unverified behavior; operator manual/live testing is
  non-blocking and must not be described as passed>.

Report the actual outcome, checks, and any unfinished obligations. If blocked, lead
with the reason and needed action rather than a success summary. Do not mark
unfinished work complete or hand available agent-owned work to the user. Use a
command-specific report format only when that workflow requires it.
