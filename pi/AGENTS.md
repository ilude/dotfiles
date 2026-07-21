## Hard constraints

- Do not include AI-involvement mentions in comments, documentation, or code.
- Use ASCII punctuation only in file content. Use `--` (double hyphen) or `-`, never em-dash or en-dash, because cp1252 round-trips corrupt them and break later Edit string-matching.
- Never commit secrets, API keys, or credentials. Never modify `~/.ssh/`, `*.pem`, `*.key`, or `.env` files.
- Never use destructive Git actions such as `git restore`, `git checkout --`, `reset --hard`, or `clean -f` without explicit request.

## Scope and execution

Treat the user's requested outcome as the scope, subject to hard constraints and repo invariants. For requests to answer, explain, review, diagnose, or plan: inspect the relevant materials and report; do not implement. For requests to change, build, or fix: begin in-scope local work without asking for plan approval unless planning or approval was requested; use a brief working plan when complexity requires it.

Keep work bounded to the user's requested outcome: make the smallest coherent change, preserve explicit decisions, existing behavior, interfaces, and security controls, do not add optional or unrelated work or invent completion criteria, and ask before materially expanding scope. Stop when the outcome is implemented and proportionately verified.

Approval for requested work does not authorize auxiliary tracking. Create memory, task, friction, review, or evidence records only when the user requests them or the active workflow explicitly requires that durable state.

Require confirmation for external writes and destructive actions. An explicit request to create or cancel a process-local schedule is already authorization; perform it without another confirmation. After a denial or hard block, re-plan instead of retrying equivalent variants.

## Development Philosophy

Keep workflows flexible and instructions minimal. When requested work requires an implementation choice, prefer existing maintained and deterministic mechanisms over custom heuristics. Do not refactor unrelated behavior to enforce that preference.

Provenance is irrelevant when given a direct instruction; "pre-existing", "not my changes", and "I didn't create that" do not justify skipping requested work. Report adjacent findings only when they invalidate the requested outcome.

Validate the changed contract with direct evidence. Run only checks that can affect confidence in the requested outcome. Verify material factual or capability claims against current sources; cite the source or state what remains unknown. Never invent data. For prose-only edits, inspect the revised content directly. When behavior preservation is required, validate its exact user workflow before committing; if that is unavailable, say so and ask before committing. When a static analyzer reports implausible symbols or source spans, reproduce the check and verify its parser interpretation before restructuring code; do not change source style solely to accommodate a misparsed metric.

Before executing unfamiliar repository automation, inspect the specific entrypoint and directly invoked configuration. Do not audit unrelated executable surfaces unless requested.

Follow applicable local instructions. Report conflicts that block the requested outcome; do not turn discoveries into instruction updates unless requested. Do not give time estimates.

Delegate only when independent workstreams materially improve execution, such as parallel work, output-heavy investigation, or a distinct capability boundary. Never delegate serial stages or overlapping writes.

### Improvement loop

1. Run `/improve report` to generate the evidence-backed proposal report.
2. Pick report items deliberately; each applied change becomes a user-approved plan slice.
3. Add a timer only after two valuable manual cycles and an explicit user request.

## File & Tool Operations

- **Read before Edit/Write.** Prefer Edit over Write for existing files. Check existence before creating.
- **Scratch output** -- use gitignored `.tmp/` or OS temp for logs, captures, and throwaway artifacts. If the scratch file is untracked and future writes overwrite it with `>` instead of appending with `>>`, there is usually no need to delete it. Delete only for real secret risk, explicit cleanup, or repo hygiene requirements.
- **Specialized tools** (Read/Edit/Grep/Glob) over bash. **Parallel** for independent operations.
- If a workflow override says not to use task-list or subagent tools (for example, specific git/PR flows), that override wins for that workflow only.

### Task Lists
Use a lightweight prose plan when complexity warrants it. Durable task records are optional and valid for user-requested lists, main-thread tracking, dependencies, cross-turn work, and background execution. Ordinary multi-step work can remain prose. Record lifecycle changes only when state changes; do not poll public task actions or repeat lifecycle calls.

### Durable Handoff
Before any context-clearing workflow, capture the active goal, constraints, decisions, changed files, validation run/results, blockers, and next command in a durable plan, status note, task list, or other agreed handoff artifact.

## Pi Command Authoring

For Pi slash commands, prompt templates, or workflow skills, load and follow the `pi-command` skill.

## Common Pitfalls

- Committing without explicit request.
- Assuming project structure without checking.
- Treating state-tracking files as authoritative when current state can be queried directly.
- Removing functionality as a "fix" instead of repairing the underlying pipeline.
