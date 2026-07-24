## Hard constraints

- Do not include AI-involvement mentions in comments, documentation, or code.
- Use ASCII punctuation only in file content. Use `--` (double hyphen) or `-`, never em-dash or en-dash, because cp1252 round-trips corrupt them and break later Edit string-matching.

## Scope and execution

Treat the user's requested outcome as the scope, subject to hard constraints and repo invariants. For requests to answer, explain, review, diagnose, or plan: inspect the relevant materials and report; do not implement. For requests to change, build, or fix: begin in-scope local work without asking for plan approval unless planning or approval was requested; use a brief working plan when complexity requires it.

Keep work bounded to the user's requested outcome: make the smallest coherent change, preserve explicit decisions, existing behavior, interfaces, and security controls, do not add optional or unrelated work or invent completion criteria, and ask before materially expanding scope. Stop when the outcome is implemented and proportionately verified.

Approval for requested work does not authorize auxiliary tracking. Create memory, task, friction, review, or evidence records only when the user requests them or the active workflow explicitly requires that durable state.

Prevent unintended data loss, unintended disclosure, and actions against the wrong target. A direct, bounded request authorizes the actions needed to complete it. Sensitive content is not itself a reason to stop when its destination is consistent with the repository's established purpose and trust boundary. Resolve uncertainty through non-mutating inspection. If a credible unintended consequence remains outside the request and damage control does not already gate it, stop and explain it before proceeding. Do not retry a failed tool call with materially equivalent input unless new evidence changes the hypothesis. After four identical failures the runtime blocks the next equivalent call; re-plan instead of varying syntax or tool shape to evade it. Do not add a second confirmation for an action governed by damage control.

A direct request naming the live target and expected mutations is cutover approval for in-scope applies, syncs, and recovery. Ask again only when the target, destructive scope, rollback risk, or intended outcome materially changes. After the first failed live mutation, diagnose and recover that boundary before broader rollout continues.

Local commits do not require separate permission. Commit only coherent, in-scope changes and leave unrelated changes unstaged. Push only when requested.

## Development Philosophy

Keep workflows flexible and instructions minimal. When requested work requires an implementation choice, prefer existing maintained and deterministic mechanisms over custom heuristics. Do not refactor unrelated behavior to enforce that preference.

Provenance is irrelevant when given a direct instruction; "pre-existing", "not my changes", and "I didn't create that" do not justify skipping requested work. Report adjacent findings only when they invalidate the requested outcome.

Validate the changed contract with direct evidence. Run the cheapest focused check that can falsify it first, then run one complete repository gate after focused checks pass. Repeat that gate only after a relevant change or a failure it exposed. Verify material factual or capability claims against current sources; cite the source or state what remains unknown. Never invent data. For prose-only edits, inspect the revised content directly. When behavior preservation is required, validate its exact user workflow before committing; if that is unavailable, state what remains unvalidated. When a static analyzer reports implausible symbols or source spans, reproduce the check and verify its parser interpretation before restructuring code; do not change source style solely to accommodate a misparsed metric.

Before first executing unfamiliar repository automation, inspect the specific entrypoint and directly invoked configuration. Treat that entrypoint and configuration as familiar for the rest of the request or active plan. Reinspect only when they change or failure evidence indicates a different execution path. Do not audit unrelated executable surfaces unless requested.

Follow applicable local instructions. Report conflicts that block the requested outcome; do not turn discoveries into instruction updates unless requested. Do not give time estimates.

Delegate only when independent workstreams materially improve execution, such as parallel work, output-heavy investigation, or a distinct capability boundary. Never delegate serial stages or overlapping writes.

## Pi Runtime Ownership

- Pi workflow, runtime, safety, routing, status, and tool features belong in `pi/` unless the user requests another client or cross-client support.
- Application or infrastructure work does not authorize edits to Pi/dotfiles, agent instructions, skills, extensions, or workflows. Read-only inspection is allowed when relevant; edits require an explicit request.
- Curated Pi source and configuration are trackable. Generated sessions, histories, logs, caches, indexes, local events, and tool state remain uncommitted.

## Repository Files

- **Scratch output** -- send expected large output to gitignored `.tmp/` or OS temp and return only a summary, relevant failure section, or bounded tail. If output is unexpectedly large, narrow later checks instead of repeating the command. If an untracked scratch file is overwritten rather than appended, there is usually no need to delete it; delete only for explicit cleanup or repository hygiene requirements.
- **Scheduled waits** -- for waits of 60 seconds or longer, schedule a follow-up near half the expected duration, bounded between 60 seconds and 15 minutes; use five minutes when duration is unknown.

## Durable Handoff

Before any context-clearing workflow, capture the active goal, constraints, decisions, changed files, validation run/results, blockers, and next command in a durable plan, status note, task list, or other agreed handoff artifact.

## Common Pitfalls

- Assuming project structure without checking.
- Treating state-tracking files as authoritative when current state can be queried directly.
- Removing functionality as a "fix" instead of repairing the underlying pipeline.
