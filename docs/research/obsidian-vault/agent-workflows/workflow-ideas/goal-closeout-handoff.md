---
status: research-note
source: local-session-2026-05-26
---

# Goal Closeout Handoff

## Why this matters

The current `/goal` completion flow can stop without telling the user what was
completed, where the repo/session ended, or what should happen next. That loses
handoff context at exactly the moment a goal should become durable.

Goal completion should behave like a compact closeout report, not just a stop
signal.

## Useful signals

A useful `/goal` closeout should record:

- Goal completed: one sentence naming the completed outcome.
- What changed: key files, artifacts, plans, docs, and commits.
- Validation: commands run and pass/fail status.
- Current state: clean/dirty repo, active uncommitted work, archived plan paths,
  and open follow-ups.
- Known gaps: intentionally deferred work or blockers.
- Next step: exact command/action, or `none`.

A closeout for the workflow telemetry work would have mentioned:

- Commits:
  - `25b68c1 feat(pi): record workflow eval telemetry`
  - `25dabc2 docs(pi): document workflow eval operations`
  - `7c833a5 fix(pi): move workflow eval guidance out of claude`
- Docs:
  - `pi/docs/workflow-eval-telemetry.md`
  - `pi/docs/workflow-eval-operations.md`
  - `docs/research/obsidian-vault/agent-workflows/workflow-ideas/adaptive-plan-review-telemetry.md`
- Remaining active change: this research-vault note if not yet committed.

## Possible Pi fit

`/goal` is currently provided by `npm:@narumitw/pi-goal` in `pi/settings.json`.
The preferred future behavior is not another user-facing command. Goal closeout
should be automatic when the active goal is completed.

Possible implementation paths:

1. Configure or extend the existing package if it exposes lifecycle hooks.
2. Add a local Pi extension that wraps or shadows `/goal` completion and asks for
   a closeout report before marking the goal complete.
3. Add a post-goal prompt contract if the package supports invoking a follow-up
   agent turn.

The closeout should be generated before the goal ends, so the agent still has
current context.

## Risks / reasons not to build yet

- Shadowing a package command may conflict with package behavior if command
  precedence is unclear.
- A verbose closeout on every tiny goal could add noise.
- If the closeout relies only on model memory, it may omit current git state;
  deterministic checks like `git status --short` are better.
- If it becomes another command to remember, it fails the goal of lowering
  command count.

## KISS recommendation

Start with a tiny local wrapper or prompt hook that only changes the completion
path:

1. On `/goal done` or equivalent completion, collect deterministic state:
   `git status --short`, recent commits, active plan/archive path if available.
2. Ask the agent for a compact closeout using a fixed template.
3. Show the closeout to the user.
4. Then mark the goal complete.

Do not build dashboards, databases, or broad goal management until repeated use
shows the closeout is useful.

## Related notes

- [Adaptive plan review telemetry](adaptive-plan-review-telemetry.md)
- [Pipelines and policies](pipelines-and-policies.md)
- [Specs workflow trajectory](specs-workflow-trajectory.md)
