# Pi Agent Setup

Pi is a minimal terminal coding agent (`@earendil-works/pi-coding-agent`) configured here with a multi-agent orchestration system, safety enforcement, and knowledge compounding via expertise files.

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

On all platforms, this uses `pnpm --config.minimumReleaseAge=720 add -g --allow-build=koffi --allow-build=protobufjs @earendil-works/pi-coding-agent` plus the matching `pi-agent-core`, `pi-ai`, `pi-tui`, and `@sinclair/typebox` packages on every installer run, then runs `scripts/pi-link-setup` (which junctions `~/.dotfiles/pi/` -> `~/.pi/agent/` on Windows, symlinks on Linux/macOS) and `scripts/pi-deps-link-setup` (which links the pnpm-global Pi packages into `pi/node_modules`). Pi uses a 12-hour release-age window while the global pnpm default remains 3 days. Final temporary install-time patches live in root `install.d/`; bash installs run `*.sh` plus common `*.py`, PowerShell installs run `*.ps1` plus common `*.py`, and moving a hook to `install.d/disabled/` turns it off.

The local dotfiles install also defaults `PI_CACHE_RETENTION=long` in the installed shell profiles (`zsh`, `bash`, `sh`, and PowerShell) unless you have already set a different value. That prefers extended provider-side prompt caching where Pi supports it (currently documented by Pi as Anthropic 1h and OpenAI 24h for direct API calls). OpenAI and OpenRouter-hosted OpenAI prompt caching are automatic for eligible long prompts; provider-specific `cache_control` markers are only for models/providers that require Anthropic-style caching semantics.

### Direct personality for GPT-5+

Pi can opt into a direct communication style without relying on Codex's `personality` config or an unsupported OpenAI `personality` API parameter. Add this to the per-user runtime settings file `~/.pi/agent/settings.json`:

```json
{
  "personality": "direct"
}
```

When enabled, `pi/extensions/direct-personality.ts` appends concise/direct style guidance to Pi's system prompt. For direct OpenAI/OpenAI-Codex GPT-5-family Responses payloads, the extension also requests `text.verbosity: "low"` when the provider payload supports that shape. Unsupported providers are left unchanged.

Rollback: remove the `personality` key or set it to `"default"`/`"none"`. The repo-tracked `pi/settings.json` does not enable direct mode by default; the setting is intentionally per-user opt-in.

### Codex plus Bedrock workflow

The tracked `pi/settings.json` keeps the Codex subscription provider as the startup default and limits `enabledModels` to the OpenAI Codex models used for `/model` scoped mode and Ctrl+P cycling. Bedrock model IDs are tracked separately under `bedrockRefresh.models`, so machines without Bedrock credentials do not receive unmatched-model warnings.

`/model` starts in scoped mode when `enabledModels` is set. Pressing Tab toggles to Pi's all-model view, which uses Pi's built-in provider sort instead of this curated order.

Bedrock credentials stay local and ignored in `~/.pi/agent/auth.json` (`pi/auth.json` in this repo checkout). To make Bedrock available without command-line flags or process-wide AWS variables, add an `amazon-bedrock` auth entry with provider-scoped environment values:

```json
{
  "amazon-bedrock": {
    "type": "api_key",
    "key": "",
    "env": {
      "AWS_PROFILE": "default",
      "AWS_REGION": "us-east-2"
    }
  }
}
```

This does not store AWS keys in the repo. The empty `key` keeps Pi 0.80.7 on profile-based AWS authentication instead of treating the ambient-auth marker as a Bedrock bearer token. The provider-scoped environment tells Pi to use the existing local AWS profile for Bedrock only, while normal shell AWS commands keep their own environment/profile behavior.

Poll AWS Bedrock for newer Opus, Fable, and Sonnet model IDs from inside Pi:

```text
/bedrock-refresh
```

The command is read-only by default and reports current vs latest configured model lines. To update `pi/settings.json` `bedrockRefresh.models` to the latest matching `us.*` model IDs:

```text
/bedrock-refresh --apply
```

The command reports a warning when a newer model is available or a configured model is stale, so it can be used as a periodic check from inside Pi.

Validation:

