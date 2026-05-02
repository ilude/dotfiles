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

On Linux, macOS, and Git Bash, this uses `bun install -g @mariozechner/pi-coding-agent`. On Windows, `install.ps1` installs Pi via `pnpm add -g @mariozechner/pi-coding-agent`, then runs `scripts/pi-link-setup` (which junctions `~/.dotfiles/pi/` → `~/.pi/agent/` on Windows, symlinks on Linux).

The local dotfiles install also defaults `PI_CACHE_RETENTION=long` in the installed shell profiles (`zsh`, `bash`, `sh`, and PowerShell) unless you have already set a different value. That prefers extended provider-side prompt caching where Pi supports it (currently documented by Pi as Anthropic 1h and OpenAI 24h for direct API calls).

### Windows package-manager note

Windows intentionally installs Pi with **pnpm**, not Bun, for now.

Reason: Bun currently limits Windows to older Pi installs because `bun install -g @mariozechner/pi-coding-agent` fails to resolve the latest Pi dependency graph cleanly. In local verification, Bun failed on transitive AWS SDK packages even though those versions exist on the npm registry. pnpm resolves the same graph cleanly and keeps Windows on the current/latest Pi release path. pnpm is preferred over npm for the strict resolver, the content-addressable global store, and the explicit build-script approval model -- the install command passes `--allow-build=koffi --allow-build=protobufjs` to whitelist the two native postinstall steps Pi requires.

Bun is still installed on Windows for other JS tooling in this repo; this note only applies to the global `pi` package. pnpm is declared in `winget/configuration/core.dsc.yaml` so the installer pulls it in alongside Node.js.

### Project-local Pi bootstrap

Some repos use ignored repo-local `.pi/` files for project-specific Pi workflows. Seed them from dotfiles templates with:

```bash
~/.dotfiles/scripts/pi-project-bootstrap --list
~/.dotfiles/scripts/pi-project-bootstrap /path/to/repo
# or explicitly
~/.dotfiles/scripts/pi-project-bootstrap --template eisa-playwright-e2e /path/to/repo
```

Behavior:
- defaults the template name to the target repo directory name
- copies template contents into the repo root
- skips existing files unless `--force` is passed

Current template example:
- `pi/project-templates/eisa-playwright-e2e/` seeds the ignored `.pi/` Playwright orchestrator files for the EISA E2E repo

### Manual install

```bash
# Linux / macOS / Git Bash
bun install -g @mariozechner/pi-coding-agent
~/.dotfiles/scripts/pi-link-setup

# Windows PowerShell
pnpm add -g --allow-build=koffi --allow-build=protobufjs @mariozechner/pi-coding-agent
~/.dotfiles/scripts/pi-link-setup
```

---

## Source vs. runtime state

This repository keeps curated Pi source/config trackable and leaves generated runtime
state local. Commit changes to maintained config such as `pi/agents/`,
`pi/multi-team/agents/`, `pi/multi-team/skills/`, `pi/skills/`, `pi/extensions/`,
`pi/lib/`, `pi/tests/`, `pi/settings.json`, prompt-router source/docs/data/models that
are intentionally versioned, and lockfiles such as `pi/prompt-routing/uv.lock`.

Do not delete or commit local runtime state unless a separate migration explicitly
approves it. Treat these as generated/local: `pi/history/`, `pi/sessions/`,
`pi/multi-team/sessions/`, `pi/multi-team/logs/`, `*-expertise-log.jsonl`,
project-local expertise directories under `pi/multi-team/expertise/*/`, local caches,
logs, virtualenvs, and `node_modules/`. Tracked global mental-model snapshots and
curated prompt-router data/models may remain versioned; classify them deliberately
rather than hiding broad directories.

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

just          # default -- Pi with all auto-discovered extensions
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

TypeScript extensions live in `~/.dotfiles/pi/extensions/` and are auto-discovered (or loaded explicitly via `-e`):

### `damage-control.ts`

Intercepts tool calls and blocks dangerous operations before they execute.

- **Dangerous commands** -- blocks `rm -rf`, `git reset --hard`, `dd if=`, etc.
- **Zero-access paths** -- blocks read/write to `~/.ssh/*`, `*.pem`, `*.key`, `.env`
- **No-delete paths** -- protects `package.json`, `Makefile`, `pyproject.toml`

Rules file: `~/.dotfiles/pi/damage-control-rules.yaml` -- edit to customize.

### `agent-chain.ts`

Implements the plan-build-review pipeline and the expertise system.

