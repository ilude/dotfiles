---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

If a question can be answered by exploring the codebase, explore the codebase instead.

## Conversation Loop

Run the interview as a structured decision-tree traversal.

For each question:
1. Ask exactly one question.
2. Include the recommended answer.
3. After the user answers, briefly lock the decision.
4. Immediately continue to the next unresolved dependent question.

Do not stop after each answer.

## Batch Checkpoints

After roughly every 10 answered questions:
1. Summarize the decisions locked so far.
2. Estimate how many major questions remain.
3. Identify the next decision area.
4. Ask whether the user wants to continue, pause, switch to drafting the artifact, or change direction.

If the design tree is nearly complete, say so and ask whether to finish the remaining questions.

## Stop Conditions

Stop only when:
- the user says stop/done/enough,
- the user chooses to pause at a 10-question checkpoint,
- the design tree is complete,
- or codebase inspection is needed before continuing.

## Anti-Patterns

- Do not ask one question and then end with “next question when ready.”
- Do not summarize after every question unless needed to lock a decision.
- Do not continue indefinitely without a checkpoint.