```bash
env -u AWS_PROFILE -u AWS_DEFAULT_PROFILE -u AWS_REGION -u AWS_DEFAULT_REGION \
  pi --provider amazon-bedrock \
  --model us.anthropic.claude-haiku-4-5-20251001-v1:0 \
  --no-tools --no-extensions --no-skills --no-context-files --no-session \
  -p 'Reply with exactly: bedrock-ok'
```

### JavaScript package-manager policy

Do not use `npm` in this repository. Do not create or commit `package-lock.json`.

Package-manager priority:

1. Use `pnpm` for the global `pi` install on every platform and for any package that already has `pnpm-lock.yaml`.
2. Prefer `bun` for other JavaScript/TypeScript tooling when no package-specific lockfile or note says otherwise.
3. If npm artifacts are accidentally created, remove `package-lock.json` and reinstall with the correct manager.

Pi-specific package-manager boundaries:

- `pi/` is pnpm-managed (`package.json` + `pnpm-lock.yaml`) and owns Pi TypeScript typecheck/test dependencies.
- Pi runtime packages such as `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui`, and `@sinclair/typebox` are installed globally by pnpm and linked into `pi/node_modules` by `scripts/pi-deps-link-setup`.
- Do **not** run `bun add` for Pi extension/runtime packages and do not recreate `pi/extensions/package.json`, `pi/extensions/pnpm-lock.yaml`, or `pi/tests/package.json`.
- Type-check extensions with:
  ```bash
  cd pi && pnpm install --frozen-lockfile && pnpm run typecheck
  ```
- Run Vitest with `cd pi && pnpm install --frozen-lockfile && pnpm test`.
- Do **not** use Bun for Pi TypeScript validation: no `bun add`, `bun install`, `bun run`, or `bun test` in `pi/`, `pi/extensions/`, or `pi/tests/`. This avoids ambiguity between Bun's built-in test runner and Vitest, and keeps Pi package resolution on the pnpm lockfile.
- `Makefile` target `check-pi-extensions` is the canonical combined Pi validation: pnpm extension typecheck first, then pnpm/Vitest tests.

### Why pnpm for the global `pi` install

The global `pi` package is installed with pnpm on every platform.

Reason: bun's looser resolver let pi's transitive deps (`pi-agent-core`, `pi-ai`, `pi-tui`) drift to newer patch versions even when `pi-coding-agent` itself was pinned; for example, a pinned `pi-coding-agent@0.72.0` could still ship `pi-agent-core@0.72.1` in the TUI banner. pnpm's strict resolver respects the pin, its content-addressable global store keeps installs reproducible, and its explicit build-script approval model is satisfied by passing `--allow-build=koffi --allow-build=protobufjs` for the two native postinstall steps Pi requires. Bun previously also failed on transitive AWS SDK packages on Windows.

Bun stays installed for other JS tooling in this repo (`pi/extensions/web-fetch`, ad-hoc `bun` scripts); this policy only applies to the global `pi` binary. pnpm is declared in `Brewfile` (macOS) and `winget/configuration/core.dsc.yaml` (Windows) alongside Node.js.

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
# All platforms
pnpm add -g --allow-build=koffi --allow-build=protobufjs \
    @earendil-works/pi-coding-agent \
    @earendil-works/pi-agent-core \
    @earendil-works/pi-ai \
    @earendil-works/pi-tui \
    @sinclair/typebox