**Slash command:**
```
/chain <task description>
```
Sequences planner → builder → reviewer agents. Each agent's output feeds the next.

**Tools registered for agents:**
- `append_expertise` -- appends a discovery to `{agent}-expertise-log.jsonl` (append-only source of truth)
- `read_expertise` -- reads the compact expertise snapshot / mental model for an agent, rebuilding from raw history if needed. Optional `query` enables deterministic local focused retrieval, and optional `max_results` caps focused matches.
- `log_exchange` -- records messages to the session `conversation.jsonl`

`read_expertise` parameters:

| Parameter | Default | Notes |
|---|---:|---|
| `agent` | required | Non-empty agent name. |
| `mode` | `concise` | `concise`, `full`, or `debug`; unknown modes fall back to concise behavior. |
| `query` | omitted | Trimmed string, 1-500 characters. When present, appends a focused retrieval section after the baseline snapshot. |
| `max_results` | `5` with `query` | Integer 1-20. Caps deduplicated focused bullets. Invalid values return a validation error. |

With `query`, output keeps the normal snapshot first, then adds `Focused retrieval for: <query>` and up to `max_results` deterministic lexical matches. If nothing matches, it says `No focused matches found; using baseline expertise only.` Debug-only retrieval diagnostics live in `details.retrieval`; LLM-facing text does not expose cache paths, hashes, raw JSON, or source file metadata.

### `agent-team.ts`

Dispatcher pattern routing work to specialist team leads.

**Slash commands:**
```
/team list                    # show available agents and teams
/team <lead|agent> <task>     # dispatch a task to a specific agent
```

### `quality-gates.ts`

Intercepts tool results for write and edit operations, runs the appropriate linter for the file's language, and prepends a warning if the linter fails.

Validators are configured in `~/.dotfiles/claude/hooks/quality-validation/validators.yaml` -- shared with the Claude Code quality-validation hook.

### `session-hooks.ts`

Runs lifecycle actions at session boundaries:

- **session_start** -- runs `git fetch` and notifies if the branch is behind remote
- **session_shutdown** -- archives the session conversation log to `~/.pi/agent/history/YYYY-MM-DD-<sessionId>.jsonl`

### `commit-guard.ts`

Intercepts `git commit` bash calls and enforces safe commit practices:

- Blocks `--no-verify` (pre-commit hook bypass)
- Blocks commits missing `-m`
- Enforces conventional commit message format (`feat:`, `fix:`, `chore:`, etc.)

### `workflow-commands.ts`

Registers shared skill-backed slash commands:

```
/commit        # smart git commit with LLM-adjudicated secret review
/plan-it       # crystallize conversation context into an executable plan
/review-it     # adversarial multi-reviewer coordination for a plan file
/do-it         # smart task routing by complexity or plan-file execution
/research      # parallel multi-angle research on a topic
```

Skills are loaded from `~/.dotfiles/pi/skills/workflow/`.

Workflow highlights:
- `/plan-it` writes plans with explicit `small` / `medium` / `large` model sizing and agent assignments.
- `/review-it` coordinates a fixed 3-reviewer core plus at least 3 persona-seeded domain reviewers, with targeted rebuttal only when disagreement matters.
- `/do-it` can route a raw task **or** execute an existing `.specs/*/plan.md` file wave by wave.
- `/commit` uses deterministic candidate extraction plus a small-model LLM review to distinguish real secrets from docs/examples/tests before blocking.

### `context.ts`

Shows Claude Code-style context usage for Pi.

**Slash command:**
```
/context         # full report in normal scrollback
/context widget  # optional persistent widget; may truncate in narrow terminals
/context clear   # hide the widget
```

Behavior:
- Displays current context usage from Pi's `ctx.getContextUsage()` API.
- Estimates per-component buckets for system prompt, user messages, assistant text/thinking, tool calls, tool results, bash output, injected context, and summaries.
- Shows cumulative session token spend, cache reads/writes, cost, and component breakdown.
- Emits the full report as a normal transcript message so it scrolls with the conversation; the extension filters those report messages back out of future LLM context.

### `provider.ts`

Manages provider credentials in `~/.pi/agent/auth.json`.

**Slash command:**
```
/provider
/provider <provider>
/provider remove <provider>
/provider list
```

Behavior:
- Interactive mode (`/provider`) supports setting API keys, removing provider auth, and listing configured providers.
- Direct mode (`/provider <provider>`) prompts for API key providers and saves credentials to `auth.json`.
- OAuth providers are guided to `/login`.

