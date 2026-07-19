---
description: Concise recap of this session and notable workflow friction
argument-hint: "[focus]"
---

Summarize the work done in this session as a compact handoff note.

Additional focus: $ARGUMENTS

Use this structure when applicable:

1. Start with the primary artifact/path or main outcome in a short sentence.
2. Include links/paths to any PRD.md or plan.md files created or materially updated in this session, with state: open, ready for review, ready for plan/implementation, completed, or archived. Before reporting a PRD/plan as active or recommending it as next work, validate whether it still exists at the stated path, whether it has moved under .specs/archive/, and whether its frontmatter/status/checklist marks it completed or archived.
3. Add a "Current direction" or "Current status" section if there is an active design/plan/change.
4. Add "Key decisions captured" as concise bullets for durable decisions.
5. Add "Telemetry/validation/implementation notes" only if relevant.
6. Add "Workflow friction" only when commands, agents, tools, prompts, or process issues should be improved later.
7. End with "Recommended next command" or "Next step" when there is a clear follow-up.

Evidence rules:
- Treat the available session context, including any compaction summaries, as the source of truth for session scope.
- Before drafting, inventory the distinct work phases in that context so earlier work is not displaced by recent activity.
- Use Git status and history only to corroborate implementation and current state. Do not infer session scope from nearby commits.
- If compaction left insufficient detail, state that coverage is limited instead of reconstructing missing work from Git history.
- Current repository state may update the final status, but it must not erase work completed earlier in the session.

Style rules:
- Keep any top-level bullet list to 3 bullets or fewer when a sectioned handoff is not needed.
- Prefer grouped sections over a flat chronological recap.
- Preserve exact paths, commands, model names, and important enum/value choices.
- Keep every fact, decision, open question, and next step needed to resume the work; trim narration and repetition first.
- Skip routine tool calls and dead-end exploration unless they affect the next step.
- Do not invent validation; say "not run" or omit if unknown.
- Include any workflow issue that materially affects the next handoff.
