---
description: Smart router that triages tasks by complexity — single agent for simple work, auto-team for medium, full planning for complex
argument-hint: <task description or path to .specs/*/plan.md>
---

You are a smart task router. Analyze the input, determine complexity, and dispatch to the right execution path. Follow these steps precisely.

## Step 1: Parse Input

Task input: $ARGUMENTS

If `$ARGUMENTS` is empty, use the AskUserQuestion tool to ask: "What task should I work on?"

Determine the input type:

1. **Plan file**: If `$ARGUMENTS` is a file path ending in `plan.md` (e.g., `.specs/my-feature/plan.md`), read the file and go to **Step 3: Execute Plan**.
2. **Raw prompt**: Otherwise, treat `$ARGUMENTS` as a task description and go to **Step 2: Analyze & Triage**.

## Step 2: Analyze & Triage

### 2a: Scan Project

Run these checks automatically:

1. **Scan for marker files** in the current working directory:
   - Use Glob: `{pyproject.toml,package.json,go.mod,Cargo.toml,Makefile,tsconfig.json,*.csproj,Dockerfile,*.tf}`

2. **Detect primary language** from markers found:

   | Marker | Language |
   |--------|----------|
   | `pyproject.toml`, `*.py` files | Python |
   | `package.json`, `tsconfig.json`, `*.ts`/`*.tsx` | TypeScript/JS |
   | `*.csproj`, `*.cs` files | C# |
   | `Dockerfile`, `.github/`, `docker-compose.yml` | Docker/CI |
   | `*.tf` files | Terraform |
   | `go.mod` | Go |
   | `Cargo.toml` | Rust |
   | Multiple or none | General |

3. **Detect test command** based on markers:
   - `Makefile` present → `make test`
   - `pyproject.toml` present → `uv run pytest`
   - `package.json` present → `npm test`
   - `go.mod` present → `go test ./...`
   - `Cargo.toml` present → `cargo test`
   - `*.csproj` present → `dotnet test`

4. **Detect lint command** based on markers:
   - `pyproject.toml` → `uv run ruff check`
   - `package.json` → `npx @biomejs/biome check`
   - `Makefile` with shellcheck → `shellcheck`
   - `go.mod` → `go vet`
   - `*.csproj` → `dotnet format --verify-no-changes`

### 2b: Estimate Scope

Analyze the task description to estimate complexity:

| Signal | Scope |
|--------|-------|
| Single file mentioned, config change, typo fix, add a flag, rename, add one test | **Simple** (1-2 files) |
| "implement", "add feature", "refactor", "integrate", "extend", specific module work | **Medium** (3-5 files) |
| "architect", "redesign", "migrate", "cross-cutting", "overhaul", 6+ files, multiple subsystems | **Complex** (6+ files) |

Use the Explore agent (Task tool with subagent_type=Explore, quick thoroughness) to scan the codebase if the scope is ambiguous from the description alone. Look for how many files the change would touch.

### 2c: Select Route

| Scope | Route |
|-------|-------|
| Simple (1-2 files) | Go to **Step 4: Simple Route** |
| Medium (3-5 files) | Go to **Step 5: Medium Route** |
| Complex (6+ files) | Go to **Step 6: Complex Route** |

### 2d: Select Agent Type

Choose the agent based on detected language:

| Language | Simple Agent | Medium Agent | Complex Agent |
|----------|-------------|-------------|---------------|
| Python | `python-pro` | `python-pro` | `builder-heavy` |
| TypeScript/JS | `typescript-pro` | `typescript-pro` | `builder-heavy` |
| C# | `csharp-pro` | `csharp-pro` | `builder-heavy` |
| Docker/CI | `devops-pro` | `devops-pro` | `builder-heavy` |
| Terraform | `terraform-pro` | `terraform-pro` | `builder-heavy` |
| General/multi | `builder-light` | `builder` | `builder-heavy` |

## Step 3: Execute Plan

For existing `.specs/*/plan.md` files:

1. **Read the plan file** and validate it has the required sections (Objective, Team Members, Execution Waves).
2. **Check for existing active teams**:
   ```bash
   ls ~/.claude/teams/ 2>/dev/null
   ```
   If a team exists, ask: "A team is already active. Cancel it first?"
3. **Extract the slug** from the plan file path (e.g., `.specs/my-feature/plan.md` → `my-feature`).
4. **Execute directly** — follow the orchestration steps from `/plan-with-team` Step 6 (TeamCreate, TaskCreate, set dependencies, spawn agents, monitor waves, handle validation).
5. After completion, **archive the plan**: set `completed` date in frontmatter, move to `.specs/archive/{slug}/`.
6. Go to **Step 7: Summary**.

## Step 4: Simple Route

Dispatch a single specialized agent. No team creation needed.

1. **Select agent** using the table from Step 2d (Simple column).
2. **Dispatch agent** using the Task tool:
   ```
   Task(
     subagent_type="{selected-agent}",
     prompt="Task: {task description}

     Project context:
     - Language: {detected language}
     - Test command: {detected or 'none detected'}
     - Lint command: {detected or 'none detected'}

     Instructions:
     1. Analyze the relevant files
     2. Implement the change
     3. Run lint: {lint command}
     4. Run tests: {test command}
     5. Report what you changed and validation results"
   )
   ```
3. **Review agent output** when it returns.
4. Go to **Step 7: Summary**.

## Step 5: Medium Route

Auto-generate a plan and execute with a team. No approval gate — execute immediately.

### 5a: Generate Plan

Create a slug from the task description (lowercase, hyphens, max 30 chars).

Write the plan to `.specs/{slug}/plan.md` using the same template as `/plan-with-team` Step 3:

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

| Task | Est. Files | Change Type | Model | Agent |
|------|-----------|-------------|-------|-------|
| {task name} | {count} | {mechanical/feature/architecture} | {model} | {agent} |

## Team Members

| Name | Agent | Model | Role |
|------|-------|-------|------|
| {slug}-builder-1 | {agent type} | {model} | {role description} |
| {slug}-validator-1 | {validator or validator-heavy} | {model} | Wave validation |

## Execution Waves

### Wave 1 (parallel)
- T1: {task name} [{model}] — {agent}

### Wave 1 Validation
- V1: Validate wave 1 [{validator model}] — {validator agent}, blockedBy: [T1]
```