### `refresh-models.ts`

Refreshes available model lists for active subscription providers **without relogging**.

**Slash command:**
```
/refresh-models [provider]
```

Behavior:
- No provider: refreshes all currently authenticated **supported** subscription providers (OAuth entries in `auth.json`).
- Provider argument: refreshes only that provider (currently `anthropic`, `openai-codex`, and `github-copilot`).
- Unsupported providers are skipped with a warning.
- Uses existing session credentials and updates in-session model availability immediately.
- Prints per-provider diffs with model IDs that were added/removed.

### `model-visibility.ts`

Applies startup model-list cleanup for noisy provider catalogs.

Behavior:
- Hides date/version-suffixed and preview snapshot models for `openai-codex`, `github-copilot`, `opencode`, `opencode-go`, and `openrouter`.
- Applies provider-specific blocklists (including internal/legacy model IDs) before `/model` selection.

### Operator Layer

Three companion extensions surface durable task and permission state for
long-running work. They share the registries in `pi/lib/task-registry.ts`
and `pi/lib/permission-registry.ts`, which are the canonical owners of
`TaskRecordV1` and `PermissionDecision` for any extension that needs to
record subagent runs or permission decisions.

Storage location: `~/.pi/agent/operator/{tasks,permissions}/`. Override
with `PI_OPERATOR_DIR` (used by tests).

Producer wiring: `subagent`, `agent-team`, and `damage-control` write to the
registries automatically; producers are wrapped in defensive try/catch so
registry I/O failure (disk full, permission error, etc.) never breaks the
producer flow.

#### `operator-status.ts`

Adds three status bar slots and the `/doctor` command.

Slots:
- `pi` -- always shown, format `pi vX.Y.Z`
- `task` -- shown only when non-terminal tasks exist, format `task N (M blocked, K failed)`
- `elevated` -- shown only when session approvals exist, format `elevated (N)`

Healthy default keeps the bar quiet (no `OK` token, no zero counters). Slots
populate at `session_start` and refresh after every `tool_result`.

Commands:
- `/doctor` -- compact health summary
- `/doctor --verbose` -- multi-line diagnostic (pi version, registry health, cwd, platform, task counts, permission counts)
- `/doctor --json` -- machine-readable structured output

#### `tasks.ts`

Operator surface for the durable task registry.

Commands:
- `/tasks` -- urgency-grouped list (blocked > failed > running > pending > completed > cancelled), compact rows with short id + summary + relative time + retry count
- `/tasks <id-prefix>` -- detail view (id, state, origin, agent, summary, prompt/preview, timestamps, retries, blockReason/errorReason, usage tokens). Prefix matching needs >=4 chars and rejects ambiguous matches
- `/tasks cancel <id>` -- transitions `running`/`blocked`/`pending` -> `cancelled`; preserves the final summary
- `/tasks retry <id>` -- transitions `failed` -> `running`; the registry bumps `retryCount` and clears `errorReason`. Does not re-execute the work; you re-issue the original action through normal channels.

Lifecycle (defined in `pi/lib/operator-state.ts`):
```
pending  -> running, cancelled, failed
running  -> blocked, completed, failed, cancelled
blocked  -> running, failed, cancelled
failed   -> running              (retry only)
completed, cancelled = terminal
```

#### `permissions.ts`

Operator surface for the permission registry.

Commands:
- `/permissions` -- summary (session approvals + last 20 allow/deny decisions)
- `/permissions allows` / `/permissions denies` -- filtered views
- `/permissions reset` -- clear all session approvals
- `/permissions retry <id>` -- replay attempt for a denied decision when a `replayPayload` was captured. Records the replay as a new `manual_once` decision linking back to the original via `metadata.replayOf`. Does not re-issue the underlying tool call -- replay through normal channels.

Decision provenance categories: `rule` (config-driven, what damage-control
emits today), `manual_once` (user one-shot approval/denial via `/permissions
retry` or interactive confirm), `session` (session-scoped trust),
`unknown` (uninstrumented paths).

### `prompt-router.ts`

Classifies every user prompt and switches **both model tier and thinking
effort** per turn. The live classifier is ConfGate (LightGBM primary, T2
LinearSVC consulted as a low-confidence fallback), trained on the v3
route-level corpus under `~/.dotfiles/pi/prompt-routing/`.

Routing is **dynamic**: predicted model tier (`Haiku` / `Sonnet` / `Opus`)
maps onto the current provider/model ladder using same-family resolution, and
the predicted effort (`none` / `low` / `medium` / `high`) is applied via
`pi.setThinkingLevel()`.