~/.dotfiles/scripts/pi-link-setup
~/.dotfiles/scripts/pi-deps-link-setup
```

---

## Damage-control safety validation

Pi damage-control is Pi-only and lives in `pi/extensions/damage-control.ts` plus focused sibling modules for rule loading, pure engine decisions, and opt-in debug logging. The canonical command/path policy is Claude's in-repo `claude/hooks/damage-control/patterns.yaml` when present, parsed through the full-YAML Python/PyYAML helper and normalized into Pi's TypeScript engine. `PI_DAMAGE_CONTROL_CLAUDE_POLICY_PATH` can point at an explicit Claude policy; if that override is missing or invalid, damage-control fails closed. If no override is set and the in-repo Claude policy is unavailable, Pi falls back to `pi/damage-control-rules.yaml` in explicit Pi-only mode.

Debug logging is disabled by default. To enable redacted diagnostic logs for a short investigation, set `PI_DAMAGE_CONTROL_DEBUG=1`; logs may appear at `.pi/damage-control-debug.log` and `~/.pi/agent/damage-control-debug.log`. Do not print old debug logs directly: inventory paths first and inspect only redacted, synthetic entries.

Validation commands are pnpm-only:

```bash
cd pi && pnpm test damage-control.test.ts
cd pi && pnpm run typecheck
make check-pi-extensions
```

For live smoke tests, restart/reload Pi so extension modules and policy files reload, then use a disposable temp repo with synthetic sentinel files or temporary test-only rules. Never execute shell reads against real `.env`, SSH keys, `*.pem`, or `*.key` files. On Windows/macOS, Linux-only ask rules such as `docker compose down` are best validated with deterministic Vitest tests or a temporary non-destructive ask rule.

## Source vs. runtime state

This repository keeps curated Pi source/config trackable and leaves generated runtime
state local. Commit changes to maintained config such as `pi/agents/`,
`pi/multi-team/skills/`, `pi/skills/`, `pi/extensions/`,
`pi/lib/`, `pi/tests/`, `pi/settings.json`, `pi/feature-memory.json`, tracked
feature dossiers under `.specs/features/`, prompt-router source/docs/data/models
that are intentionally versioned, and lockfiles such as
`pi/prompt-routing/uv.lock`.

Do not delete or commit local runtime state unless a separate migration explicitly
approves it. Treat these as generated/local: `pi/history/`, `pi/sessions/`,
`pi/multi-team/sessions/`, `pi/multi-team/logs/`, all
`*-expertise-log.jsonl` files and project-local directories under
`pi/multi-team/expertise/`, local indexes, caches, logs, virtualenvs, and
`node_modules/`. Expertise JSONL is the durable runtime source of truth, but it is
not curated repository source. Curated prompt-router data and models may remain
versioned; classify them deliberately rather than hiding broad directories.

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

just          # default -- Pi with the configured extension set
just solo     # bare Pi, no extensions
just safe     # damage-control only (safety rules)
just full     # all extensions (damage-control + subagent + quality-gates + session-hooks)
just guard    # full stack + conventional commit enforcement
```

Or invoke Pi directly:

```bash
pi
pi --no-extensions
pi -e ~/.dotfiles/pi/extensions/damage-control.ts
```

---

## Extensions

Repository-owned TypeScript extensions live in `~/.dotfiles/pi/extensions/`. See the upstream Pi extension documentation for loading and discovery behavior.

Extension-owned slash commands persist their visible invocation in the transcript
without starting an extra provider turn. Each command-owning extension wraps its
local registration API through `pi/lib/slash-command-echo.ts`; workflows that
already persist a mature invocation format are explicitly excluded from the
shared echo.

### `damage-control.ts`

Pi damage-control is a Pi-native adapter for the intent of the Claude Code damage-control hooks. It uses Pi extension APIs, status text, `/doctor`, and `/permissions` rather than importing the Claude hook runtime. Current coverage is intentionally bounded: Claude `bashToolPatterns` (Bash-only, excluding `exfil` entries from all-pattern parity claims) plus Claude path/write sections that map to Pi's tool surfaces. Semantic git analysis, AST bash analysis, taint/sequence detection, and post-tool secret-output detection remain deferred.

Intercepts tool calls and blocks dangerous operations before they execute.

- **Dangerous commands** -- blocks `rm -rf`, `git reset --hard`, `dd if=`, etc.
- **Zero-access paths** -- blocks read/write to `~/.ssh/*`, `*.pem`, `*.key`, `.env`
- **No-delete paths** -- protects `package.json`, `Makefile`, `pyproject.toml`

Primary policy file: `~/.dotfiles/claude/hooks/damage-control/patterns.yaml`. Fallback Pi-only rules file: `~/.dotfiles/pi/damage-control-rules.yaml`.

### `quality-gates.ts`

