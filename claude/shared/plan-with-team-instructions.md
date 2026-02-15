You are orchestrating a team of specialized agents to complete a task. Follow these steps precisely.

## Step 1: Parse Input

Task description: $ARGUMENTS

If `$ARGUMENTS` is empty, use the AskUserQuestion tool to ask: "What task should the team work on?"

## Step 2: Analyze Project

Run these checks automatically to understand the project:

1. **Scan for marker files** in the current working directory:
   - `pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, `Makefile`, `tsconfig.json`
   - Use Glob to find these: `{pyproject.toml,package.json,go.mod,Cargo.toml,Makefile,tsconfig.json}`

2. **Detect test command** based on markers found:
   - `Makefile` present → `make test`
   - `pyproject.toml` present → `uv run pytest`
   - `package.json` present → `npm test`
   - `go.mod` present → `go test ./...`
   - `Cargo.toml` present → `cargo test`

3. **Detect lint command** based on markers:
   - `pyproject.toml` → `uv run ruff check`
   - `package.json` → `npx @biomejs/biome check`
   - `Makefile` with shellcheck → `shellcheck`
   - `go.mod` → `go vet`

4. **Check for existing active teams**:
   ```bash
   ls ~/.claude/teams/ 2>/dev/null
   ```
   If a team exists, ask: "A team is already active. Cancel it first?"

## Step 3: Generate Plan

Create a slug from the task description (lowercase, hyphens, max 30 chars).

Tell the user: "I'll create `.specs/{slug}/plan.md` for the team plan."

Write the plan to `.specs/{slug}/plan.md` using this template:

```
---
created: {YYYY-MM-DD}
completed:
---

# Team Plan: {task-name}

## Objective
{What needs to be done and why}

## Project Context
- **Language**: {detected from markers}
- **Test command**: {detected or "none detected"}
- **Lint command**: {detected or "none detected"}

## Complexity Analysis

Assign each task a model and agent using these heuristics (user can override):

| Scope | Keywords | Model | Agent |
|-------|----------|-------|-------|
| 1-2 files AND mechanical | rename, add flag, update config, fix typo, add test | haiku | builder-light |
| 3-5 files OR feature work | implement, refactor, add feature, integrate, extend | sonnet | builder |
| 6+ files OR architecture | architect, redesign, migrate, coordinate, cross-cutting | opus | builder-heavy |

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| {task name} | {count} | {mechanical/feature/architecture} | {haiku/sonnet/opus} | {agent} |

## Team Members

Only list agents actually needed for this plan:

| Name | Agent | Model | Role |
|------|-------|-------|------|
| {slug}-builder-1 | {agent type} | {model} | {role description} |
| {slug}-validator-1 | {validator/validator-heavy} | {model} | Wave validation |

## Execution Waves

Group independent tasks (no builder dependencies) into the same wave. Tasks depending on a previous wave's output go in the next wave. Each wave ends with a validation gate.

Validator model rule: if wave contains any sonnet/opus builder → validator-heavy (sonnet), otherwise → validator (haiku).

### Wave 1 (parallel)
- T1: {task name} [{model}] — {agent}
- T2: {task name} [{model}] — {agent}

### Wave 1 Validation
- V1: Validate wave 1 [{validator model}] — {validator agent}, blockedBy: [T1, T2]

### Wave 2
- T3: {task name} [{model}] — {agent}, blockedBy: [V1]

### Wave 2 Validation
- V2: Validate wave 2 [{validator model}] — {validator agent}, blockedBy: [T3]

## Dependency Graph
Wave 1: T1, T2 (parallel) → V1 → Wave 2: T3 → V2
```

For complex tasks, create multiple waves with parallel builders and validation gates between them.

## Step 4: Self-Validate Plan

Before presenting, verify the plan has:
- [ ] Objective section
- [ ] Complexity Analysis table with Model/Agent for every task
- [ ] Team Members table (only lists agents actually needed)
- [ ] At least one builder task
- [ ] Tasks are organized into numbered waves
- [ ] Each wave has exactly one validation task
- [ ] Validator blockedBy includes ALL builder tasks in its wave
- [ ] Wave N+1 builders blockedBy Wave N validator
- [ ] Validator model matches wave rule (sonnet/opus builders → validator-heavy, haiku-only → validator)
- [ ] Every task has Acceptance Criteria

If validation fails, fix the plan before continuing.

## Step 5: Present and Approve

Show the user a summary of the plan. Use AskUserQuestion with options:
- "Execute this plan" (Recommended)
- "Edit the plan first"
- "Cancel"

If "Edit the plan first": Tell user the plan location and wait for them to make changes, then re-read and validate.
If "Cancel": Stop execution.

## Step 6: Orchestrate

Execute the plan using wave-based orchestration:

1. **Create team**:
   ```
   TeamCreate(team_name="{slug}")
   ```

2. **Create ALL tasks** across all waves (builders + validators):
   ```
   TaskCreate for each task in the plan (all waves at once)
   ```

3. **Set ALL dependencies** via TaskUpdate:
   - Wave 1 builders: no blockers
   - Wave 1 validator: `addBlockedBy` all Wave 1 builder task IDs
   - Wave 2 builders: `addBlockedBy` Wave 1 validator task ID
   - Wave 2 validator: `addBlockedBy` all Wave 2 builder task IDs
   - Continue pattern for additional waves

4. **Assign owners** via TaskUpdate for all tasks.

5. **Spawn Wave 1 builders in parallel** (multiple Task() calls in one message):
   ```
   Task(subagent_type="{agent}", team_name="{slug}", name="{slug}-builder-1", prompt="...")
   Task(subagent_type="{agent}", team_name="{slug}", name="{slug}-builder-2", prompt="...")
   ```
   Use the agent type from the Complexity Analysis (builder-light, builder, or builder-heavy).
   Include the task description, acceptance criteria, and project context in each prompt.

6. **Monitor Wave 1** — check TaskList. When ALL Wave 1 builders complete:
   Spawn Wave 1 validator:
   ```
   Task(subagent_type="{validator-agent}", team_name="{slug}", name="{slug}-validator-1", prompt="...")
   ```
   Use validator-heavy if wave had sonnet/opus builders, otherwise validator.

7. **Handle validation result**:
   - **PASS** → proceed to spawn Wave 2 builders (same parallel pattern as step 5)
   - **FAIL** → create a fix task for the failed items, assign to appropriate builder, block re-validation on the fix task. Re-run validation after fix completes.

8. **Repeat** steps 6-7 for each subsequent wave.

9. **Complete** when all waves pass validation:
   - Present summary to user
   - SendMessage(type: "shutdown_request") to each agent
   - After all agents confirm shutdown, run TeamDelete()

## Step 7: Archive Plan

This step is **mandatory** after team completion. Do not skip it.

1. **Set completion date**: Edit `.specs/{slug}/plan.md` frontmatter, setting `completed: {YYYY-MM-DD}` to today's date
2. **Create archive directory** if needed: `mkdir -p .specs/archive`
3. **Move the plan**: `mv .specs/{slug}/ .specs/archive/{slug}/`
4. **Verify**: Confirm `.specs/archive/{slug}/plan.md` exists

This keeps completed plans for reference without cluttering active specs.

## Step 8: Error Recovery

- **TeamCreate fails**: Report error, no cleanup needed
- **Agent crashes**: Mark task as pending, reassign or ask user
- **All tasks stuck**: Present status to user and ask how to proceed