| Tier | Target rung | When |
|------|-------------|------|
| Haiku | small model | Factual lookups, syntax questions, single-step tasks |
| Sonnet | medium model | Multi-step tasks, code with context, moderate analysis |
| Opus | large model | Architecture decisions, security, distributed systems |

Examples:
- OpenAI Codex session → `gpt-5.4-mini` / `gpt-5.4-fast` / `gpt-5.4`
- Anthropic session → `haiku` / `sonnet` / `opus`
- GitHub Copilot session → best available GitHub-backed small / medium / large rung in the current family or nearest same-provider equivalent

#### Runtime policy (ship config)

The session-wide never-downgrade rule was retired. Policy lives in
`pi/settings.json` under `router.policy.*` and `router.effort.*`; see
`pi/prompt-routing/docs/settings-doc.md` for the per-key reference.

| Knob | Ship value | Meaning |
|------|------------|---------|
| `router.effort.maxLevel` | `high` | Hard cap on applied thinking level; blocks `xhigh` |
| `router.policy.N_HOLD` | `0` | Hysteresis hold disabled -- shadow-eval showed hold inflated cost |
| `router.policy.K_CONSEC` | `1` | Tied to `N_HOLD` |
| `router.policy.COOLDOWN_TURNS` | `2` | Runtime escalation cooldown (e.g. after tool failure) |
| `router.policy.UNCERTAIN_THRESHOLD` | `0.55` | Dormant; retained for future use |
| `router.policy.UNCERTAIN_FALLBACK_ENABLED` | `false` | Disabled -- fallback blocked legitimate downgrades |
| `router.policy.DOWNGRADE_THRESHOLD` | `0.85` | Hysteresis downgrade gate (dormant at N_HOLD=0) |

**Footer indicator:** `▸ <small model>` / `▸▸ <medium model>` / `▸▸▸ <large model>` after each routed prompt.

**Slash commands:**
```
/router-status    # current tier, effort, policy snapshot, resolved model ladder
/router-explain   # full decision trail for the last turn
/router-reset     # clear session state
/router-off       # disable routing (keep current model)
/router-on        # re-enable routing
```

`/router-explain` output format:

```
Last turn decision:
  Prompt: "<first ~80 chars>..."
  Classifier: confgate
    schema_version: 3.0.0
    primary: {model: Sonnet, effort: medium}
    confidence: 0.82
    ensemble_rule: lgb-confident
    candidates: [Haiku/low@0.1, Sonnet/medium@0.82]
  Applied route: Sonnet/medium
  Rule fired: classifier
  Current state: model=openai-codex/gpt-5.4-fast, effort=medium, cap=high
```

`Rule fired` is one of: `classifier`, `hysteresis-hold`, `cooldown`,
`uncertainty-fallback`, `effort-cap`, `null-fallback`.

**Where the classifier lives.** `~/.dotfiles/pi/prompt-routing/` -- see the
README/AGENTS.md there for the training pipeline. `classify.py` is the CLI
wrapper the extension spawns per turn; ConfGate is implemented in
`classifier_confgate.py` (LGB primary, T2 fallback when LGB conf < CONF_GATE).
Artifacts: `models/router_v3.joblib` (T2) and `models/router_v3_lgbm.joblib`
(LGB), both SHA256-verified at load.

**Troubleshooting:**

- Routing decisions are logged to
  `~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl` (classifier-side
  audit log when Python logging is enabled).
- If `/router-explain` shows `Rule fired: null-fallback`, the classifier
  failed or returned garbage; the router kept the previous route. Reproduce
  with `uv run --project ~/.dotfiles/pi/prompt-routing python ~/.dotfiles/pi/prompt-routing/classify.py --classifier t2 "test prompt"`.
- If `effort-cap` fires often, raise `router.effort.maxLevel`. If `cooldown`
  is stuck, call `/router-reset`.

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
resolve current provider/model ladder
        ↓
pi.setModel() switches to the resolved small / medium / large rung
        ↓
