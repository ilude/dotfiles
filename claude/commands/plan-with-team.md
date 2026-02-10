---
description: Generate a structured team execution plan with builder/validator agents
argument-hint: <task description>
---

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
# Team Plan: {task-name}

## Objective
{What needs to be done and why}

## Project Context
- **Language**: {detected from markers}
- **Test command**: {detected or "none detected"}
- **Lint command**: {detected or "none detected"}

## Team Members
| Name | Agent | Role |
|------|-------|------|
| {slug}-builder | builder (sonnet) | Implement changes |
| {slug}-validator | validator (haiku) | Verify output |

## Tasks

### Task 1: {implementation task name}
- **Owner**: {slug}-builder
- **Blocked By**: none
- **Description**: {what to implement}
- **Acceptance Criteria**:
  - [ ] {verifiable criterion 1}
  - [ ] {verifiable criterion 2}
- **Verification Command**: {detected lint/test command}

### Task 2: Validate implementation
- **Owner**: {slug}-validator
- **Blocked By**: Task 1
- **Description**: Run linters, tests, and content checks on the builder's output
- **Acceptance Criteria**:
  - [ ] All linters pass
  - [ ] All tests pass
  - [ ] No debug statements or hardcoded secrets

## Dependency Graph
Task 1 (builder) → Task 2 (validator)
```

For complex tasks, create multiple builder/validator task pairs.

## Step 4: Self-Validate Plan

Before presenting, verify the plan has:
- [ ] Objective section
- [ ] Team Members table
- [ ] At least one builder task
- [ ] At least one validator task
- [ ] Every validator task has `Blocked By` referencing a builder task
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

Execute the plan with these exact steps:

1. **Create team**:
   ```
   TeamCreate(team_name="{slug}")
   ```

2. **Create tasks** from the plan:
   ```
   TaskCreate for each task in the plan
   ```

3. **Set dependencies**:
   ```
   TaskUpdate(validator_task, addBlockedBy: [builder_task_ids])
   ```

4. **Spawn builder agent**:
   ```
   Task(subagent_type="builder", team_name="{slug}", name="{slug}-builder", prompt="...")
   ```
   Include the task description, acceptance criteria, and project context in the prompt.

5. **Spawn validator agent**:
   ```
   Task(subagent_type="validator", team_name="{slug}", name="{slug}-validator", prompt="...")
   ```
   Include what to validate and the verification commands.

6. **Assign tasks**: Use TaskUpdate to set owner on each task.

7. **Monitor progress**:
   - Check TaskList periodically
   - If builder completes → validator auto-unblocks
   - If validator reports FAIL → create fix task for builder, re-block validator
   - If an agent is idle too long → check on it via SendMessage

8. **Complete**:
   - When all tasks are done, present a summary to the user
   - Send shutdown messages to agents via SendMessage (natural language: "All tasks are complete, please shut down")
   - Use `type: "shutdown_request"` for each agent
   - After all agents confirm shutdown, run TeamDelete()
   - **Archive the plan**: Move `.specs/{slug}/` to `.specs/archive/{slug}/` (create `.specs/archive/` if needed). This keeps completed plans for reference without cluttering active specs.

## Step 7: Error Recovery

- **TeamCreate fails**: Report error, no cleanup needed
- **Agent crashes**: Mark task as pending, reassign or ask user
- **All tasks stuck**: Present status to user and ask how to proceed
