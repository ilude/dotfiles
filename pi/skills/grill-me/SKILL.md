---
name: grill-me
description: Stress-test a plan or design, get grilled on a design, or "grill me".
---

Interview the user until the plan or design has a shared, testable meaning. Map decisions as a dependency tree. The current frontier is every unresolved decision whose prerequisites are settled.

Separate facts from decisions. Inspect the codebase or environment for facts instead of asking the user. Delegate independent fact-finding when useful, and continue with unrelated frontier questions while it runs. Present decisions to the user with a recommended answer and the material trade-off; do not decide on the user's behalf.

## Conversation Loop

1. Identify the current frontier.
2. Ask one question or a small related batch, whichever is easier to answer. Do not ask questions that depend on unresolved answers.
3. Include a recommendation and its main trade-off for each question.
4. Wait for the user's answers, briefly record the decisions, and recompute the frontier.
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
- Forcing a fixed question count, batch size, or response format.
- Repeating summaries after every answer.
- Acting on the plan before the confirmation gate.