Agent runs on the right model
```

### Corpus and retraining

The classifier was built by a multi-agent ML team (ML Research Lead,
Data Engineer, Model Engineer, Eval Engineer) using 1,582 labeled examples
across three domains. The corpus is in `prompt-routing/data/training_corpus.json`.

`prompt-routing/` is a uv project. Dependency source of truth is
`pi/prompt-routing/pyproject.toml` plus the tracked
`pi/prompt-routing/uv.lock`; `requirements.txt` is export-only compatibility
output, not an input for local installs.

To retrain after adding examples to the corpus:

```bash
uv sync --project ~/.dotfiles/pi/prompt-routing --locked
uv run --project ~/.dotfiles/pi/prompt-routing python ~/.dotfiles/pi/prompt-routing/train.py
uv run --project ~/.dotfiles/pi/prompt-routing python ~/.dotfiles/pi/prompt-routing/evaluate.py --holdout   # must pass all gates
uv run --project ~/.dotfiles/pi/prompt-routing python -m pytest ~/.dotfiles/pi/prompt-routing/tests/
```

To label new training data from your Claude history:

```bash
uv run --project ~/.dotfiles/pi/prompt-routing python ~/.dotfiles/pi/prompt-routing/label_history.py --signal high,low --resume
uv run --project ~/.dotfiles/pi/prompt-routing python ~/.dotfiles/pi/prompt-routing/merge_labels.py --dry-run
uv run --project ~/.dotfiles/pi/prompt-routing python ~/.dotfiles/pi/prompt-routing/merge_labels.py --cap <N>
```

To run the daily audit (compare live routing against Opus labels):

```bash
uv run --project ~/.dotfiles/pi/prompt-routing python ~/.dotfiles/pi/prompt-routing/audit.py
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

Each agent maintains a two-layer expertise system: a **global layer** (reusable cross-project
knowledge) and a **project-local layer** (repo-scoped knowledge keyed by a deterministic
compact repo ID).

Full layering spec: `pi/docs/expertise-layering.md`

#### Storage layout

```text
~/.pi/agent/multi-team/expertise/
  {agent}-expertise-log.jsonl          # global layer (append-only source of truth)
  {agent}-mental-model.json            # global snapshot
  {agent}-mental-model.state.json      # global snapshot state
  {repo-id-slug}/                      # project-local layer (one dir per repo)
    repo-id.json                       # persisted remote identity for drift detection
    {agent}-expertise-log.jsonl        # project-local log
    {agent}-mental-model.json          # project-local snapshot
    {agent}-mental-model.state.json    # project-local snapshot state
```

#### Remote precedence

The repo ID slug is derived from the canonical remote, selected in this order:

1. Configured `preferredRemote` in `.pi/settings.json` (if set and present)
2. `origin` (if it exists)
3. Lexically-first remote name (deterministic fallback)
4. No-remote fallback: `local/<cwd-slug>` (git repo with no remotes)
5. Non-git fallback: slug `global` (expertise goes to global layer only)

#### Compact repo ID format

Short provider-prefix slugs: `gh/owner/repo`, `gl/group/subgroup/repo`, `bb/owner/repo`,
`az/org/project/repo`, `ext/example.com/owner/repo`. Supports HTTPS, SSH, and SCP-style
remotes. Handles nested GitLab groups, optional ports, and `.git` suffix stripping.

Windows normalization rules (reserved names, case-folding, trailing dots/spaces,
path-length pressure, deterministic hash suffix on collision) are applied to all slugs.
See decision tables in `pi/docs/expertise-layering.md`.

#### Read semantics: project-local first

`read_expertise` merges both layers with project-local first, then global appended after
deduplication. Dedupe/conflict precedence: project-local wins on matching summary keys.
Global entries that duplicate a project-local entry are suppressed from the rendered output
(not deleted from disk). This reduces cross-project pollution without losing reusable global
knowledge.

See `pi/docs/expertise-layering.md` for the full dedupe/conflict rule table.

#### Write semantics

Inside a git repo (and not `sensitive_repo`): `append_expertise` writes to the project-local
layer. Outside a git repo, or when `sensitive_repo: true` is set: writes go to the global
layer.

#### Migration: mixed legacy global state

Existing global `{agent}-expertise-log.jsonl` files are never moved or deleted. They remain
the global layer permanently. No manual migration is required -- `read_expertise` dual-reads
both layers from the first session after deployment.

#### Drift and rename handling

If the repo remote URL or `preferredRemote` config changes, the derived repo ID slug may
drift. Drift is detected via `repo-id.json`. On drift: old directory is kept as a read-only
dual-read source; new writes go to the new slug directory. No expertise is silently orphaned.

#### Safety

- **Secret redaction**: entries matching API key / private key / high-entropy secret patterns
  are blocked at write time. The entire entry is rejected; no partial write.
