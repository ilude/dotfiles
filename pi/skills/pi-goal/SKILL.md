---
name: pi-goal
description: "Use when the user asks to create, draft, write, improve, optimize, or build an inline Pi /goal command, goal prompt file, long-running objective, or goal_prompt_file.md. Triggers: /goal prompt, goal prompt, pi goal, goal_prompt_file.md, write a goal for, turn this into a goal."
---

# Pi Goal Prompt Builder

**Auto-activate when:** The user asks for a Pi `/goal` prompt, a goal prompt file, a long-running objective for `/goal`, or asks to turn notes into something suitable for `/goal path/to/goal_prompt_file.md`.

## Core Principle

A good Pi goal prompt is an execution contract, not a brainstorming note. It should tell the agent what outcome to reach, how to decide it is done, what evidence to gather, and when to call `goal_complete`.

Optimize for:

1. **Clear finish line** -- concrete completion criteria.
2. **Safe autonomy** -- what the agent may do without asking, and what requires a user gate.
3. **Validation evidence** -- commands, checks, files, logs, or observations that prove completion.
4. **Compact closeout** -- what to include when calling `goal_complete`.

## Practical Steps

### 1. Default to an inline command unless the user asks for a file

When the user asks to "create a /goal prompt", "write a goal prompt", or "turn this into a goal" without asking for a file, output a copyable command on screen that starts with `/goal `.

Use inline `/goal <objective>` when the objective is short or moderate and can fit in a compact command.

Most goals should stay inline. Use a goal prompt file only when the user explicitly asks for a file/path, or when the goal is large or complex enough that inline output would be impractical:

- The goal has multiple phases with detailed constraints.
- The user provided long notes, logs, acceptance criteria, or context that must be preserved.
- The prompt would exceed a few paragraphs.
- The work should be resumed or audited later.

For large or complex goals, the skill may recommend a file-backed prompt, but ask before creating the file unless the user explicitly requested file creation. Recommended file name patterns:

- `.specs/<slug>/goal_prompt_file.md`
- `docs/<topic>/goal_prompt_file.md`
- `goal_prompt_file.md` in the current workspace when temporary

### 2. Ask only for missing execution-critical facts

Do not interview by default. Ask one concise question only when the goal cannot be written safely because a required fact is missing, such as:

- Target repo/path is unknown.
- Destructive, paid, shared, or production mutation might be required.
- Success criteria depend on subjective user judgment.
- Credentials or external account scope is unclear.

Otherwise draft the prompt with explicit assumptions.

### 3. Structure the goal prompt

Use this shape for most file-backed goals:

```markdown
# Goal: <specific outcome>

## Objective
<One paragraph stating the final outcome.>

## Context
<Only context needed to execute. Include paths, current state, and relevant constraints.>

## Scope
- In scope: <allowed work>
- Out of scope: <deferred or forbidden work>

## Execution Rules
- Work until the objective is complete or a real blocker is reached.
- Prefer documented project commands and existing patterns.
- Do not expose secrets.
- Ask before destructive, irreversible, paid, shared-production, or subjective user-judgment gates.
- Repair validation failures when safe and in scope.

## Tasks
1. <Task with target files or systems>
2. <Task>
3. <Task>

## Validation
Run these checks before completion:

```bash
<command 1>
<command 2>
```

Expected success signals:
- <signal>
- <signal>

## Completion Criteria
The goal is complete only when:
- [ ] <criterion>
- [ ] <criterion>
- [ ] Required validation passed or a real blocker is documented.

## Closeout Requirements
Before calling `goal_complete`, summarize:
- Accomplished work
- Validation performed and results
- Current state
- Known gaps or blockers
- Next steps to consider
```

### 4. Include exact commands when known

Prefer project-defined commands over ad hoc commands. Use the repo's documented validation scripts when available.

Examples:

```bash
make check
make check-pi-extensions
cd pi/extensions && pnpm run typecheck
cd pi/tests && pnpm test goal.test.ts
```

If commands are unknown, write how to discover them:

```markdown
Use the repository's documented validation command from AGENTS.md, README, Makefile, package scripts, or equivalent local docs. Record the exact command run in the closeout.
```

### 5. Make autonomy boundaries explicit

Classify gates clearly:

| Situation | Prompt instruction |
|---|---|
| Local reversible code/config changes | Agent may execute and validate directly |
| Credentials already available and safe read/write | Agent may use them without exposing secrets |
| Destructive data changes | Ask first |
| Shared production or paid resources | Ask first unless the user explicitly authorized it |
| Hardware or subjective visual checks | Ask for user validation |

### 6. Tune for long file-backed goals

For `/goal path/to/file.md`, the active reminder is compact. Put durable detail in the file, but avoid stuffing it with irrelevant transcripts.

Good file-backed content:

- Target paths and commands
- Acceptance criteria
- Safety boundaries
- Error logs needed for debugging
- Resume notes

Poor file-backed content:

- Full unrelated chat history
- Duplicate logs with no summary
- Vague motivation without tasks
- Multiple unrelated goals

## Anti-Patterns

- **Vague finish line:** "Improve the project" without measurable criteria.
- **No validation:** Asking the agent to finish without saying how to prove it.
- **Over-broad scope:** Combining refactor, feature work, deployment, docs, and research without priority.
- **Hidden manual gate:** Requiring user judgment but not saying when to pause.
- **Premature closeout:** Telling the agent to call `goal_complete` after implementation but before validation.
- **Secret leakage:** Including tokens, private keys, or full sensitive logs in the prompt.
- **Prompt as plan archive:** If the task needs durable wave-by-wave tracking, recommend `/plan-it` instead of a single `/goal` prompt.

## Quick Reference

### Inline response pattern

When the user asks for a `/goal` prompt and not a file, respond with only the copyable command or a short lead-in plus the command:

```text
/goal <specific outcome>. Work until complete, run <validation command>, repair safe in-scope failures, ask before <manual gate>, then call goal_complete with accomplished work, validation, current state, gaps, and next steps.
```

### File-backed goal creation checklist

- [ ] Objective has one clear outcome.
- [ ] Scope says what is in and out.
- [ ] Safety gates are explicit.
- [ ] Tasks are ordered enough to start.
- [ ] Validation commands or discovery path are listed.
- [ ] Completion criteria are checkable.
- [ ] Closeout requirements mention `goal_complete`.
- [ ] No secrets or unnecessary long raw content.

### When to recommend `/plan-it` instead

Recommend a plan rather than a goal prompt when:

- The work likely touches 6 or more files.
- Multiple teams/modules/systems need coordination.
- There are meaningful architecture trade-offs.
- The user needs review, archive, or wave-by-wave execution telemetry.
- Manual/deployment gates are complex.
