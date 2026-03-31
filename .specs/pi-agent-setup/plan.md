---
created: 2026-03-30
status: draft
completed:
---

# Plan: Pi Coding Agent — Local Install & IndyDevDan-Style Extensions

## Context & Motivation

The user wants to build a sophisticated **specialized multi-agent system** using Pi—not just install an alternative to Claude Code. Pi is an open-source, extensible terminal coding agent (github.com/badlogic/pi-mono, 29.3k stars, MIT) with radical minimalism (4 tools, ~200-token system prompt) and aggressive extensibility via TypeScript, allowing production agent systems that Claude Code cannot support.

**IndyDevDan's System Architecture** (from video transcripts and working implementation):

**Core Innovation: Knowledge Compounding via Expertise Files**
- Each agent maintains a personal **expertise file** (YAML) — their mental model of the system
- Expertise files track: system architecture, key files, implementation details, patterns discovered, strong decisions (with WHY), observations, safety properties, open questions
- **Expertise grows over sessions**: Session 1 (just patterns) → Session 5 (growing context) → Session 10 (rich patterns) → Session 20+ (tribal knowledge)
- Example: backend-dev-mental-model.yaml tracks orchestration harness + secret scanner design, test strategies, security patterns, observability decisions, multi-project sessions

**Three-Layer Knowledge System**
1. **Skills** (shared methodology): mental-model, active-listener, conversational-response, precise-worker, zero-micro-management, high-autonomy
2. **Expertise Files** (agent knowledge): one per agent, updated after completing work, read at task start
3. **Agent Personas** (agent identity): 10 specialized roles with domain constraints