- **Sensitive-repo disable**: `sensitive_repo: true` in `.pi/settings.json` or
  `SENSITIVE_REPO=true` routes all writes to the global layer and disables project-local reads.
- **Snapshot invalidation**: any new append marks the snapshot stale; rebuilt synchronously
  on the next `read_expertise` call. Last-known-good snapshot retained on rebuild failure.
- **Focused retrieval fallback**: optional `read_expertise` retrieval is local lexical search by default. Missing, stale, corrupt, partial, or wrong-version retrieval caches are rebuilt or bypassed with a direct JSONL scan; failures fall back to the baseline snapshot instead of throwing an unhandled cache error.

The JSONL log is the append-only source of truth. Every `append_expertise` call adds a
historical record there and never rewrites prior entries. The mental-model snapshot and any
retrieval index/cache are derived, disposable views used by `read_expertise` so agents recall
durable knowledge without replaying the entire raw history every session. Generated retrieval
caches must remain rebuildable, gitignored, and unstaged.

At task start, an agent reads its mental model to recall what it already knows. If the
snapshot is missing, stale, or a prior rebuild failed, `read_expertise` must rebuild or
return the documented safe fallback instead of silently returning misleading stale state.
Knowledge compounds across sessions -- Session 20 is smarter than Session 1.

#### Focused retrieval privacy and validation

Focused retrieval for `read_expertise(query, max_results)` is deterministic and local by
default. External embedding providers, vector databases, and network calls are not used by
this feature unless a later approved design adds an explicit opt-in. Do not edit `.env`,
secrets, keys, or provider credentials for retrieval. The targeted TypeScript validation
command for this behavior is:

```bash
cd pi/tests && bun vitest run read-expertise-retrieval.test.ts
```

The broader TypeScript suite can be run with `cd pi/tests && bun vitest run`, but it may have
pre-existing dependency failures unrelated to focused retrieval.

#### Optional provider-gated similarity policy

The expertise snapshot remains **deterministic by default**. Any future model-assisted similarity pass is optional, **disabled by default**, and must run only inside the synchronous snapshot rebuild path -- never as background orchestration.

Reserved config surface for that future path:
- feature flag: `expertise_similarity.enabled=false` by default
- provider/model selection: `expertise_similarity.provider`, `expertise_similarity.model`
- bounded execution: `expertise_similarity.timeout_ms`
- merge acceptance gate: `expertise_similarity.min_confidence`

To enable it locally, add an `expertise_similarity` block to `~/.pi/agent/settings.json`. Example:

```json
{
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.4",
  "defaultThinkingLevel": "medium",
  "expertise_similarity": {
    "enabled": true,
    "provider": "openai-codex",
    "model": "gpt-5.4-mini",
    "timeout_ms": 3000,
    "min_confidence": 0.75
  }
}
```

Notes:
- `expertise_similarity.enabled` must be `true` or the tie-breaker stays off.
- The configured provider/model must exist in Pi's model registry and have working auth.
- If the provider is unavailable, times out, returns malformed JSON, omits required fields, or returns low confidence, rebuilds still fall back to deterministic compaction.
- Provider-assisted merges are annotated in the snapshot with provenance metadata (`merge_metadata.method`, confidence, merged-from count).
- Snapshot rebuilds also record similarity usage stats (`attempted`, `merged`, `kept_separate`, `skipped_for_low_confidence`, `malformed`, `failed`) plus an activation reason.

Troubleshooting when enabled but not active:
- `reason=disabled` → feature flag is off.
- `reason=missing_provider` / `missing_model` → config is incomplete.
- `reason=registry_unavailable` → current read path does not have a model registry available.
- `reason=model_not_found` → Pi cannot resolve that provider/model pair.
- `reason=auth_unavailable` → the provider exists, but Pi has no usable auth.
- `reason=ready` with zero attempts → the feature is configured correctly, but no ambiguous `observation` / `pattern` / `open_question` candidates were found in that rebuild.

Debug surfaces:
- `read_expertise` tool results now include a `details.similarity` object with the activation reason and usage counters.
- The rendered snapshot text now includes a one-line similarity status summary for quick inspection.

Safety contract:
- Raw JSONL remains the source of truth; no provider pass may mutate or delete history.
- Deterministic pre-grouping must narrow candidates before any model call.
- Only `observation`, `pattern`, and `open_question` are eligible unless the docs explicitly expand the allowlist later.
- `strong_decision` and `key_file` are prohibited from model-assisted similarity.
- Low-confidence results, scores below the configured threshold, provider unavailability, rate limits, malformed responses, or timeout must all fall back to deterministic compaction.
- Deterministic compaction remains both the default path and the required fallback path.

