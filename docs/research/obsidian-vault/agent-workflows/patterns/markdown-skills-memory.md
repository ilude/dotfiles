# Markdown skills and memory

## Idea

Use Markdown files as the durable interface between humans, agents, and projects.

## Seen in

- ../projects/openclaw.md
- ../projects/convex-agent-plugins.md
- ../projects/browser-use-browser-harness.md

## What belongs in skills

- Domain rules.
- Workflow steps.
- Good and bad examples.
- Verification criteria.
- Failure recovery steps.
- Links to tools/scripts.

## What does not belong in skills

- Obvious facts the agent can infer from files.
- Giant generic prompt packs.
- Stale implementation details copied from docs.
- Unreviewed secrets or machine-local state.

## KISS version for Pi

For any repeated workflow:

1. Run it manually once with Pi.
2. Capture the successful path in Markdown.
3. Add one tiny script only if repetition justifies it.
4. Link the note from an index.
5. Update the note after failures.

## Memory rule

Prefer curated decisions and stable patterns over loading every conversation. Curation can still preserve errors or discard important exceptions; memory persistence is not proof of improvement. See the [September 2026 survey](agent-improvement-survey-2026-09.md) for evidence and implementation limits.
