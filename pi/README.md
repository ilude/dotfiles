# Pi Agent Setup

Pi is a minimal terminal coding agent (`@mariozechner/pi-coding-agent`) configured here with a multi-agent orchestration system, safety enforcement, and knowledge compounding via expertise files.

**Pi site:** shittycodingagent.ai | **GitHub:** github.com/badlogic/pi-mono

---

## Installation

Pi is installed automatically by the dotfiles installer:

```bash
# Linux / Git Bash
~/.dotfiles/install

# Windows PowerShell
~/.dotfiles/install.ps1
```

This runs `npm install -g @mariozechner/pi-coding-agent` and `scripts/pi-link-setup` (which junctions `~/.dotfiles/pi/` → `~/.pi/agent/` on Windows, symlinks on Linux).

### Manual install

```bash
npm install -g @mariozechner/pi-coding-agent
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
just full     # all three extensions
```

Or invoke Pi directly:

```bash
pi                          # auto-discovers extensions from ~/.pi/agent/extensions/
pi --no-extensions          # clean slate
pi -e ~/.dotfiles/pi/extensions/damage-control.ts   # explicit load
```

---

## Extensions

Three TypeScript extensions are auto-discovered from `~/.dotfiles/pi/extensions/`:

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
└── Validation Lead (Sonnet)
    ├── QA Engineer
    └── Security Reviewer
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