Session conversation logs: `~/.dotfiles/pi/multi-team/sessions/{session_id}/conversation.jsonl`

---

## Skills

Shared repo skills from `~/.dotfiles/claude/skills/` are referenced into `~/.dotfiles/pi/skills/shared/` so Pi can auto-discover the same `SKILL.md` packages without duplicating them.

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

Skills are SKILL.md files -- read them to activate their guidance and tools.

---

## Sidecar Trace

Pi can record a high-fidelity, append-only sidecar trace of every session alongside (not inside) the normal session JSONL. This is an opt-in observability feature -- it is **default off** and must be explicitly enabled by the user.

### Scope

The sidecar trace captures:

- Exact provider request payloads sent before each LLM call (`llm_request` events).
- Assistant message content returned at turn end, including **visible thinking** blocks that the model exposes (`assistant_message`, one record per turn at `message_end` -- never one per streaming token).
- Tool-call inputs and outputs as Pi received them, including truncation metadata and a `full_output_path` reference when output is spilled to disk (`tool_call`, `tool_result`).
- Prompt-router classifier output, the applied route, confidence, rule fired, and policy/cap/hysteresis metadata (`routing_decision`).
- Model-selection changes (`model_select`).
- Session lifecycle (`session_start`, `session_shutdown`).
- Nested subagent events correlated to their parent via `parent_trace_id` (W3C Trace Context `TRACEPARENT` propagation).

**Hidden chain-of-thought is explicitly excluded.** Provider-internal reasoning that is not surfaced in the API response is never captured, regardless of whether a future provider exposes it. Only visible thinking blocks returned in the message content are persisted.

### Storage

Trace files are written to `~/.pi/agent/traces/<session-id>.jsonl` by default -- outside the repo and outside any synced project tree. The directory is created with mode 0700; each trace file is written with mode 0600 on Linux/WSL (Windows relies on user-profile ACL).

When a single payload field exceeds the configured `maxInlineBytes` limit, the oversized content is moved to a **spill file** at `~/.pi/agent/traces/<session-id>.spill/<event-id>-<field>.json.gz`. The main trace event records a spill reference with the relative path, SHA-256 hash, and uncompressed byte count so the field can be reconstructed exactly.

### Retention

Default retention window: **14 days** (`transcript.retentionDays`). At `session_start`, the writer sweeps the trace directory and removes trace and spill files whose modification time is older than `retentionDays`. The sweep is idempotent. Maximum JSONL file size before rotation: **64 MiB** (`transcript.maxFileBytes`).

To remove all trace files immediately, run:

```
/transcript-purge
```

Or with an age argument (removes files older than N days):

```
/transcript-purge 7
```

### Enabling

Tracing is **default off**. To enable, add a `transcript` block to `~/.pi/agent/settings.json` (the per-user runtime settings file -- do NOT add this to the repo-tracked `pi/settings.json`):

```json
{
  "transcript": {
    "enabled": true,
    "path": "~/.pi/agent/traces",
    "retentionDays": 14,
    "maxFileBytes": 67108864,
    "maxInlineBytes": 65536
  }
}
```

The loader reads `~/.pi/agent/settings.json` only. The repo-tracked `pi/settings.json` is intentionally never consulted for this toggle -- enabling tracing there would silently activate it for every dotfiles user.

### Secret redaction

The writer applies three-tier redaction before anything reaches disk:

1. **Header redaction** -- `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`, `x-amz-security-token`, `x-goog-api-key`, `x-anthropic-api-key`, `openai-organization`, and any header name matching `/(api[-_]?key|token|secret|cred|auth)/i` are replaced with `[REDACTED]` on both request and response sides.
2. **Field-name redaction** -- the same pattern is applied recursively to all payload object keys.
3. **Free-text scanning** -- `tool_result.content[*].text` and `tool_result.details` fields are scanned for AWS access keys (`AKIA...`), Anthropic tokens (`sk-ant-...`), OpenAI tokens (`sk-...`), GitHub PATs (`ghp_...`), Bearer-prefixed values, `api_key=...` assignments, and PEM private-key blocks. Matches are replaced with `[REDACTED]`.

Source objects are never mutated; redaction always operates on a deep clone.

The writer also refuses to write into directories that resolve (via `fs.realpath`) into known cloud-sync paths (`OneDrive`, `Dropbox`, `iCloudDrive`, `Google Drive`). A single warning is emitted and tracing is disabled for the remainder of the session.

