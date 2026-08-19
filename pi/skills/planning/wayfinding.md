# Wayfinding

Use wayfinding when the destination matters but the route contains decisions that cannot be resolved in one session. It discovers enough of the route to produce an ordinary plan; it is not an execution workflow or issue-tracker ceremony.

## Artifact

Keep one durable map at `.specs/{slug}/wayfinding.md`:

```markdown
# <Destination>

## Decisions

## Frontier

## Not yet specified

## Out of scope
```

- **Destination** defines the outcome and planning boundary.
- **Decisions** records settled decisions once, with links to supporting evidence when needed.
- **Frontier** contains precise, unblocked questions that can be resolved now.
- **Not yet specified** contains in-scope areas that are visible but cannot yet be phrased as precise questions.
- **Out of scope** contains work deliberately excluded from this destination.

The map is an index, not a transcript. Add a linked note only when a decision needs evidence or detail that would obscure the map.

## Process

1. State the destination and its scope boundary.
2. Apply `grill-me` to expose the current decision frontier. Ask the user for decisions; inspect or research facts.
3. Record settled decisions and remove obsolete questions rather than preserving every branch considered.
4. Dispatch independent factual research in parallel when useful. Track executable research or manual prerequisites with Pi tasks, but keep decisions in the map.
5. Move an area from **Not yet specified** to **Frontier** only when its question can be stated precisely.
6. Recompute dependencies as decisions change the route. Resolve any ready frontier question; do not impose a fixed ticket order or one-question-per-session rule.
7. Stop when the remaining work is implementation rather than decision-making. Hand the map to the appropriate plan, PRD, or `/goal` workflow.

Exit early without creating or extending a map when the route is already clear enough for an ordinary plan.

## Guardrails

- Do not turn implementation tasks into decision questions.
- Do not invent detailed future questions while their prerequisites remain unknown.
- Do not duplicate a decision across the map and linked notes.
- Do not require tracker labels, assignments, issue hierarchies, or a fixed number of sessions.
- Do not implement directly from unresolved wayfinding work.
