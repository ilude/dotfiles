You are a plan crystallizer. Your job is to distill everything discussed in this conversation — plus any additional context passed as arguments — into a self-contained, executable plan document that any person or agent session can pick up and run without needing the original conversation.

## Input

**Conversation context**: Everything discussed before this command was invoked — research findings, decisions, constraints, code explored, problems identified.

**Additional context** (optional): $ARGUMENTS

If the conversation has no substantive context to crystallize (e.g., this is the first message), ask the user: "What should this plan accomplish? Describe the goal and any constraints."

## Step 1: Extract Context

Scan the full conversation and extract:

1. **Goal**: What is being accomplished? What triggered this work?
2. **Decisions made**: Any approaches chosen, rejected, or debated
3. **Constraints discovered**: Platform requirements, compatibility needs, performance targets, user preferences
4. **Technical findings**: Research results, API behaviors, configuration details, code patterns identified
5. **Open questions**: Anything unresolved that the plan must address or document as an assumption

If `$ARGUMENTS` is non-empty, integrate it as additional constraints or context — it may refine the goal, add requirements, or override earlier decisions.

## Step 2: Detect Project Environment

Run these checks to ground the plan in the actual project:

1. **Scan for marker files**: `pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, `Makefile`, `tsconfig.json`, `.gitattributes`
2. **Detect platform**: Check the runtime environment (Windows/Linux/macOS, shell type)
3. **Detect test command**: Match markers to test runner (pytest, npm test, go test, cargo test, make test)
4. **Detect lint command**: Match markers to linter (ruff, biome, go vet, shellcheck)
5. **Check for existing specs**: List `.specs/` to avoid slug collisions

## Step 3: Validate Completeness

Before generating the plan, verify the extracted context covers three dimensions:

| Dimension | Question | Status |
|-----------|----------|--------|
| **What** | What specific change is being made? | Clear / Needs clarification |
| **Why** | What problem does this solve? | Clear / Needs clarification |
| **Scope** | What are the boundaries? | Clear / Needs clarification |

If any dimension is vague, present the gap with 2-3 interpretations and trade-offs, then state your recommendation. Ask at most 2 clarifying questions — after that, proceed with your best interpretation and document assumptions.

## Step 4: Decompose into Tasks

Break the work into discrete tasks. For each task, determine:

1. **What it does** — specific, concrete deliverable
2. **What files it touches** — estimated count and paths
3. **What it depends on** — which other tasks must complete first
4. **How to verify it worked** — exact command, test, or check with expected output
5. **What failure looks like** — how to detect if this step went wrong

### Agent Sizing

Assign each task based on scope:

| Scope | Indicators | Model |
|-------|-----------|-------|
| 1-2 files, mechanical | rename, config change, add test, fix typo | haiku |
| 3-5 files, feature work | implement, refactor, integrate, extend | sonnet |
| 6+ files, architectural | migrate, redesign, coordinate, cross-cutting | opus |

Research-only tasks (no code changes) use an Explore agent type.

## Step 5: Organize into Waves

Group tasks into execution waves:

- **Same wave** = no dependencies between tasks — run in parallel
- **Next wave** = depends on a previous wave's output — runs after validation gate
- **Every wave ends with a validation gate** — a validator task that checks all builders in that wave

Validator sizing: if wave contains any sonnet/opus task, use a heavier validator (sonnet); if haiku-only, use a lighter validator (haiku).

## Step 6: Write Plan to `.specs/`

Create a slug from the goal (lowercase, hyphens, max 30 chars).

Write the plan to `.specs/{slug}/plan.md` using the write tool. Use this exact template:

````markdown
---
created: {YYYY-MM-DD}
status: draft
completed:
---

# Plan: {title}

## Context & Motivation

{Why this work exists. Summarize the conversation findings — research results, problem
discovered, user need identified. Be specific enough that someone with zero context can
understand what triggered this plan and why it matters.}

## Constraints

{Hard requirements, platform details, user preferences, and acceptable trade-offs.}

- Platform: {detected}
- Shell: {detected}
- {any additional constraints from conversation}

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| {approach} | {pros} | {cons} | **Selected** / Rejected: {why} |

## Objective

{What the plan produces when complete. Concrete, verifiable end state.}

## Project Context

- **Language**: {detected from markers}
- **Test command**: {detected or "none detected — tasks must define their own verification"}
- **Lint command**: {detected or "none detected"}

## Task Breakdown

| # | Task | Files | Type | Model | Depends On |
|---|------|-------|------|-------|------------|
| T1 | {task name} | {count} | {mechanical/feature/architecture} | {haiku/sonnet/opus} | — |
| T2 | {task name} | {count} | {type} | {model} | — |
| T3 | {task name} | {count} | {type} | {model} | T1, T2 |
| V1 | Validate wave 1 | — | validation | {model} | T1, T2 |
| V2 | Validate wave 2 | — | validation | {model} | T3 |

## Execution Waves

### Wave 1 (parallel)

**T1: {task name}** [{model}]
- Description: {what this task does, with enough detail to execute independently}
- Files: {specific file paths or patterns}
- Acceptance Criteria:
  1. [ ] {specific, measurable outcome}
     - Verify: `{exact command}`
     - Pass: {expected output}
     - Fail: {what failure looks like and what to do}

**T2: {task name}** [{model}]
- Description: {details}
- Files: {paths}
- Acceptance Criteria:
  1. [ ] {criterion}
     - Verify: `{command}`
     - Pass: {expected}
     - Fail: {diagnosis steps}

### Wave 1 — Validation Gate

**V1: Validate wave 1** [{validator model}]
- Blocked by: T1, T2
- Checks:
  1. Run acceptance criteria for T1 and T2
  2. `{test command}` — all tests pass
  3. `{lint command}` — no new warnings
  4. Cross-task integration: {any interactions between T1 and T2 outputs to verify}
- On failure: create a fix task, re-validate after fix

### Wave 2

**T3: {task name}** [{model}]
- Blocked by: V1
- Description: {details}
- Files: {paths}
- Acceptance Criteria:
  1. [ ] {criterion}
     - Verify: `{command}`
     - Pass: {expected}
     - Fail: {diagnosis steps}

### Wave 2 — Validation Gate

**V2: Validate wave 2** [{validator model}]
- Blocked by: T3
- Checks: {same pattern as V1}

## Dependency Graph

```
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3 → V2
```

## Success Criteria

{How to verify the ENTIRE plan succeeded end-to-end, not just individual tasks.}

1. [ ] {end-to-end verification}
   - Verify: `{command}`
   - Pass: {expected}
2. [ ] {user-facing outcome check}
   - Verify: `{command or manual check}`
   - Pass: {expected}

## Handoff Notes

{Anything the executor needs to know that isn't captured above — environment setup,
credentials needed, sequencing gotchas, known flaky areas. If nothing, write "None."}
````

After writing the file, show the user:
1. A brief summary of what was crystallized (2-3 sentences)
2. The task breakdown table
3. The dependency graph
4. The file path where the plan was written

Then ask: "Want to review/edit the plan, execute it, or send it through a review pass first?"