### Wiring

Each Pi extension hook emits exactly one event family into the sidecar trace. The mapping is:

| Pi hook | Emitted event | Notes |
|---------|---------------|-------|
| `session_start` (in `session-hooks.ts`) | `session_start` | Initializes the writer, parses `TRACEPARENT`, runs the retention sweep |
| `turn_start` (in `transcript-provider.ts`) | (none -- advances internal turn counter) | Drives `turn_id` for all subsequent events |
| `before_provider_request` | `llm_request` | Cloned + redacted payload; `payload_unserializable` on circular refs |
| `after_provider_response` | `llm_response` | Status + redacted response headers (`set-cookie`, `authorization`, etc.) |
| `message_start` | `message_start` | Notes `message_id` for correlation |
| `message_update` | (none -- intentional no-op) | Per-token streaming is NEVER emitted; one `assistant_message` per turn |
| `message_end` | `assistant_message` | Exactly ONE per turn at `message_end`; visible thinking + tool-call requests |
| `model_select` | `model_select` | Records previous and current model identity |
| `tool_call` (in `transcript-tools.ts`) | `tool_call` | Cloned + redacted parameters |
| `tool_execution_start` | `tool_execution_start` | Records start time for duration computation |
| `tool_execution_end` | `tool_execution_end` | Carries `duration_ms` and `is_error` |
| `tool_result` | `tool_result` | Content, details, error state, truncation metadata |
| `routing_decision` (in `prompt-router.ts`) | `routing_decision` | `prompt_hash` joins to `routing_log.jsonl` |
| `session_shutdown` | `session_shutdown` | Final event before archival |

### Streaming discipline

Pi fires `message_update` per token during assistant message streaming. The transcript extension intentionally does NOT emit a record per token -- doing so would explode trace size on long responses. Instead:

- `message_update` is registered as a no-op hook.
- `message_end` emits exactly ONE `assistant_message` record with the final aggregated content, OTel usage attributes (`gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`), and `stop_reason`.
- A per-turn dedupe flag guards against duplicate emission when Pi fires `message_end` for tool-result messages in the same turn.

An optional `assistant_streaming` heartbeat (one record per N seconds during long generations) is documented in the schema but disabled by default.

### Routing decision hash-link

`routing_decision` records carry `prompt_hash = sha256(prompt_text)`. The same hash is logged by the Python-side classifier into `~/.dotfiles/pi/prompt-routing/logs/routing_log.jsonl`. The two logs are kept independently and can be joined post-hoc by `prompt_hash` -- the TypeScript sidecar trace captures the runtime envelope (turn, session, applied route, policy decision) while the Python log captures classifier internals (TF-IDF features, candidate scores). Neither log is modified by the other.

### Subagent correlation (W3C TRACEPARENT)

When `subagent` spawns a child Pi process via `child_process.spawn`, it injects a W3C Trace Context env var:

```
TRACEPARENT=00-<parent-trace-id>-<subagent-span-id>-01
```

The child Pi's `session_start` handler parses `TRACEPARENT`, adopts the parent's 32-hex `trace_id`, and writes the parent's 16-hex span id into `parent_trace_id` on every event it emits. This means a child trace file under `~/.pi/agent/traces/<child-session-id>.jsonl` can be stitched to its parent's trace by trace_id, and the originating subagent invocation can be located by parent_trace_id.

A fresh span id is generated for each subagent invocation (single, parallel, or chain step) so concurrent children do not share spans. When the parent has no active trace (transcript disabled), a new trace id is fabricated and propagated so the child can still record consistent W3C-shaped ids on its own side.

---

## Configuration

| File | Purpose |
|------|---------|
| `~/.dotfiles/pi/settings.json` | Default provider/model for session startup |
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
cat ~/.pi/agent/multi-team/expertise/backend-dev-mental-model.json
cat ~/.pi/agent/multi-team/expertise/backend-dev-expertise-log.jsonl
# Or from within Pi, ask an agent to read_expertise
```

`read_expertise` should prefer the compact snapshot when it is fresh. If the snapshot is missing, stale, or the last rebuild failed, it must rebuild or return the documented safe fallback rather than silently using outdated knowledge.

### Reset expertise for an agent

```bash
> ~/reset-expertise backend-dev   # delete log to start fresh
rm ~/.pi/agent/multi-team/expertise/backend-dev-expertise-log.jsonl
```