Use the agent from Step 2d (Medium column). Validator model rule: if wave contains sonnet/opus builder → `validator-heavy` (sonnet), otherwise → `validator` (haiku).

### 5b: Orchestrate

Execute immediately without asking for approval:

1. **Create team**: `TeamCreate(team_name="{slug}")`
2. **Create ALL tasks** (builders + validators) via TaskCreate.
3. **Set dependencies** via TaskUpdate:
   - Wave 1 builders: no blockers
   - Wave 1 validator: `addBlockedBy` all Wave 1 builder task IDs
   - Wave N+1 builders: `addBlockedBy` Wave N validator task ID
4. **Assign owners** via TaskUpdate.
5. **Spawn Wave 1 builders in parallel** using Task tool with `team_name` and `name` parameters.
6. **Monitor** — check TaskList. When all Wave 1 builders complete, spawn validator.
7. **Handle validation**:
   - **PASS** → spawn next wave (if any)
   - **FAIL** → create fix task, assign to builder, re-validate after fix
8. **Repeat** for each wave.
9. **Complete**: shutdown agents (SendMessage type: "shutdown_request"), then TeamDelete.
10. **Archive plan**: set `completed` date, move to `.specs/archive/{slug}/`.
11. Go to **Step 7: Summary**.

## Step 6: Complex Route

Delegate to `/plan-with-team` for full planning with user approval.

1. Tell the user: "This looks like a complex task (6+ files, cross-cutting changes). Delegating to `/plan-with-team` for proper planning with your approval."
2. Invoke the `/plan-with-team` skill using the Skill tool:
   ```
   Skill(skill="plan-with-team", args="{original task description}")
   ```
3. `/plan-with-team` handles everything from here (planning, approval, orchestration, archiving).
4. Done — `/plan-with-team` provides its own summary.

## Step 7: Summary

Present a concise summary to the user:

```
## Done

**Route**: {Simple|Medium|Execute Plan}
**Agent(s)**: {agent type(s) used}
**Changes**: {brief list of files changed}
**Validation**: {PASS/FAIL + details}
```

If any validation failed and could not be resolved, clearly state what needs manual attention.

## Error Recovery

- **Agent crashes**: Report error to user, suggest re-running with same input.
- **TeamCreate fails**: Report error, no cleanup needed.
- **Validation loop (3+ failures)**: Stop retrying, present failures to user and ask how to proceed.
- **Ambiguous scope**: Default to Medium route (safer to over-provision than under-provision). If truly uncertain, use AskUserQuestion:
  - "Simple (single agent, fast)" (Recommended)
  - "Medium (auto-team, no approval)"
  - "Complex (full planning with approval)"
