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

## Step 2.5: Clarify Constraints Before Planning

Before writing any plan, ask these two questions using AskUserQuestion (multiSelect: false,
one question at a time):

1. **Downtime / disruption tolerance**:
   "What downtime or service disruption is acceptable during this change?
   Examples: none (external customers 24/7), brief interruption OK (<2 min, off-peak),
   full maintenance window acceptable."

2. **Ruled-out approaches**:
   "Are there any approaches you've already ruled out or tried?
   (e.g., 'we tried blue/green but it doubles cost', 'rolling deploys not viable because
   of stateful sessions')"

Record the answers — they become the seed text for the Constraints & Acceptable
Trade-offs and Alternatives Considered sections. Do NOT generate the plan until both
questions are answered. If the user says "no constraints" or "no ruled-out approaches",
that is a valid answer — record it as-is.

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

## Problem Statement
{What triggered this work? What is the actual pain point or user need?
Be specific — "autoscaler can't scale down nodes because DaemonSet pins one pod per node"
is better than "improve cluster efficiency."}

## Constraints & Acceptable Trade-offs
{What has the user explicitly accepted or rejected? This section prevents reviewers
and builders from optimizing for constraints that don't exist.}

Examples:
- "Brief downtime (< 2 min) during off-peak maintenance window is acceptable"
- "Zero downtime is mandatory — this serves external customers 24/7"
- "Cost must not increase by more than $X/month"
- "Solution must be reversible within 5 minutes"

## Alternatives Considered
{List 2-3 other approaches and why this one was chosen. Even a one-liner per alternative
helps reviewers understand the decision space.}

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| {approach 1} | {pros} | {cons} | **Selected** / Rejected |

## Objective
{What needs to be done, how, and the expected outcome}

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

## Acceptance Criteria Guidelines

Every task MUST have verifiable acceptance criteria. For methodology, the `planning` skill auto-activates with detailed guidance.

### Zero-Context Executability

Every command in this plan — in acceptance criteria, in the deployment procedure, or
anywhere else — MUST specify three things:

1. **WHERE it runs**: working directory, host type (local, bastion, pod exec), or
   "any host with kubeconfig"
2. **WHAT the expected output is**: a specific string, exit code, or resource state
   that indicates success
3. **WHAT to do if it fails**: retry, rollback, or escalate — do not leave the
   operator guessing

A plan that says "run the migration" without these three things is incomplete.

**Quick rules:**
- Each criterion must be specific and measurable (no "looks good" or "works correctly")
- Include a verification method: exact command, test, API call, or file check
- Include expected result

**Format:**
1. [ ] [Specific, measurable outcome]
   - Verification: [Exact command or test to run]
   - Expected result: [What passing looks like]

**Example:**
- T1: Add user endpoint
  - AC: `curl -s localhost:3000/api/users | jq '.status'` returns `200`
  - AC: `npm test -- users.test.ts` passes with 0 warnings

## Deployment Procedure

*(Include this section for any plan that involves running commands against live
infrastructure, clusters, or services. Omit for pure code-change plans.)*

A numbered sequence of commands the operator runs to execute this change. Each step
MUST include:

- **Where**: Working directory or host (e.g., `regions/us-east-2/gitlab-prod/`,
  `kubectl exec -n gitlab`, local machine)
- **Command**: The exact command to run (no placeholders unless the value is
  documented elsewhere in this plan)
- **Expected output**: What a successful run looks like (exit code, a specific
  log line, a resource status)
- **If it fails**: What to do — rollback command, support escalation path, or
  "safe to retry" if idempotent
```

For complex tasks, create multiple waves with parallel builders and validation gates between them.

## Step 4: Self-Validate Plan

Before presenting, verify the plan has:
- [ ] Problem Statement section: present AND contains specific pain point text, not
      placeholder text like "{What triggered this work?}" or vague summaries like
      "improve the system." If empty or placeholder → STOP, fill it in from Step 2.5
      answers before continuing.
- [ ] Constraints & Acceptable Trade-offs section: present AND contains at least one
      explicit statement from the user (not the template examples). Acceptable entries
      include "No constraints stated — brief downtime accepted per user confirmation."
      If still shows template example text → STOP.
- [ ] Alternatives Considered section: present AND contains at least 2 rows with real
      Verdict entries ("Selected" or "Rejected" with a reason). A table with only the
      header row or template placeholders → STOP.
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
- [ ] Each Acceptance Criterion has a verification command or test

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

9. **Deployment Procedure gate** — after all waves pass validation, check whether
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

10. **Complete** when all waves pass validation (and deployment procedure is
    finished or skipped):
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
