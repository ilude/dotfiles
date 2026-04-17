# Pi Agent Setup

Pi is a minimal terminal coding agent (`@mariozechner/pi-coding-agent`) configured here with a multi-agent orchestration system, safety enforcement, and knowledge compounding via expertise files.

**Pi site:** [shittycodingagent.ai](https://shittycodingagent.ai) | **GitHub:** [badlogic/pi-mono](https://github.com/badlogic/pi-mono)

---

## Installation

Pi is installed automatically by the dotfiles installer:

```bash
# Linux / Git Bash
~/.dotfiles/install

# Windows PowerShell
~/.dotfiles/install.ps1
```

This runs `bun install -g @mariozechner/pi-coding-agent` and `scripts/pi-link-setup` (which junctions `~/.dotfiles/pi/` → `~/.pi/agent/` on Windows, symlinks on Linux).

### Manual install

```bash
bun install -g @mariozechner/pi-coding-agent
~/.dotfiles/scripts/pi-link-setup
```

---

## Authentication

**API key (preferred):**

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # add to .bashrc / .zshrc
```

**Claude Pro/Max subscription:**

```bash
pi          # launch Pi
/login      # follow the OAuth flow in your browser
```

Tokens are stored in `~/.pi/agent/auth.json`.

---

## Launching Pi

All recipes live in `~/.dotfiles/pi/justfile`. Run from any directory with `just`:

```bash
cd ~/.dotfiles/pi

just          # default — Pi with all auto-discovered extensions
just solo     # bare Pi, no extensions
just safe     # damage-control only (safety rules)
just chain    # damage-control + plan-build-review pipeline
just team     # damage-control + team dispatcher
just full     # all extensions (damage-control + chain + team + quality-gates + session-hooks)
just guard    # full stack + conventional commit enforcement
```

Or invoke Pi directly:

```bash
pi                          # auto-discovers extensions from ~/.pi/agent/extensions/
pi --no-extensions          # clean slate
pi -e ~/.dotfiles/pi/extensions/damage-control.ts   # explicit load
```

---

## Extensions

Seven TypeScript extensions live in `~/.dotfiles/pi/extensions/` and are auto-discovered (or loaded explicitly via `-e`):

### `damage-control.ts`

Intercepts tool calls and blocks dangerous operations before they execute.

- **Dangerous commands** — blocks `rm -rf`, `git reset --hard`, `dd if=`, etc.
- **Zero-access paths** — blocks read/write to `~/.ssh/*`, `*.pem`, `*.key`, `.env`
- **No-delete paths** — protects `package.json`, `Makefile`, `pyproject.toml`

Rules file: `~/.dotfiles/pi/damage-control-rules.yaml` — edit to customize.

### `agent-chain.ts`

Implements the plan-build-review pipeline and the expertise system.

**Slash command:**
```
/chain <task description>
```
Sequences planner → builder → reviewer agents. Each agent's output feeds the next.

**Tools registered for agents:**
- `append_expertise` — appends a discovery to `{agent}-expertise-log.jsonl`
- `read_expertise` — reads all accumulated discoveries for an agent
- `log_exchange` — records messages to the session `conversation.jsonl`

### `agent-team.ts`

Dispatcher pattern routing work to specialist team leads.

**Slash commands:**
```
/team list                    # show available agents and teams
/team <lead|agent> <task>     # dispatch a task to a specific agent
```

### `quality-gates.ts`

Intercepts tool results for write and edit operations, runs the appropriate linter for the file's language, and prepends a warning if the linter fails.

Validators are configured in `~/.dotfiles/claude/hooks/quality-validation/validators.yaml` — shared with the Claude Code quality-validation hook.

### `session-hooks.ts`

Runs lifecycle actions at session boundaries:

- **session_start** — runs `git fetch` and notifies if the branch is behind remote
- **session_shutdown** — archives the session conversation log to `~/.pi/agent/history/YYYY-MM-DD-<sessionId>.jsonl`

### `commit-guard.ts`

Intercepts `git commit` bash calls and enforces safe commit practices:

- Blocks `--no-verify` (pre-commit hook bypass)
- Blocks commits missing `-m`
- Enforces conventional commit message format (`feat:`, `fix:`, `chore:`, etc.)

### `workflow-commands.ts`

Registers shared skill-backed slash commands:

```
/commit        # smart git commit with secret scanning
/plan-it       # crystallize conversation context into an executable plan
/review-it     # adversarial review of a plan file
/do-it         # smart task routing by complexity
/research      # parallel multi-angle research on a topic
```

Skills are loaded from `~/.dotfiles/pi/skills/workflow/`.

### `prompt-router.ts`

Classifies every user prompt with a local TF-IDF + LinearSVC model and switches
the active Claude model accordingly before the agent starts.

| Tier | Model | When |
|------|-------|------|
| `low` | `claude-haiku-4-5` | Factual lookups, syntax questions, single-step tasks |
| `mid` | `claude-sonnet-4-6` | Multi-step tasks, code with context, moderate analysis |
| `high` | `claude-opus-4-6` | Architecture decisions, security, distributed systems |

**Never-downgrade rule:** once a session escalates to a higher tier, it stays
there for the rest of the session.

**Footer indicator:** `▸ Haiku` / `▸▸ Sonnet` / `▸▸▸ Opus` after each routed prompt.

**Slash commands:**
```
/router-status   # show current tier, session max, last classification
/router-reset    # reset session max back to low
/router-off      # disable routing (keep current model)
/router-on       # re-enable routing
```

Classifier: `~/.dotfiles/pi/prompt-routing/model.pkl` (92% accuracy on OOD eval, 0 inversions).
Audit log: `~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl`.
See `~/.dotfiles/pi/prompt-routing/` for the full classifier project.

---

## Prompt Routing

The `prompt-routing/` directory contains a local complexity classifier that
automates model selection. The `prompt-router.ts` extension integrates it
transparently into every Pi session.

### How it works

```
You type a prompt
        ↓
prompt-router.ts intercepts (input event)
        ↓
classify.py calls model.pkl (~200ms)
        ↓
route() returns low | mid | high
        ↓
pi.setModel() switches the model
        ↓
Agent runs on the right model
```

### Corpus and retraining

The classifier was built by a multi-agent ML team (ML Research Lead,
Data Engineer, Model Engineer, Eval Engineer) using 1,582 labeled examples
across three domains. The corpus is in `prompt-routing/data/training_corpus.json`.

To retrain after adding examples to the corpus:

```bash
cd ~/.dotfiles/pi/prompt-routing
python train.py
python evaluate.py --holdout   # must pass all gates
python -m pytest tests/         # 64 tests
```

To label new training data from your Claude history:

```bash
python label_history.py --signal high,low --resume
python merge_labels.py --dry-run
python merge_labels.py --cap <N>
```

To run the daily audit (compare live routing against Opus labels):

```bash
python audit.py
```

Full documentation: `~/.dotfiles/pi/prompt-routing/AGENTS.md`

---

## Agent Architecture

### Hierarchy

```
Orchestrator (Opus)
├── Planning Lead (Sonnet)
│   ├── Product Manager
│   └── UX Researcher
├── Engineering Lead (Sonnet)
│   ├── Frontend Dev
│   └── Backend Dev
├── Validation Lead (Sonnet)
│   ├── QA Engineer
│   └── Security Reviewer
└── ML Research Lead (Sonnet)
    ├── Data Engineer
    ├── Model Engineer
    └── Eval Engineer
```

Plus standalone chain agents: **Planner**, **Builder**, **Reviewer**.

Agent persona files: `~/.dotfiles/pi/agents/`
Team configuration: `~/.dotfiles/pi/agents/teams.yaml`

### Knowledge Compounding

Each agent maintains a YAML expertise file (their mental model):

```
~/.dotfiles/pi/multi-team/expertise/{agent}-mental-model.yaml
```

At task start, an agent reads its expertise file to recall what it already knows. After completing work, it appends new discoveries via `append_expertise` (JSONL — safe for concurrent agents). Knowledge compounds across sessions — Session 20 is smarter than Session 1.

Session conversation logs: `~/.dotfiles/pi/multi-team/sessions/{session_id}/conversation.jsonl`

---

## Skills

Community pi-skills installed at `~/.dotfiles/pi/skills/pi-skills/`:

| Skill | Purpose |
|-------|---------|
| `brave-search` | Web search via Brave Search API |
| `browser-tools` | Browser automation and content extraction |
| `youtube-transcript` | Fetch YouTube transcripts |
| `gccli` | Google Calendar CLI integration |
| `gdcli` | Google Drive CLI integration |
| `gmcli` | Gmail CLI integration |
| `transcribe` | Audio transcription |
| `vscode` | VS Code integration |

Skills are SKILL.md files — read them to activate their guidance and tools.

---

## Configuration

| File | Purpose |
|------|---------|
| `~/.dotfiles/pi/settings.json` | Default model (`claude-sonnet-4-6`) |
| `~/.dotfiles/pi/AGENTS.md` | Global agent instructions (auto-loaded by Pi) |
| `~/.dotfiles/pi/damage-control-rules.yaml` | Safety rules for damage-control extension |
| `~/.dotfiles/pi/agents/teams.yaml` | Team roster and hierarchy |

Project-level overrides: place `AGENTS.md` or `.pi/settings.json` in any repo root.

---

## Typical Workflows

### Solo coding task

```bash
just          # launch with all extensions
> Build a REST endpoint for /api/users
```

### Plan-build-review pipeline

```bash
just chain
/chain Refactor the auth module to use JWT
```

### Multi-agent team task

```bash
just full
/team engineering-lead Add rate limiting to the API
```

### Inspect expertise (what agents know)

```bash
cat ~/.pi/agent/multi-team/expertise/backend-dev-mental-model.yaml
# Or from within Pi, ask an agent to read_expertise
```

### Reset expertise for an agent

```bash
> ~/reset-expertise backend-dev   # delete log to start fresh
rm ~/.pi/agent/multi-team/expertise/backend-dev-expertise-log.jsonl
```
