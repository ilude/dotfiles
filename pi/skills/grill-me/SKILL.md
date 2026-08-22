---
name: grill-me
description: Stress-test a plan or design, get grilled on a design, or "grill me".
---

Interview the user until the plan or design has a shared, testable meaning. Map decisions as a dependency tree. The current frontier is every unresolved decision whose prerequisites are settled.

Separate facts from decisions. Inspect the codebase or environment for facts instead of asking the user. Delegate independent fact-finding when useful, and continue with unrelated frontier questions while it runs. Present decisions to the user with a recommended answer and the material trade-off; do not decide on the user's behalf.

Conduct the interview through ordinary assistant messages only so the full exchange remains in the conversation transcript. When a decision has a bounded set of plausible answers, include concise quick-answer choices labeled `1`, `2`, `3`, `4` or `A`, `B`, `C`, `D` so the user can reply with one label. Keep free-form answers equally valid. The user must be able to answer freely, ask follow-up questions, challenge assumptions, revise an earlier answer, or change direction in the same conversation. When the user asks a question, answer it before returning to the unresolved frontier; do not treat discussion as a failed or dismissed answer.

## Decision Prompt Structure

Make each decision understandable before presenting answers:

1. Briefly state what was just settled or recorded, when that context is needed.
2. Insert a Markdown horizontal rule (`---`) before the new decision.
3. Explain the decision being made now, why it is the current frontier, and which behavior or trade-off the answer controls.
4. Ask a complete, explicit question ending in a question mark. Do not rely on a topic heading or a list of choices to imply the question.
5. Insert another horizontal rule before bounded quick-answer choices.
6. Explain the material consequence of each choice, mark the recommendation and why, and say that a label or free-form refinement is valid.

Use headings in longer messages when they improve navigation, but retain the horizontal-rule boundaries between recorded state, the question, and its answers. Do not use color as the only separator because rendering support varies.

## Conversation Loop

1. Identify the current frontier.
2. Frame and ask one explicit question or a small related batch in a normal assistant message, whichever is easier to answer. Explain why it is being asked now and what the answer controls. For bounded decisions, provide separated labeled quick answers. Do not ask questions that depend on unresolved answers.
3. Include a recommendation and its main trade-off for each question, and mark the recommended quick answer when choices are shown.
4. Let the user respond conversationally. Address their questions or corrections, briefly record settled decisions, and recompute the frontier.
5. At a natural topic boundary or when the discussion becomes long, summarize what is settled, what remains, and whether to continue, draft an artifact, or change direction.

When the frontier is empty, summarize the shared understanding and ask the user to confirm it before acting on the plan.

## Stop Conditions

Stop when:
- the user says stop, pause, or change direction;
- the frontier is empty and the user confirms the shared understanding; or
- every remaining branch depends on unresolved research or access.

## Anti-Patterns

- Asking the user for facts available from the environment.
- Answering a decision that belongs to the user.
- Asking dependent questions before their prerequisites are settled.
- Presenting answer choices without first asking a complete question and explaining its functional context.
- Blending recorded decisions, a new question, and answer choices into one visually undifferentiated block.
- Forcing a fixed question count, batch size, response format, or picker-style interaction.
- Using a modal or picker that prevents free-form discussion or hides the question from the conversation transcript.
- Repeating summaries after every answer.
- Acting on the plan before the confirmation gate.