Collects files changed by write and edit operations, then runs the appropriate linters when the agent run ends. Failures trigger a follow-up repair turn before the session settles, with at most two automatic repair attempts before control returns with an unresolved warning.

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
```

Stateful workflow templates are loaded from `~/.dotfiles/pi/skills/workflow/`.
Prompt-only commands use Pi-native templates under `~/.dotfiles/pi/prompts/`:

```text
/summarize [focus]                 # concise session recap and workflow friction
/gitlab-ticket [feature or change] # structured issue with optional branch and draft MR
```

Workflow highlights:
- `/plan-it` writes standalone plans with evidence, dependencies, validation, and durable execution state.
- `/review-it` selects independent review capabilities from the current runtime, applies verified artifact fixes, and validates readiness.
- `/do-it` handles bounded raw tasks or executes an existing `.specs/*/plan.md` through its recorded gates.
- `/commit` uses deterministic candidate extraction, isolated secret review, and ownership-aware commit planning. Ambiguous cross-domain paths require an explicit user decision instead of becoming one broad commit.

### `loop.ts`

Runs one validated plan slice per resumable iteration. When the worktree is
dirty, `/loop start` queues the existing `/commit` workflow and retries only
after that baseline finishes cleanly. It then exits the current Pi process after
launching the detached supervisor so only one writer occupies the worktree.

```text
/loop start .specs/example/plan.md [more plans...]
/loop status [job-id]
/loop stop <job-id>
/loop resume <job-id>
```

Runtime state and logs live under `%LOCALAPPDATA%/pi/loops/<job-id>/` on
Windows and `~/.local/state/pi/loops/<job-id>/` elsewhere. Set `PI_LOOP_DIR` to
override the state root. `loop.log` contains compact, schema-versioned JSON
records for supervisor and child Pi lifecycle events, process IDs, invocation
and iteration duration, exit status, output/session sizes, retries, and the
terminal stop reason. Per-invocation stdout and stderr remain in
`logs/iteration-NNN.log`, and continued session records remain under `session/`.
Jobs started by older versions may have legacy text lines before the JSON
records. While an interactive Pi session is open, the footer shows
`loop <job-id> T:<iteration>/<maximum>` when the maximum is known and omits the
maximum for legacy jobs. Active task status follows the loop, and compact
month-to-date Bedrock cost is last, for example
`loop rationalization-345 T:35/100 | tasks 2 (2 running) | bedrock $71.64`.
The five-second refresh uses asynchronous file reads, never overlaps polls, and
updates the footer only when the value changes. It disappears when no supervisor
PID is active. A job becomes trustworthy only after its first
validated commit; startup and extension loading alone are not reported as
progress. The supervisor never pushes and stops after bounded invocation
failures, quiescence, or repeated iterations without a commit.

### `scheduler.ts`

Provides process-local one-shot and recurring prompt scheduling. Jobs survive
`/reload`, `/new`, `/resume`, and `/fork` within the current Pi process, then
stop when that process exits. If a job becomes due during session replacement,
it is delivered to the next active session. Recurring jobs keep at most one
prompt pending until the agent settles.

```text
/at 15m -- Recheck the deployment status
/at 2026-07-18T09:00:00-04:00 -- Continue the release checklist
/cron "0 9 * * 1-5" --tz America/New_York -- Review open tasks
/schedule list
/schedule cancel <id>
```

Cron expressions use five fields. Scheduled prompts cannot start with `/`, so
slash workflows do not run unattended. The model-callable `schedule` tool can
create, list, and cancel the same jobs; create and cancel actions require TUI
confirmation. Schedule lifecycle metrics contain job IDs and timing metadata,
not prompt text.

### `feature-memory.ts`

Feature memory provides bounded, feature-specific context across sessions. The tracked `pi/feature-memory.json` registry maps stable feature IDs to a title, a tracked dossier, literal case-insensitive prompt triggers, and repo-relative path triggers. On the first matching prompt in a session, `before_agent_start` injects one hidden, non-authoritative custom message containing the curated dossier and recent local events. A feature is injected only once per session; a new session or `/reload` resets that in-memory boundary.

Curated dossiers and local events have different owners. A dossier such as `.specs/features/pi-improve/context.md` is reviewed, tracked repository context. Runtime events are append-only observations in `${PI_FEATURE_MEMORY_DIR}/events.jsonl` when the override is set, otherwise `~/.pi/agent/feature-memory/events.jsonl`; they remain untracked and never modify a dossier automatically. The model-callable `feature_memory_record` tool is available only as a narrow capture boundary during work that matched a registered feature. It records explicit user decisions, validated evidence, open questions, or supersessions. It must not record raw transcripts, general summaries, secrets, speculative conclusions, or unbounded tool output.

Each local event contains only its schema version, event ID, recording time, feature ID, kind, bounded summary, and supporting repository paths. Retrieval is bounded to recent events. Treat local events as potentially stale: later `supersession` events and current repository evidence take precedence, while promotion into a dossier requires an explicit tracked edit. Do not point `PI_FEATURE_MEMORY_DIR` at a shared or synced directory.

Rollback: remove or disable `pi/extensions/feature-memory.ts` and reload Pi to stop retrieval and capture. Removing the registry, loader, tests, and tracked dossiers completes a source rollback. Local events may be retained because tracked behavior does not depend on them. To remove local events, first stop Pi writers, verify the exact configured directory, and remove only its `events.jsonl` file.

### `workflow-friction-review.ts`

Measures each interaction from submission through `agent_settled` and records metadata-only denominator metrics for every interaction. It silently queues selected interactions for a bounded background review: explicit remember requests, corrections after an existing conversation turn, every interaction over 10 minutes, every subagent run lasting at least 2 minutes, high-confidence triggered interactions from 2 through 10 minutes, and a deterministic 15 percent control sample from the remaining 2-to-10-minute interactions. Subagent records include the durable run ID and spawn time for correlation with operator tasks. Review jobs run one at a time from a persistent local queue and never delay the original interaction.

Runtime records live under `~/.pi/agent/workflow-friction/` and remain uncommitted. `interactions.jsonl` contains timing, mode, selection, tool, validation, subagent, and mutation counts without prompt or response content. Reviewed interaction packets remain local in `reviews.jsonl`; applied or skipped learning decisions are append-only records in `learning-decisions.jsonl`. Set `PI_WORKFLOW_FRICTION_DIR` to use a separate local directory. At interaction settlement, the extension also emits a metadata-only `orchestration_interaction` metrics event for direct and delegated interactions.

```text
/improve                          # discuss the highest-ranked unresolved candidate
/improve list                     # list ranked unresolved candidates
/improve select <number-or-id>    # discuss one listed candidate by ordinal or unique ID prefix
/improve decide apply             # apply the selected proposal
/improve decide edit <change>     # apply an edited proposal
/improve decide skip <reason>     # skip the selected proposal
/improve help                     # show command and decision guidance
```

`/improve` is the only public self-improvement workflow. It ranks pending candidates by safety or correctness impact first, then verified 30-day usage, confidence, and stable age/ID tie-breakers. Structured skill, command, extension, and tool targets use deterministic local statistics; unresolved telemetry remains unknown rather than being treated as zero. `/improve list` writes the ranked workspace-visible candidates to the transcript without starting a discussion and stores that displayed order for the session. `/improve select <number-or-id>` resolves ordinals against the displayed snapshot, accepts unique ID prefixes against current candidates, and records the selected candidate in the transcript before discussion. Bare `/improve` preserves the highest-ranked default.

Each discussion remains in a deterministic `discussing` state while the user asks questions or raises issues. Ordinary conversation never authorizes a change. Only `/improve decide apply`, `/improve decide edit <change>`, or `/improve decide skip <reason>` captures a decision and resumes execution without another approval request. Applied changes require target paths, validation evidence, and rollback instructions and create an experiment marker for later comparison. A recorded applied or skipped decision removes that candidate from later lists.

Interaction capture and background review remain automatic internal stages. Free-form `/improve <capture note>` input is no longer supported. The retired `/capture`, `/learning-review`, `/workflow-review`, and `/skill-review` commands are not registered. `/review-it` remains separate because it reviews a supplied plan or PRD, while `/usage`, `/usage-stats`, `/extension-stats`, `/router-stats`, `/skill-stats`, and `/orchestration-stats` remain read-only diagnostics. `/usage-stats` renders its deterministic report without starting a provider turn.

### `orchestration-stats.ts`

Adds `/orchestration-stats [days]` for a bounded, observational report of `orchestration_run` and `orchestration_interaction` metrics. The report covers delegation topology, parent and worker usage, known and unavailable cost, output-byte handling, duration, run status, and workflow-friction correlation. The default window is 7 days and the maximum is 365 days.

Metrics are written best-effort under `~/.pi/agent/logs/` by default. Set `metrics.enabled` to `false` to opt out, or set `PI_METRICS_DIR` to use an isolated local metrics root. Metrics have no built-in retention or purge job. Do not use a shared or synced metrics directory. These events retain operational metadata only; they do not retain prompts, child output, terminal output, tool arguments, or response content.

For a bounded purge, stop writers, back up one identified metrics JSONL file, and remove only its `orchestration_run` and `orchestration_interaction` records. Verify the backup and remaining records before replacing that one file. A dedicated scratch `PI_METRICS_DIR` may instead be removed after confirming that it contains no other records.

Run the deterministic isolated CLI check before a live telemetry check:

```bash
node pi/scripts/run-isolated-pi-smoke.mjs
node pi/scripts/run-isolated-pi-smoke.mjs orchestration-telemetry --live
```

The first command makes no provider call. The second command performs one delegated provider interaction, then runs `/orchestration-stats` without tools against the same isolated roots.

See `pi/docs/orchestration-telemetry.md` for field schemas, joins, validation order, reader bounds, and report definitions.

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
- Provider argument: refreshes only that provider (currently `anthropic`, `openai-codex`, `github-copilot`, `openrouter`, `opencode`, and `opencode-go`).
- Unsupported providers are skipped with a warning.
- Uses existing session credentials and updates in-session model availability immediately.
- Prints per-provider diffs with model IDs that were added/removed.
- Caches versioned provider catalog facts rather than complete Pi model definitions.
- On startup, preserves current Pi metadata for built-in Codex models and restores only cached model discoveries that Pi does not yet know.
- Newly released Codex models may appear through `/refresh-models openai-codex` before they are added to the tracked startup `enabledModels` list.

### `model-visibility.ts`

Applies startup model-list cleanup for noisy provider catalogs.

Behavior:
- Hides date/version-suffixed and preview snapshot models for `openai-codex`, `github-copilot`, `opencode`, `opencode-go`, and `openrouter`.
- Limits Amazon Bedrock visibility to the configured `us.anthropic` Claude models used by the Codex plus Bedrock workflow.
- Applies provider-specific blocklists (including internal/legacy model IDs) before `/model` selection.

### Operator Layer

Three companion extensions surface durable task and permission state for
long-running work. They share the registries in `pi/lib/task-registry.ts`
and `pi/lib/permission-registry.ts`, which are the canonical owners of
`TaskRecordV1` and `PermissionDecision` for any extension that needs to
record subagent runs or permission decisions.

Storage location: `~/.pi/agent/operator/{tasks,permissions}/`. Override
with `PI_OPERATOR_DIR` (used by tests).

Producer wiring: `subagent` and `damage-control` write to the
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

Model-callable task surface:
- The unified `task` tool owns durable dependencies and background execution through `create`, `batch`, `update`, `remove`, `list`, `ready`, `get`, `execute`, `execute_many`, `await`, `stop`, and `output` actions. Ordinary multi-step work uses a lightweight prose plan instead; durable records are optional for user-requested lists, main-thread tracking, dependencies, cross-turn work, and background execution.
- A graph-aware `batch` can mix manual and executable tasks with request-local keys and dependency keys. Use returned aliases for later actions; manual tasks remain main-thread-owned and advance through `update`.
- Tasks default to the current repository workspace; `list` and `ready` accept `all: true` for a cross-repository view and return compact model-visible summaries. Use `get` for one complete record.
- Executable tasks accept `agent`, `task`, `cwd`, `agentScope`, `model`, and `modelSize`. Use bounded `execute_many` to start ready workers concurrently, then call `await` once to join same-session workers without polling.
- `stop` cancels a running child process tree. `output` returns small results inline and a concise durable artifact reference for large results; full bounded details remain available to the TUI renderer.
- Start execution once, request output when needed, and record lifecycle changes only when state changes. Do not poll task actions in loops.
- Batch graph validation occurs before writes, but batch publication is not transactional. On `write_failed`, inspect the returned persisted IDs, clear each persisted task's `blockedBy` in reverse request order through `update`, then tombstone it with `remove`; do not assume automatic rollback or retry.
- Legacy `.pi/todo.json` entries are imported idempotently into the durable registry at session startup. Isolated tests may set `PI_LEGACY_TODO_SOURCE_DIR` to an empty native directory while preserving the tested workspace identity. The retired `todo` and individual `task_*` tools are no longer registered.

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

Classifies every user prompt and switches **both canonical route and thinking
effort** for the same generation turn. The router uses canonical route sizes
`nano`, `mini`, `core`, `large`, and `max`; legacy classifier labels are adapted
at the TypeScript boundary and are not primary operator vocabulary.

Routing is **dynamic**: the raw classifier route is resolved through the current
provider/profile contract, then policy applies context-continuation holds,
explicit overrides, provider trust boundaries, route-state fallbacks, and effort
caps before Pi sends the provider request.

See `pi/prompt-routing/docs/operator-handoff.md` for `/router-status`,
`/router-explain`, required operator examples, telemetry privacy/purge, and eval
commands.

#### Runtime routing contract

The provider route is authoritative. It applies explicit overrides, a one-turn
hold for dependent continuation prompts, explicit downgrade-intent bypass, a
context-window floor, and provider-family trust boundaries.

Active settings are limited to `router.classifier.mode` and
`router.effort.defaultLevel`; see
`pi/prompt-routing/docs/settings-doc.md` for the per-key reference. Legacy
`router.policy.*` settings and `router.effort.maxLevel` are retired.

**Footer indicator:** `> <small model>` / `>> <medium model>` / `>>> <large model>` after each routed prompt.

**Slash commands:**
```text
/router-status    # current route, classifier mode, overrides, route states
/router-explain   # full decision trail for the last turn
/router-reset     # clear session router state
/router-off       # disable routing (keep current model)
/router-on        # re-enable routing
```

`/router-explain` shows the actual classifier mode, canonical raw/applied
routes, confidence/candidates, policy rule fired, context capsule flags,
provider/model/effort resolution, route state, fallback reason when present, and
a one-line operator summary.

Common `Rule fired` values include `classifier`, `context-continuation-hold`,
`explicit-route-override`, `manual-model-selection`, `context-window-floor`,
and `null-fallback`.

**Where the classifier lives.** `~/.dotfiles/pi/prompt-routing/` -- see the
README/AGENTS.md there for the training pipeline. `classify.py` is the CLI
wrapper the extension spawns per turn; ConfGate is implemented in
`classifier_confgate.py` (LGB primary, T2 fallback when LGB conf < CONF_GATE).
Artifacts: `models/router_v3.joblib` (T2) and `models/router_v3_lgbm.joblib`
(LGB), both SHA256-verified at load.

**Troubleshooting:**

- Routing decisions are logged with prompt hashes by default, not raw prompt
  text. See `pi/prompt-routing/analytics.md` for the privacy, purge, and
  rotation contract.
- If `/router-explain` shows `Rule fired: null-fallback`, the classifier failed
  or returned garbage; the router kept the previous safe route. Reproduce with
  `uv run --project ~/.dotfiles/pi/prompt-routing python ~/.dotfiles/pi/prompt-routing/classify.py --classifier t2 "test prompt"`.
- If `context-continuation-hold` fires unexpectedly, check whether the prompt
  looked like a dependent follow-up. Add explicit cheap/fast/brief wording to
  request a downgrade.

---

## Prompt Routing

The `prompt-routing/` directory contains a local complexity classifier that
automates model selection. The `prompt-router.ts` extension integrates it
transparently into every Pi session.

### How it works

```
You type a prompt
        v
prompt-router.ts intercepts (input event)
        v
classify.py calls model.pkl (~200ms)
        v
route() returns low | mid | high
        v
resolve current provider/model ladder
        v
pi.setModel() switches to the resolved small / medium / large rung
        v
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

Work directly on one coherent task. Delegate when independent work, specialized capability, verification independence, or context isolation provides a concrete benefit. Explicit user routing overrides remain authoritative.

Repository-owned worker definitions live in `pi/agents/`; loading and precedence are implemented by `pi/extensions/subagent/agents.ts`.

### Agent configuration

The agent parser consumes these frontmatter fields:

- Required: `name`, `description`
- Enforced by the subagent launcher: `tools`, `model`, `effort`, `skills`
- Advisory metadata: `isolation`, `memory`

The parser applies no default frontmatter values. Frontmatter `effort` is passed
to child Pi as `--thinking`; an explicit per-launch `effort` override takes
precedence in single, parallel, and chain modes. Child skill discovery is
disabled with `--no-skills`; each
`skills` entry is resolved to an explicit skill file and passed with `--skill`.
Skill entries may be discovered skill names or paths relative to the agent file.
Missing skills fail the launch explicitly. `tools` is a tool-name allowlist, not
a path sandbox; any assigned path scope in an agent prompt is guidance only.
Unknown fields are not execution contracts.

Agent config recovery: if a bad worker definition prevents normal coordination, start Pi
with `pi --no-extensions`, repair the affected file under `pi/agents/`, run
`cd pi && pnpm test subagent.test.ts`, and restart Pi normally.

### Expertise storage and retrieval

Expertise JSONL under `pi/multi-team/expertise/` is the durable runtime source
of truth. Derived indexes are disposable. The legacy mental-model snapshots are
retired, and `read_expertise` and `append_expertise` are unavailable and blocked.
Put durable instructions in `AGENTS.md` or skills instead.

Current paths, retrieval behavior, safety, and canonical tests are documented in
[`pi/docs/expertise-layering.md`](docs/expertise-layering.md).

---

## Skills

Shared skill packages are referenced under `~/.dotfiles/pi/skills/shared/` without duplicating their source. Community packages are installed under `~/.dotfiles/pi/skills/pi-skills/`:

| Skill | Purpose |
|-------|---------|
| `brave-search` | Web search via Brave Search API |
| `browser-tools` | Browser automation and content extraction; use `scripts/agent-browser-brave` for safe Brave + `agent-browser` workflows |
| `youtube-transcript` | Fetch YouTube transcripts |
| `gccli` | Google Calendar CLI integration |
| `gdcli` | Google Drive CLI integration |
| `gmcli` | Gmail CLI integration |
| `transcribe` | Audio transcription |
| `vscode` | VS Code integration |

Loading and invocation behavior is documented by upstream Pi.

---

## Sidecar Trace

Pi can record a high-fidelity, append-only sidecar trace of every session alongside (not inside) the normal session JSONL. This is an opt-in observability feature -- it is **default off** and must be explicitly enabled by the user.

### Scope

The sidecar trace captures:

- Exact provider request payloads sent before each LLM call (`llm_request` events).
- Assistant message content returned at turn end, including **visible thinking** blocks that the model exposes (`assistant_message`, one record per turn at `message_end` -- never one per streaming token).
- Tool-call inputs and outputs as Pi received them, including truncation metadata and a `full_output_path` reference when output is spilled to disk (`tool_call`, `tool_result`).
- Prompt-router classifier output, applied route, confidence, rule, context flags, overrides, provider trust, and fallback metadata (`routing_decision`).
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
| `~/.dotfiles/pi/AGENTS.md` | Canonical shared global instructions linked from `claude/CLAUDE.md` |
| `~/.dotfiles/pi/damage-control-rules.yaml` | Safety rules for damage-control extension |

Project-level overrides: place `AGENTS.md` or `.pi/settings.json` in any repo root.

---

## Typical Workflows

### Solo coding task

```bash
just          # launch with all extensions
> Build a REST endpoint for /api/users
```

### Expertise reference

Expertise JSONL and its derived local index are runtime state, not an agent-facing
instruction surface. The expertise tools are unavailable. See
[`pi/docs/expertise-layering.md`](docs/expertise-layering.md) for current ownership,
retrieval, safety, and retirement details.
