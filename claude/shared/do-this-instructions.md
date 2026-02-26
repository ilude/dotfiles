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
   - `Makefile` with `lint` target → `make lint`
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
5. **Deployment Procedure gate** — after all waves pass validation, check whether
   the plan contains a `## Deployment Procedure` section:
   - **If present**: Present the deployment steps to the user verbatim. Use
     AskUserQuestion with options:
     - "Run the deployment procedure now" (Recommended)
     - "Skip — I'll run the deployment manually later"
     - "Cancel"
     If "Run now": execute each numbered step in the procedure sequentially,
     pausing after each step to show the output and confirm it matches the
     expected output before proceeding. If any step fails, show the "If it
     fails" guidance from the plan and ask the user how to proceed.
   - **If absent**: Skip this step (pure code-change plans have no deployment).
6. After completion, **archive the plan**: set `completed` date in frontmatter, move to `.specs/archive/{slug}/`.
7. Go to **Step 7: Summary**.

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

Auto-generate a plan and execute with a team. Same plan quality as `/plan-with-team`
but skips the user approval gate — execute immediately after clarifying questions.

### 5a: Clarify Constraints

Run `/plan-with-team` Step 2.5 — ask the two clarifying questions (downtime tolerance,
ruled-out approaches) before generating the plan. Record the answers.

### 5b: Generate Plan

Create a slug from the task description (lowercase, hyphens, max 30 chars).

Write the plan to `.specs/{slug}/plan.md` using the **full template from `/plan-with-team`
Step 3** — including Problem Statement, Constraints & Acceptable Trade-offs, Alternatives
Considered, Deployment Procedure (if applicable), and Acceptance Criteria Guidelines with
Zero-Context Executability. Do NOT use a stripped-down template — the plan must be
reviewable by `/review-plan` and executable by `/do-this` Step 3.

Use the agent from Step 2d (Medium column). Validator model rule: if wave contains
sonnet/opus builder → `validator-heavy` (sonnet), otherwise → `validator` (haiku).

### 5c: Orchestrate

Execute immediately without asking for approval — follow `/plan-with-team` Step 6
(TeamCreate, TaskCreate, set dependencies, spawn agents, monitor waves, handle
validation, deployment procedure gate, shutdown, archive).

The only difference from the Complex Route is: Medium skips the "Execute this plan?"
approval prompt. Everything else — clarifying questions, full template, deployment
procedure gate — is identical.

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