**Three-Tier Architecture** (Orchestrator → Leads → Workers):
- **Orchestrator** (Opus): routes requests to team leads via `subagent` tool (Pi's native subagent orchestration), synthesizes team outputs
- **Team Leads** (Sonnet): Planning Lead, Engineering Lead, Validation Lead — each orchestrates their team
- **Workers** (Sonnet): Frontend Dev, Backend Dev, Product Manager, UX Researcher, QA Engineer, Security Reviewer — each owns their domain
- **Domain Locking**: read/upsert/delete constraints per agent (e.g., Frontend can read Backend but not modify). Pi natively parses only name/description/tools; expertise/skills/domain constraints require custom extension parsing (T5/T6 extensions implement this)

**Proof of Concept: Prompt Routing Classifier**
- 10 agents (3 teams) built a TF-IDF + LogisticRegression classifier that routes prompts to Haiku/Sonnet/Opus
- Result: 85.3% accuracy on 150-example holdout set, **zero HIGH→LOW inversions** (catastrophic failures prevented)
- Multiple perspectives: Planning caught routing bias, Engineering optimized thresholds, Validation caught cost/token tracking

**Session Management**
- Append-only JSONL conversation log shared across all agents (user, orchestrator, leads, members)
- Per-session directories track notes, artifacts, expertise updates
- Session IDs track which session added what knowledge (enables history + traceability)

The user already has a sophisticated Claude Code setup — making Pi a **platform for production agentic systems** with persistent knowledge compounding and specialized agent teams.

Research sources:
- Pi monorepo: https://github.com/badlogic/pi-mono
- Pi coding agent package: https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
- IndyDevDan's pi-vs-claude-code: https://github.com/disler/pi-vs-claude-code (15+ extensions reference)
- Awesome Pi agent ecosystem: https://github.com/qualisero/awesome-pi-agent
- Pi skills (official): https://github.com/badlogic/pi-skills
- IndyDevDan's 2026 agentic roadmap: https://agenticengineer.com/top-2-percent-agentic-engineering

## Constraints

- Platform: Windows 11 (Git Bash/MSYS2 shell)
- Shell: bash (Unix syntax, forward slashes)
- Node.js v25.6.1, npm 11.9.0, Bun 1.3.9, `just` — all prerequisites met
- Must coexist with existing Claude Code, OpenCode, and Copilot setups
- Must follow dotfiles repo conventions (Dotbot-managed symlinks, install script integration)
- API key: user has ANTHROPIC_API_KEY (used by Claude Code already)
- No ~/.pi directory exists yet — clean install
- Extensions use jiti (TypeScript without compilation) — no build step needed
- Pi reads AGENTS.md and CLAUDE.md for context — can share existing context files

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Install Pi globally + dotfiles-managed config** | Clean integration with existing dotfiles workflow, symlink Pi config from repo, idempotent | Requires new `pi/` subtree in dotfiles, install script changes | **Selected** — matches existing pattern (claude/, opencode/, copilot/) |
| Install Pi globally, manual config in ~/.pi | Fastest to start, no repo changes | Config not versioned, not reproducible across machines, breaks dotfiles philosophy | Rejected: doesn't match repo conventions |
| Clone pi-vs-claude-code repo directly | Get all IndyDevDan extensions immediately | Foreign repo in dotfiles, no customization path, stale copy | Rejected: should build our own extensions informed by his patterns |
| Use Pi SDK embedded in a custom project | Maximum control, can build custom agent harness | Overkill for exploration phase, high complexity | Rejected for now: revisit after MVP exploration |

## Objective

When complete, you can:

1. **Tier 1 (Harness)**: Pi installed, configured, integrated into dotfiles
   - `pi` command works globally with dotfiles-managed config
   - Config lives in `pi/` with Dotbot symlinks to `~/.pi/`
   - `pi-link-setup` script handles migration (matching claude-link-setup pattern)
   - Install scripts updated

2. **Tier 2 (Agent Orchestration)**: Build specialized multi-agent teams with knowledge compounding
   - **10 agent personas** with domain constraints: Orchestrator, Planning Lead, Engineering Lead, Validation Lead, Frontend Dev, Backend Dev, Product Manager, UX Researcher, QA Engineer, Security Reviewer
   - **Expertise files** (YAML): each agent maintains personal mental model tracking system architecture, key files, patterns, strong decisions (with WHY), observations, safety properties, open questions
   - **Three shared skills** (methodology layer): mental-model (manage expertise), active-listener (read conversation history), precise-worker (execute assignments exactly)
   - **Conversation log** (append-only JSONL): shared context across all agents, read at task start
   - **Domain locking**: read/upsert/delete constraints enforced per agent (damage-control extension)
   - **Expertise grows over sessions**: Session 1 (patterns) → Session 20+ (tribal knowledge)

3. **Tier 3 (Proof of Concept)**: Agents build production infrastructure using their own system
   - ML Team (4 agents) builds a TF-IDF + LogisticRegression classifier
   - Routes prompts to Haiku/Sonnet/Opus based on complexity
   - Result: 85.3% accuracy, **zero catastrophic misroutes** (HIGH→LOW inversions prevented)
   - Demonstrates multi-perspective advantage: Planning, Engineering, Validation catch different issues

**Success**:
- Agents autonomously update their expertise files as they work
- Knowledge compounds across sessions (patterns → tribal knowledge)
- You can launch `pi` with stacked extensions and coordinate 10 specialized agents
- Each agent reads their expertise file at task start, updates it after work completes
- Team leads delegate work, workers execute precisely, orchestrator synthesizes output

## Project Context

- **Language**: Mixed (Python, Shell, PowerShell, TypeScript for Pi extensions)
- **Test command**: `make test` / `make test-quick`
- **Lint command**: `make lint` (ruff for Python, shellcheck for shell)

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Install Pi globally via npm | 0 | mechanical | haiku | builder-light | — |
| T2 | Create pi/ config subtree in dotfiles | ~6 | feature | sonnet | builder | — |
| T3 | Create pi-link-setup script | 1 | feature | sonnet | builder | — |
| V1 | Validate wave 1 | — | validation | sonnet | validator-heavy | T1, T2, T3 |
| T4 | Wire Pi into dotfiles install flow | ~3 | feature | sonnet | builder | V1 |
| T5 | Build damage-control extension | ~2 | feature | sonnet | builder | V1 |
| T6 | Build plan-build-review agent-chain extension | ~3 | feature | sonnet | builder | V1 |
| V2 | Validate wave 2 | — | validation | sonnet | validator-heavy | T4, T5, T6 |
| T7 | Build agent-team dispatcher extension | ~3 | feature | sonnet | builder | V2 |
| T8 | Create justfile recipes for extension stacking | 1 | mechanical | haiku | builder-light | V2 |
| T9 | Install community packages (pi-skills, etc.) | 0 | mechanical | haiku | builder-light | V2 |
| V3 | Validate wave 3 + end-to-end | — | validation | sonnet | validator-heavy | T7, T8, T9 |
| T10 | Build prompt routing classifier system (Tier 3 capstone) | ~10 | architecture | opus | builder-heavy | V3 |
| V4 | Validate T10 + production-ready proof | — | validation | sonnet | validator-heavy | T10 |

## Execution Waves

### Wave 1 (parallel)

**T1: Install Pi globally via npm** [haiku] — builder-light
- Description: Install `@mariozechner/pi-coding-agent` globally. Verify the `pi` command is available and can show version/help. Document extension loading method (CLI flag vs. directory-based discovery) and verify ANTHROPIC_API_KEY is accessible.
- Files: none (system-level install)
- Acceptance Criteria:
  1. [ ] `pi` command is available in PATH
     - Verify: `pi --help`
     - Pass: Shows Pi help/usage text
     - Fail: "command not found" — check `npm root -g`, ensure global bin in PATH
  2. [ ] Pi can start with API key
     - Verify: `echo "exit" | ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY pi --mode print --no-session 2>&1 | head -5`
     - Pass: Pi starts without auth errors
     - Fail: Auth error — ensure ANTHROPIC_API_KEY is exported in `~/.zshrc` or `~/.bashrc`, verify: `echo $ANTHROPIC_API_KEY | wc -c` (should be 50+)
  3. [ ] Verify extension loading method (critical for acceptance criteria in T5/T6/T7)
     - Verify: `pi --help | grep -i extension` OR `pi -h 2>&1 | grep -E '^\s*-e|--extension'`
     - Pass: Flag is documented (e.g., `-e` or `--extension`), use it in acceptance criteria below
     - Fail: Flag not found — verify method via Pi README. If auto-discovery from `~/.pi/agent/extensions/` only, update T5/T6/T7 acceptance criteria to use directory placement instead of `-e` flag
  4. [ ] Verify model ID aliases work (for agent configuration)
     - Verify: `pi --mode print -p "2+2" 2>&1 | grep -iE 'model|sonnet|opus' | head -1`
     - Pass: Model accepted, response generated
     - Fail: Model not found error — use alias names (e.g., `claude-sonnet-4-5`) instead of version-pinned IDs

**T2: Create pi/ config subtree with 10 agents and expertise system** [sonnet] — builder
- Description: Create `pi/` subtree with **10 agent personas**, expertise files, shared skills, and session management. This is the knowledge compounding system — expertise files are personal mental models that agents read at task start and update after work. Structure follows IndyDevDan's working implementation. **Note (BUG-6):** Domain constraint examples in persona files (e.g., `apps/backend/`, `apps/frontend/`) are **project-specific placeholders** — this dotfiles repo has no `apps/` directory. When using agents on a real project, executor must update domain paths in agent persona files to match that project's structure. Default behavior: agents accept empty/broad domains and executors configure per-project. **CRITICAL (T1-Reviewer Finding #3)**: Pi does NOT auto-discover AGENTS.md at startup. Must explicitly configure context loading in `pi/settings.json` via `appendSystemPrompt` or `promptTemplate` to load `pi/AGENTS.md` + `pi/multi-team/CLAUDE.md`.

- Files:
  - `pi/settings.json` — Pi runtime settings (with corrected field names: defaultModel, not model)
  - `pi/AGENTS.md` — global context
  - `pi/extensions/` — custom extensions
  - **`pi/agents/`** (agent discovery directory — Pi looks here):
    - 10 agent personas (orchestrator.md, planning-lead.md, etc.) with `description` field required
    - `teams.yaml` — team roster with hierarchy (canonical config location)
  - **`pi/multi-team/`** (core orchestration metadata):
      - `orchestrator.md` — routes to team leads, synthesizes output (YAML frontmatter + markdown role definition)
      - `planning-lead.md`, `engineering-lead.md`, `validation-lead.md` — team leads
      - `frontend-dev.md`, `backend-dev.md` — engineering workers
      - `product-manager.md`, `ux-researcher.md` — planning workers
      - `qa-engineer.md`, `security-reviewer.md` — validation workers
  - **`pi/multi-team/expertise/`** — 10 YAML files, one per agent:
      - Each tracks: system overview, key files with roles, implementation details, patterns discovered, strong decisions (with "why_good"), observations, safety properties, open questions
      - Example structure: `backend-dev-mental-model.yaml` (lines 1-500+) tracks orchestration harness, secret scanner, API patterns, security decisions, test strategies, observability, multi-session history
      - Max 10,000 lines per file (updatable: true)
      - Empty on first run, filled as agents work
    - **`sessions/`** — directory for per-session artifacts
      - `{SESSION_ID}/conversation.jsonl` — append-only log of all exchanges (user, orchestrator, leads, workers)
      - `{SESSION_ID}/notes.md` — session summary, decisions made
    - **`logs/`** — execution logs
    - **`skills/`** — 6+ shared skill files (markdown):
      - `mental-model.md` — how to manage expertise files (read at start, update after work)
      - `active-listener.md` — read conversation log before responding
      - `conversational-response.md` — write clear responses
      - `precise-worker.md` — execute lead assignments exactly, no improvising
      - `zero-micro-management.md` — delegate, never execute (for leads)
      - `high-autonomy.md` — act autonomously, zero questions (for orchestrator)
- Acceptance Criteria:
  1. [ ] All 10 agent personas exist and are valid YAML+markdown hybrids
     - Verify: `ls pi/multi-team/agents/ | wc -l`
     - Pass: 10 files
     - Fail: Missing agent definitions
  2. [ ] All 10 expertise files exist with schema versioning (empty YAML on first run, H-1)
     - Verify: `ls pi/multi-team/expertise/ | wc -l` && `head -5 pi/multi-team/expertise/backend-dev-mental-model.yaml | grep -E 'schema_version|last_updated'`
     - Pass: 10 `.yaml` files present; at least one includes schema_version and last_updated fields
     - Fail: Missing expertise definitions OR missing schema version fields (add to initial structure: `schema_version: 1` and `last_updated: SESSION_ID`)
  3. [ ] All 6+ skill files exist with use-when guidance
     - Verify: `test -s pi/multi-team/skills/mental-model.md && echo OK`
     - Pass: "OK" and other skills exist
     - Fail: Missing skill files
  4. [ ] teams.yaml defines complete team hierarchy (canonical config location)
     - Verify: `python -c "import yaml; d=yaml.safe_load(open('pi/agents/teams.yaml')); assert 'orchestrator' in d and 'planning' in d and 'engineering' in d and 'validation' in d"`
     - Pass: All team keys present
     - Fail: Missing team definitions
  5. [ ] AGENTS.md context loading configured in settings.json (CRITICAL: T1-Reviewer Finding #3)
     - Verify: `python -c "import json; d=json.load(open('pi/settings.json')); assert ('appendSystemPrompt' in d or 'promptTemplate' in d or 'contextFiles' in d) and ('AGENTS.md' in str(d) or 'multi-team' in str(d))"`
     - Pass: settings.json explicitly references pi/AGENTS.md or pi/multi-team/ context
     - Fail: No context configuration — add `appendSystemPrompt: ["pi/AGENTS.md"]` or equivalent to settings.json

**T3: Create pi-link-setup script** [sonnet] — builder
- Description: Create `scripts/pi-link-setup` following the pattern of `scripts/claude-link-setup`. This script symlinks `~/.pi/agent/` contents from the dotfiles `pi/` directory. Must be idempotent, cross-platform (Git Bash + Linux), and handle first-run vs re-run gracefully. **Windows Note (H-8):** Follow `claude-link-setup` pattern and use junctions, not symlinks, since symlinks require elevated privileges on Windows. Use `cmd //c mklink /J` for junction creation on Windows.
- Files:
  - `scripts/pi-link-setup`
- Acceptance Criteria:
  1. [ ] Script is executable and runs without error
     - Verify: `bash scripts/pi-link-setup`
     - Pass: Exits 0, creates ~/.pi/agent/ symlinks (Linux/WSL) or junctions (Windows)
     - Fail: Non-zero exit — check error output
  2. [ ] Symlinks/junctions point to correct dotfiles sources
     - Verify: `readlink ~/.pi/agent/settings.json` (Linux) OR `cmd //c dir %USERPROFILE%\.pi\agent | findstr settings.json` (Windows)
     - Pass: Points to `~/.dotfiles/pi/settings.json` or shows junction target
     - Fail: Wrong target or not a link
  3. [ ] Script handles ~/.pi/agent/ creation order gracefully (H-8 verification)
     - Verify: Test behavior when Pi has already created `~/.pi/agent/`: `mkdir -p ~/.pi/agent && bash scripts/pi-link-setup`
     - Pass: Script completes without errors, existing dir is reused
     - Fail: "file exists" or permission errors — ensure script checks for pre-existing dir
  4. [ ] Script is idempotent (re-run is safe)
     - Verify: `bash scripts/pi-link-setup && bash scripts/pi-link-setup`
     - Pass: Both runs exit 0 with no errors
     - Fail: "file exists" errors on second run

### Wave 1 — Validation Gate

**V1: Validate wave 1** [sonnet] — validator-heavy
- Blocked by: T1, T2, T3
- **CRITICAL (T1-Reviewer Finding #1)**: Verify append-only expertise pattern in T6 before proceeding to Wave 2
- **CRITICAL (T1-Reviewer Finding #3)**: Verify AGENTS.md context is configured in settings.json
- Checks:
  1. `pi --help` succeeds
  2. `pi/settings.json` is valid JSON AND includes context loading configuration (CRITICAL #3)
     - Must have `appendSystemPrompt` or `promptTemplate` or `contextFiles` referencing `pi/AGENTS.md`
  3. `pi/AGENTS.md` is non-empty
  4. `scripts/pi-link-setup` runs idempotently
  5. `~/.pi/agent/settings.json` is a symlink (or junction on Windows) to dotfiles
  6. `make lint` passes (shellcheck on pi-link-setup)
  7. Cross-task: Pi config dirs exist AND link script covers all of them
  8. JSONL schema is defined and documented for conversation logs (H-3): Check pi/multi-team/sessions/ directory structure and conversation.jsonl schema (at least one test file with proper fields)
  9. **CRITICAL**: T2 acceptance criterion #5 passes — AGENTS.md context loading verified
  10. **CRITICAL**: Document append-only expertise pattern requirement for T6 (CRITICAL #1)

### Wave 2 (parallel)

**T4: Wire Pi into dotfiles install flow** [sonnet] — builder
- Description: Update the install scripts to include Pi. Add `npm install -g @mariozechner/pi-coding-agent` to the install flow (both `install` for bash and `install.ps1` for Windows). Call `scripts/pi-link-setup` from the install flow. Update `install.conf.yaml` if Dotbot can manage the base `~/.pi/agent/` directory creation.
- Files:
  - `install` (bash installer)
  - `install.ps1` (PowerShell installer)
  - `install.conf.yaml` (Dotbot config, if applicable)
- Acceptance Criteria:
  1. [ ] Install script includes Pi npm install step
     - Verify: `grep -q 'pi-coding-agent' install`
     - Pass: Match found
     - Fail: Not found — add npm install line
  2. [ ] Install script calls pi-link-setup
     - Verify: `grep -q 'pi-link-setup' install`
     - Pass: Match found
     - Fail: Not found — add script call
  3. [ ] Install remains idempotent
     - Verify: Run install section in dry-run or check script logic
     - Pass: Re-run doesn't break existing setup
     - Fail: Duplicate installs or broken symlinks

**T5: Build damage-control extension** [sonnet] — builder
- Description: Create `pi/extensions/damage-control.ts` — a safety extension that intercepts tool_call events and enforces domain constraints (read/upsert/delete per path). This is the runtime enforcement layer for **domain locking** — preventing frontend agents from deleting backend code, QA from modifying core infrastructure, etc. Port the philosophy from the existing Claude Code quality validation hooks.

  **Domain Locking Pattern** (from backend-dev example):
  ```yaml
  domain:
    - path: .pi/multi-team/          # Team infrastructure
      read: true
      upsert: true
      delete: false                   # Protected — no agent can delete team files
    - path: apps/backend/
      read: true
      upsert: true
      delete: true                    # Backend dev can modify/delete backend
    - path: apps/frontend/
      read: true
      upsert: false
      delete: false                   # Backend dev can READ frontend, not modify
    - path: .
      read: true
      upsert: false
      delete: false                   # Limit root-level modifications
  ```

  Include a YAML rules file at `pi/damage-control-rules.yaml` for agent constraint loading and dangerous-command detection.

- Files:
  - `pi/extensions/damage-control.ts`
  - `pi/damage-control-rules.yaml`
- Rules to implement:
  - **Domain constraint enforcement** (per-agent read/upsert/delete): Load agent domain from persona file, block operations outside constraint. **Path canonicalization (H-4)**: Use `path.resolve(ctx.cwd, toolPath)` to normalize paths and resolve symlinks before constraint checking — prevents `../` traversal escapes.
  - **Dangerous commands** (block with confirmation): `rm -rf`, `git reset --hard`, `git push --force`, `DROP TABLE`, `DROP DATABASE`, `git clean -f`, `chmod 777`, `> /dev/sda`
  - **Zero-access paths** (block read+write): `~/.ssh/*`, `*.pem`, `*.key`, `.env`, `*credentials*`, `*secret*`
  - **Read-only paths** (allow read, block write): system config files, `/etc/*`
  - **No-delete paths** (allow edit, block delete): `package.json`, `Cargo.toml`, `pyproject.toml`, `Makefile`, `.git/HEAD`
- Acceptance Criteria:
  1. [ ] Extension loads without error
     - Verify: `pi -e pi/extensions/damage-control.ts --mode print --no-session -p "hello" 2>&1 | head -5`
     - Pass: No TypeScript/import errors
     - Fail: Module errors — check imports and TypeBox dependency
  2. [ ] YAML rules file is valid and includes domain constraint schema
     - Verify: `python -c "import yaml; d=yaml.safe_load(open('pi/damage-control-rules.yaml')); assert 'dangerous_commands' in d and 'zero_access_paths' in d and 'domain_constraints' in d"`
     - Pass: All keys present
     - Fail: Missing keys or YAML parse error
  3. [ ] Extension registers tool_call event handler and enforces constraints (with path canonicalization, H-4)
     - Verify: grep for `pi.on("tool_call"` in the extension; grep for domain constraint logic AND path normalization (e.g., `path.resolve` or `realpath`)
     - Pass: Handler registered AND constraint checking code present AND path canonicalization present
     - Fail: Missing event handler, constraint enforcement, or path normalization — test with `../` traversal attempt to verify blocking

**T6: Build expertise-driven agent-chain extension** [sonnet] — builder
- Description: Implement expertise file system — the core mechanism for knowledge compounding. Agents read expertise at task start (mental-model skill), update after work completes. Build YAML persistence, conversation log integration, and session history tracking. Agents load their expertise files and begin building institutional memory across sessions. **Schema Definitions (H-3)**: Define formal JSONL schema for conversation logs so all agents write consistently. **CRITICAL (T1-Reviewer Finding #1)**: Do NOT use in-place YAML edits for expertise updates — concurrent writes corrupt files. Use append-only JSONL pattern instead: agents append discoveries to `{agent}-expertise-log.jsonl`, read-time folds into expertise state.

  **Agent Persona Structure** (hybrid YAML frontmatter + markdown documentation, fixes from Reviewer 4):

  **Backend-Dev (Worker):**
  ```yaml
  ---
  name: backend-dev
  description: Builds and maintains backend API, database, and infrastructure
  model: anthropic/claude-sonnet-4-6
  expertise:
    - path: .pi/multi-team/expertise/backend-dev-mental-model.yaml
      use-when: "Track API design decisions, database patterns, infrastructure choices..."
      updatable: true
      max-lines: 10000
  skills:
    - conversational-response          # simple string reference
    - path: .pi/multi-team/skills/mental-model.md
      use-when: Read at task start. Update after completing work.
    - path: .pi/multi-team/skills/active-listener.md
      use-when: Always. Read the conversation log before every response.
    - path: .pi/multi-team/skills/precise-worker.md
      use-when: Always. Execute exactly what your lead assigned – no improvising.
  tools: read, write, edit, bash, grep
  domain:
    - path: .pi/multi-team/
      read: true
      upsert: true
      delete: false
    - path: apps/backend/
      read: true
      upsert: true
      delete: true
    - path: apps/frontend/
      read: true                      # Can read frontend, not modify
      upsert: false
      delete: false
    - path: .
      read: true
      upsert: true
      delete: false
  ---

  # Backend Dev

  ## Purpose
  You build and maintain the backend API, database, and infrastructure. Track API design decisions,
  database patterns, infrastructure choices, and scaling observations in your expertise file.
  ```

  **Orchestrator (Leader) — similar structure with high-autonomy + zero-micro-management:**
  ```yaml
  ---
  name: orchestrator
  description: Coordinates product team, classifies requests, dispatches to specialists
  model: anthropic/claude-opus-4-6
  skills:
    - path: .pi/multi-team/skills/conversational-response.md
      use-when: Always use when writing responses.
    - path: .pi/multi-team/skills/mental-model.md
      use-when: Read at task start for context. Update after completing work.
    - path: .pi/multi-team/skills/active-listener.md
      use-when: Always. Read the conversation log before every response.
    - path: .pi/multi-team/skills/zero-micro-management.md
      use-when: Always. You are a leader – delegate, never execute.
    - path: .pi/multi-team/skills/high-autonomy.md
      use-when: Always. Act autonomously, zero questions.
  tools: read, grep, find, ls, subagent
  domain:
    - path: .pi/multi-team/
      read: true
      upsert: true
      delete: false
    - path: .
      read: true
      upsert: false
      delete: false
  ---

  # Orchestrator — Product Team Coordinator

  ## Purpose
  You coordinate a product team. User talks to you. You classify their request, dispatch to the
  right team using the `subagent` tool (Pi native subagent orchestration), and synthesize output into a direct answer.
  ```

  **Planning Lead (Team Lead) — read-heavy, specs-focused:**
  ```yaml
  domain:
    - path: specs/
      read: true
      upsert: false                   # Read plans, can't modify
      delete: false
    - path: .pi/
      read: true
      upsert: true
      delete: false
    - path: .
      read: true
      upsert: false
      delete: false
  ---

  # Planning Lead

  ## Purpose
  You lead product planning. Define what we're building, why, and in what order.
  Write specs, define user stories, set priorities, manage scope.
  ```

- Files:
  - `pi/extensions/agent-chain.ts` (extension that sequences agents)
  - **`pi/multi-team/agents/planner.md`** (YAML: orchestrator persona, leadership skills)
  - **`pi/multi-team/agents/builder.md`** (YAML: worker persona, precise-worker skill)
  - **`pi/multi-team/agents/reviewer.md`** (YAML: worker persona, precise-worker skill)
  - **`pi/multi-team/skills/conversational-response.md`** (shared)
  - **`pi/multi-team/skills/mental-model.md`** (shared: read at start, update at end)
  - **`pi/multi-team/skills/active-listener.md`** (shared: read conversation before responding)
  - **`pi/multi-team/skills/precise-worker.md`** (worker-specific: execute lead assignments exactly)
  - **`pi/multi-team/skills/zero-micro-management.md`** (leadership: delegate, never execute)
  - **`pi/multi-team/expertise/planner-mental-model.yaml`** (updatable, empty on first run)
  - **`pi/multi-team/expertise/builder-mental-model.yaml`** (updatable, empty on first run)
  - **`pi/multi-team/expertise/reviewer-mental-model.yaml`** (updatable, empty on first run)
- Acceptance Criteria:
  1. [ ] Expertise file system works end-to-end with append-only safety (CRITICAL: T1-Reviewer Finding #1)
     - **Pattern**: Expertise updates use append-only JSONL logs (`{agent}-expertise-log.jsonl`), NOT in-place YAML edits. Prevents concurrent write corruption.
     - Verify expertise YAML exists: `test -s pi/multi-team/expertise/backend-dev-mental-model.yaml && python -c "import yaml; yaml.safe_load(open('pi/multi-team/expertise/backend-dev-mental-model.yaml'))" && echo OK`
     - Verify append-only pattern implemented in extension: grep for `{agent}-expertise-log.jsonl` or similar append-only mechanism in pi/extensions/agent-chain.ts
     - Pass: YAML exists AND append-only log pattern present in extension code
     - Fail: In-place YAML edits detected OR no append-only pattern — refactor to append-only before continuing
  2. [ ] Conversation log integration working with formal schema (H-3)
     - **JSONL Schema (H-3)** — Minimal formal structure:
       ```
       {"role": "string", "agent": "string|null", "content": "string", "session_id": "string", "timestamp": "ISO8601"}
       ```
     - Verify: Create and parse a test JSONL with proper schema:
       ```bash
       mkdir -p pi/multi-team/sessions/test_session
       echo '{"role":"user","agent":null,"content":"test","session_id":"test_session","timestamp":"2026-03-30T00:00:00Z"}' >> pi/multi-team/sessions/test_session/conversation.jsonl
       python -c "import json; lines = [json.loads(l) for l in open('pi/multi-team/sessions/test_session/conversation.jsonl')]; assert all(k in lines[0] for k in ['role','agent','content','session_id','timestamp']); print('OK')"
       ```
     - Pass: "OK" — JSONL can be written and read with all required schema fields
     - Fail: JSONL write/parse error or missing fields — debug serialization and add missing fields
  3. [ ] mental-model skill exists and teaches expertise file management
     - Verify: `grep -q 'When to Read' pi/multi-team/skills/mental-model.md && grep -q 'When to Update' pi/multi-team/skills/mental-model.md && echo OK`
     - Pass: "OK" — skill has both read and update guidance
     - Fail: Missing skill sections — add them

### Wave 2 — Validation Gate

**V2: Validate wave 2** [sonnet] — validator-heavy
- Blocked by: T4, T5, T6
- **Prerequisites**: T1 must confirm extension loading method (via -e flag or directory discovery). If -e flag not supported, update all acceptance criteria below to use directory-based loading.
- Checks:
  1. Run acceptance criteria for T4, T5, T6
  2. `make lint` — no new warnings (shellcheck on modified install scripts)
  3. Extensions can be stacked (using confirmed loading method from T1):
     - If -e flag confirmed: `pi -e pi/extensions/damage-control.ts -e pi/extensions/agent-chain.ts --mode print --no-session -p "hello"` loads without error
     - If directory-based only: Place extensions in `~/.pi/agent/extensions/` and verify: `pi --mode print --no-session -p "hello" 2>&1 | grep -q "tool_call\|extension" && echo "Extensions loaded"`
  4. Cross-task: install script references pi-link-setup AND pi npm package
  5. Damage-control rules YAML matches extension's expected schema (dangerous_commands, zero_access_paths, domain_constraints keys)
  6. Agent persona files are valid YAML with proper skill/expertise/domain/tools structure (domain paths may be placeholders — project-specific)
  7. All skill files (.md) exist and contain use-when guidance
  8. Expertise files (.yaml) are empty on first run but have correct schema (H-1: include schema_version field)
- On failure: Create fix task, re-validate after fix

### Wave 3 (parallel)

**T7: Build agent-team dispatcher extension** [sonnet] — builder
- Description: Create `pi/extensions/agent-team.ts` and specialist agent personas. This is the **dispatcher pattern** — route work to specialist agents based on task type. Each specialist has:
  - **Role-specific skills**: coder has precise-worker + execution mindset; researcher has curiosity + exploration mindset
  - **Domain constraints**: Frontend Dev can only touch `apps/frontend/`, Backend Dev can only touch `apps/backend/`, QA owns `test/`
  - **Expertise files**: Each specialist maintains mental model of their domain
  - **Sequential dispatch**: `/team planning` delegates to planning-lead → `@engineering` → `@validation` (chain, not parallel)

  **Example Team Config** (pi/agents/teams.yaml):
  ```yaml
  orchestrator:
    name: orchestrator
    file: .pi/multi-team/agents/orchestrator.md

  planning:
    name: planning-lead
    file: .pi/multi-team/agents/planning-lead.md

  engineering:
    name: engineering-lead
    file: .pi/multi-team/agents/engineering-lead.md
    team:
      - name: frontend-dev
        file: .pi/multi-team/agents/frontend-dev.md
      - name: backend-dev
        file: .pi/multi-team/agents/backend-dev.md

  validation:
    name: validation-lead
    file: .pi/multi-team/agents/validation-lead.md
    team:
      - name: qa-engineer
        file: .pi/multi-team/agents/qa-engineer.md
      - name: security-reviewer
        file: .pi/multi-team/agents/security-reviewer.md
  ```

- Files:
  - `pi/extensions/agent-team.ts` (dispatcher implementation, registers `/team` command)
  - `pi/agents/teams.yaml` (team roster with hierarchy)
  - **Team Lead personas** (Orchestrator, Planning Lead, Engineering Lead, Validation Lead)
  - **Specialist personas** (Frontend Dev, Backend Dev, QA Engineer, Security Reviewer)
  - **Expertise files per agent** (one YAML per specialist)
- Acceptance Criteria:
  1. [ ] Extension loads without error
     - Verify: `pi -e pi/extensions/agent-team.ts --mode print --no-session -p "hello" 2>&1 | head -5`
     - Pass: No TypeScript/import errors
     - Fail: Module errors
  2. [ ] Teams YAML defines specialist hierarchy (at least 2 teams, each with 2+ workers)
     - Verify: `python -c "import yaml; d=yaml.safe_load(open('pi/agents/teams.yaml')); assert len([t for t in d.values() if 'team' in t]) >= 2"`
     - Pass: 2+ teams with worker hierarchies
     - Fail: Flat structure or too few teams
  3. [ ] `/team` command is registered and can dispatch
     - Verify: grep for `pi.registerCommand("team"` in the extension AND grep for delegation logic
     - Pass: Command registered AND dispatch/delegation code present
     - Fail: Missing command or dispatch logic

**T8: Create justfile recipes for extension stacking** [haiku] — builder-light
- Description: Create a `justfile` (or add to existing) with recipes for common Pi launch configurations — solo mode, damage-control only, full stack (all extensions), plan-build-review mode, team mode. Follow IndyDevDan's pattern from pi-vs-claude-code.
- Files:
  - `pi/justfile`
- Acceptance Criteria:
  1. [ ] Justfile has at least 5 recipes
     - Verify: `just --list --justfile pi/justfile 2>&1 | wc -l`
     - Pass: 5+ lines of recipes
     - Fail: Too few recipes
  2. [ ] Default recipe launches Pi with damage-control
     - Verify: `grep -A2 '^default:' pi/justfile`
     - Pass: Contains `pi -e` with damage-control
     - Fail: Missing or wrong default

**T9: Install community packages** [haiku] — builder-light
- Description: Install useful community Pi packages: `pi-skills` (official skills from badlogic — Brave Search, browser automation, YouTube transcripts), and any other packages from the awesome-pi-agent list that complement the user's workflow. Verified installation method: git clone to ~/.pi/agent/skills/.
- Files: none (directory operations)
- Acceptance Criteria:
  1. [ ] pi-skills package is installed
     - Verify: `git clone https://github.com/badlogic/pi-skills ~/.pi/agent/skills/pi-skills && ls ~/.pi/agent/skills/pi-skills/` (idempotent — will skip if exists)
     - Pass: Directory listing shown, no errors
     - Fail: Clone failed or directory missing — check git access and path
  2. [ ] Installed packages don't conflict
     - Verify: `ls ~/.pi/agent/skills/ | wc -l` (should show pi-skills + any others)
     - Pass: Directory listing clean
     - Fail: Permission errors — check ~/.pi/agent/skills/ ownership

### Wave 3 — Validation Gate

**V3: Validate wave 3 + end-to-end** [sonnet] — validator-heavy
- Blocked by: T7, T8, T9
- **Prerequisites**: Use confirmed extension loading method from T1 (via -e flag or directory-based).
- Checks:
  1. Run acceptance criteria for T7, T8, T9
  2. Full extension stack loads (using method confirmed in T1):
     - If -e flag confirmed: `pi -e pi/extensions/damage-control.ts -e pi/extensions/agent-chain.ts -e pi/extensions/agent-team.ts --mode print --no-session -p "list files"`
     - If directory-based only: Place all 3 extensions in `~/.pi/agent/extensions/` and verify: `pi --mode print --no-session -p "list files" 2>&1 | head -10`
  3. Team configuration is valid YAML with proper hierarchy (orchestrator, leads, workers)
  4. All specialist agent personas exist with complete domain constraints (domain paths may be project-specific placeholders)
  5. Justfile recipes execute without error (`just --list --justfile pi/justfile | wc -l` shows 5+)
  6. Community packages are installed: `ls ~/.pi/agent/skills/pi-skills/`
  7. Domain locking is enforced: damage-control blocks delete operations on protected paths
  8. End-to-end: fresh `pi` session can use all three extensions together without conflict
  9. Expertise files are empty YAML on first run with proper schema (role, expertise, skills, domain, tools keys) ready for agent population
- On failure: Create fix task, re-validate

### Wave 4 (sequential) — PHASE 2 (Execute only after Tier 2 validation, H-6)

**PHASE 2 NOTE (H-6):** T10/V4 represent Tier 3 (Proof of Concept). Execute only after completing at least one real team task in Tier 2 to validate the agent platform works. This de-risks the plan — Tier 3's large scope (10 files, Opus, ML libraries, multi-team coordination) should not block Tier 1/2 validation.

**T10: Build prompt routing classifier system (Tier 3 capstone)** [opus] — builder-heavy
- Description: Build a real production system using three specialized agent teams, mirroring IndyDevDan's prompt-routing demo. This is the **proof of concept** that agents can build infrastructure that coordinates with agent teams. **Key insight**: Multiple agents find different things (Planning catches conservative routing need, Engineering finds optimization opportunity, Validation discovers security bug). **Phase 2 Requirement**: Only start this task after Tier 2 (Waves 1-3) agents have been validated in at least one real use case.
  - **Act 1 — ML Team** (Sequential): ML Research Lead → Data Engineer (feature extraction) → Model Engineer (train classifier) → Eval Engineer (validate thresholds)
  - **Act 2 — Board Review**: All three teams weigh in. Planning prefers conservative classifier (ComplementNB), Engineering prefers sharp boundaries (SGDClassifier), all agree on LinearSVC + CalibratedClassifierCV. Validation flags pickle.load() integrity issue.
  - **Input**: Brief question about prompt routing
  - **Process**: Teams coordinate through agent-chain pipeline, synthesize consensus recommendations
  - **Output**: Production scikit-learn classifier (TF-IDF + Logistic Regression) that routes prompts (low/mid/high) to Haiku/Sonnet/Opus, validated by three perspectives
- Files:
  - `pi/agents/ml-research-lead.md` (orchestrates the ML team)
  - `pi/agents/data-engineer.md` (extracts features)
  - `pi/agents/model-engineer.md` (trains & tunes)
  - `pi/agents/eval-engineer.md` (validates & thresholds)
  - `pi/agents/ml-team-config.yaml` (team roster & routing)
  - `prompt-routing/` (output directory for classifier, training data, evaluation harness)
- Acceptance Criteria:
  1. [ ] ML team coordinates and produces consensus recommendation
     - Verify: All three teams (Planning, Engineering, Validation) weigh in on classifier choice
     - Pass: Teams debate (e.g., Planning prefers ComplementNB for conservative routing, Engineering prefers SGDClassifier for sharpness, all agree on LinearSVC + CalibratedClassifierCV)
     - Fail: Teams don't coordinate or consensus is missing
  2. [ ] Multi-perspective advantage demonstrated
     - Verify: Different teams find different insights (Planning: routing thresholds, Engineering: L1+L2 optimization, Validation: model.pkl integrity check)
     - Pass: Final report includes all three perspectives, security issue flagged
     - Fail: Only one team's recommendations captured
  3. [ ] Classifier achieves 85%+ accuracy on holdout set, zero catastrophic misroutes (BUG-7 contingent verification)
     - Prerequisites: Agents must produce `evaluate.py` as part of T10 execution. Scikit-learn required: `pip install scikit-learn` (or `uv add scikit-learn`).
     - Verify: Check agents produced the evaluation harness, then run it:
       ```bash
       test -f prompt-routing/evaluate.py && python prompt-routing/evaluate.py --holdout
       ```
     - Pass: ≥85% accuracy, ZERO HIGH→LOW inversions (worst case), <1ms inference
     - Fail: File missing — agents didn't build evaluation harness. OR accuracy below threshold or catastrophic misroutes found — investigate and retrain
  4. [ ] Router integrates into Pi inference pipeline
     - Verify: `pi --mode print -p "simple prompt"` routes to Haiku; `pi --mode print -p "complex reasoning task"` routes to Opus
     - Pass: Routing matches classifier prediction, thresholds properly calibrated
     - Fail: Manual routing or miscalibrated thresholds — debug integration

### Wave 4 — Validation Gate

**V4: Validate T10 + production-ready proof** [sonnet] — validator-heavy
- Blocked by: T10
- Checks:
  1. Run acceptance criteria for T10
  2. Classifier trained on labeled data, evaluated on holdout set
  3. All four ML team agents have expertise files and mental models
  4. Team configuration is versioned in dotfiles
  5. **Proof of concept achieved**: Agents built infrastructure (classifier) using agent team orchestration (three-tier system)

## Dependency Graph

```
Wave 1: T1, T2, T3 (parallel) → V1
Wave 2: T4, T5, T6 (parallel) → V2
Wave 3: T7, T8, T9 (parallel) → V3
Wave 4: T10 → V4
```

## Success Criteria

**Tier 1 (Harness):**
1. [ ] `pi` command works globally with Anthropic API key
   - Verify: `pi --mode print --no-session -p "What is 2+2?"`
   - Pass: Returns a response with "4"
2. [ ] Pi config is versioned in dotfiles and symlinked
   - Verify: `readlink ~/.pi/agent/settings.json && git ls-files pi/ | wc -l`
   - Pass: Symlink resolves AND git tracks 50+ files in pi/

**Tier 2 (Agent Orchestration & Knowledge Compounding):**
3. [ ] All three custom extensions load together without error (use method verified in T1)
   - Verify:
     - If -e flag supported: `pi -e pi/extensions/damage-control.ts -e pi/extensions/agent-chain.ts -e pi/extensions/agent-team.ts --mode print --no-session -p "hello"`
     - If directory-based only: Place extensions in `~/.pi/agent/extensions/` and run: `pi --mode print --no-session -p "hello"`
   - Pass: Clean output, no TypeScript/load errors
4. [ ] 10 agent personas are deployable with expertise files
   - Verify: `ls pi/multi-team/agents/*.md | wc -l` and `ls pi/multi-team/expertise/*-mental-model.yaml | wc -l`
   - Pass: 10 agents, 10 expertise files
   - Fail: Missing agent or expertise files
5. [ ] Expertise system works end-to-end
   - Verify: Agent reads expertise file at task start, updates it after work (via mental-model skill)
   - Pass: Expertise YAML files are updated after agent execution, new sections added
   - Fail: Expertise files not being read/updated
6. [ ] Conversation log tracks all agent exchanges
   - Verify: After a session, `cat pi/multi-team/sessions/{SESSION_ID}/conversation.jsonl | jq '.role' | sort | uniq`
   - Pass: Shows "user", "orchestrator", "planning-lead", "backend-dev", etc.
   - Fail: Missing agents or incomplete logging
7. [ ] Domain-locked agents prevent destructive operations
   - Verify: Damage-control extension blocks delete operations on protected paths (.pi/multi-team/)
   - Pass: Operations blocked, constraints enforced per agent
8. [ ] Justfile provides orchestration recipes
   - Verify: `just --justfile pi/justfile --list`
   - Pass: Shows recipes for damage-control, agent-chain, team, full-stack (5+)

**Tier 3 (Proof of Concept):**
9. [ ] Prompt routing classifier built by agent teams
   - Verify: ML Team executed pipeline end-to-end (Research Lead → Data Engineer → Model Engineer → Eval Engineer)
   - Pass: Classifier trained, evaluated, integrated into Pi routing logic
10. [ ] Agents demonstrate multi-perspective advantage
    - Verify: Multiple team members find different insights (Planning prefers conservative routing, Engineering prefers optimization, Validation catches security issues)
    - Pass: All three perspectives captured in final report with consensus recommendation
11. [ ] Production-ready proof
    - Verify: `pi --mode print -p "simple task"` routes to Haiku; `pi --mode print -p "complex reasoning"` routes to Opus
    - Pass: Routing matches classifier prediction, 85%+ accuracy on holdout set

## Handoff Notes

**Core Philosophy: Knowledge Compounding**

The breakthrough is **expertise files** — not just multi-agent orchestration, but *persistent institutional memory per agent*:
- Session 1: Agent discovers basic patterns (API design, security practices, testing strategies)
- Session 5: Growing context (team dynamics, file ownership, architectural decisions)
- Session 10: Rich patterns (complex interactions, edge cases, performance insights)
- Session 20+: **Tribal knowledge** — institutional wisdom that would take a human months to accumulate

Each agent reads their expertise file at task start (mental-model skill), updates it after completing work. Over sessions, knowledge compounds. Next session, they start with context instead of discovering it again.

**Three-Layer Knowledge System:**
1. **Skills** (methodology) — HOW to work: mental-model, active-listener, precise-worker, zero-micro-management
2. **Expertise Files** (knowledge) — WHAT the agent knows: system blueprints, patterns, decisions, observations
3. **Agent Personas** (identity) — WHO the agent is: role, domain constraints, team membership

**Key Design Principles:**
- "One agent is not enough" — Specialized experts find different issues. Backend dev catches API patterns, QA catches reliability, Security catches vulnerabilities.
- "Domain locking is the holy grail" — Frontend dev can read backend but not modify. Prevents catastrophic mistakes.
- "Don't be afraid to spend tokens" — Context windows are cheap. Load full expertise, full conversation history, let agents think deeply.
- "If you don't need it, it won't be built" (Pi philosophy) — Minimal core, you build extensions you need.

**Technical Notes:**
- **Expertise files are the heart of the system** — Don't treat them as optional logging. They're how agents become smarter per session.
- Expertise files are YAML, unstructured but scannable. Let structure emerge from work. Categories can change over sessions (evolve naturally).
- **Expertise file updates (H-2)**: Agents update expertise files **sequentially only**. Never run two agents that share an expertise file in parallel — simultaneous writes corrupt YAML. For MVP, document sequential-only constraint in mental-model skill: "Agents update expertise files sequentially. Damage-control rules: expertise/ paths are upsert-allowed, delete-never."
- Conversation logs are append-only JSONL, shared across all agents. Every exchange is logged: user → orchestrator → lead → workers → lead → orchestrator → user. Schema: `{role, agent, content, session_id, timestamp}`.
- Session directories preserve history: `sessions/{SESSION_ID}/conversation.jsonl` + `sessions/{SESSION_ID}/notes.md`
- **Strong decisions with WHY** — Don't just track "chose Express over Fastify", track "why_good: ecosystem maturity". This helps future sessions understand constraints.
- Pi reads `AGENTS.md` and `CLAUDE.md` automatically. Repo AGENTS.md will be picked up from dotfiles.
- ANTHROPIC_API_KEY shared between Claude Code and Pi. OAuth login supports subscriptions.
- Extensions use jiti (TypeScript without compilation).
- **Model selection**: Opus for orchestrator/thinking, Sonnet for leads/general work, Haiku for simple execution.

**Expected Outcomes:**
1. You understand why this is not multi-agent orchestration **for its own sake**, but a **system for knowledge compounding**.
2. You can build 10-agent systems where each agent maintains their own institutional memory.
3. You have a production example (prompt routing classifier) built by agents using their own orchestration system.
4. You're prepared to scale to large codebases (50+ files, complex domain) with specialized agents, each with 20+ sessions of accumulated knowledge.
5. You can extend this to autonomous systems that improve over time (agents tuning themselves based on historical expertise).
