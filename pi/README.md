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

On all platforms, this uses `pnpm --config.minimumReleaseAge=720 add -g --allow-build=koffi --allow-build=protobufjs @earendil-works/pi-coding-agent@latest`. The package declares and resolves its Pi runtime dependencies; the installers remove obsolete direct global installs of those dependencies after a successful update. They then run `scripts/pi-link-setup` (which junctions `~/.dotfiles/pi/` -> `~/.pi/agent/` on Windows, symlinks on Linux/macOS) and `scripts/pi-deps-link-setup` (which links the pnpm-global Pi packages into `pi/node_modules`). The installers also initialize the pinned `modules/onclave` and `modules/homelab-infra` submodules and run Onclave's frozen pnpm workspace install because `pi/extensions/onclave-pi.ts` loads the communications extension from that checkout. Pi uses a 12-hour release-age window while the global pnpm default remains 3 days. Final temporary install-time patches live in root `install.d/`; bash installs run `*.sh` plus common `*.py`, PowerShell installs run `*.ps1` plus common `*.py`, and moving a hook to `install.d/disabled/` turns it off.

The local dotfiles install also defaults `PI_CACHE_RETENTION=long` in the installed shell profiles (`zsh`, `bash`, `sh`, and PowerShell) unless you have already set a different value. That prefers extended provider-side prompt caching where Pi supports it (currently documented by Pi as Anthropic 1h and OpenAI 24h for direct API calls). OpenAI and OpenRouter-hosted OpenAI prompt caching are automatic for eligible long prompts; provider-specific `cache_control` markers are only for models/providers that require Anthropic-style caching semantics.

### Direct personality for GPT-5+

Pi can opt into a direct communication style without relying on Codex's `personality` config or an unsupported OpenAI `personality` API parameter. Add this to the per-user runtime settings file `~/.pi/agent/settings.json`:

```json
{
  "personality": "direct"
}
```

When enabled, `pi/extensions/direct-personality.ts` requests `text.verbosity: "low"` for OpenAI/OpenAI-Codex GPT-5-family Responses payloads. It does not append duplicate style guidance to Pi's system prompt, and unsupported providers are left unchanged.

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

The universal `/refresh-models` command polls AWS Bedrock for newer Fable, Opus, Sonnet, and Haiku model IDs and updates `pi/settings.json` `bedrockRefresh.models` with the latest supported `us.*` IDs.

Validation:

```bash
env -u AWS_PROFILE -u AWS_DEFAULT_PROFILE -u AWS_REGION -u AWS_DEFAULT_REGION \
  pi --provider amazon-bedrock \
  --model us.anthropic.claude-haiku-4-5-20251001-v1:0 \
  --no-tools --no-extensions --no-skills --no-context-files --no-session \
  -p 'Reply with exactly: bedrock-ok'
```

### Bedrock Claude subscription-only orchestration

When the resolved primary model is Claude Fable or Opus on either `amazon-bedrock` or `bedrock-mantle`, that selected Claude model remains the root orchestrator in TUI, RPC, JSON, and print modes. Its provider-visible control plane is limited to the applicable `subagent_read`, `subagent_write`, `subagent_teamlead`, `subagent_status`, `subagent_control`, and `task` tools plus root-authored plan, goal, and architecture writes under `.specs/`, with state-gated workflow closeout tools. An active `/plan-it` lifecycle may expose `plan_progress`, and the existing `/do-it` state gate may expose `plan_archive`; the restricted root cannot expose these tools independently. Historical subagent names remain registered for supported resumed calls but stay hidden from discovery; saved-session continuation, other direct inspection or mutation, validation, shell, web, and commit tools are blocked before execution. Switching to another model reveals the current tool state, including owner changes made while the restriction was active, rather than restoring a stale snapshot.

The restricted Claude root dispatches direct subagents and bounded workflows, not Team Leads. After trusted agent discovery, every requested child model is resolved before any child starts. Explicit models and agent pins must name an available `openai-codex` model; omitted and size-based selections resolve from available `openai-codex` models only. The default size ladder is Luna high for bounded work, Luna medium for ordinary multi-file work, and Sol low for complex cross-cutting work. One invalid member rejects the complete batch or workflow before spawn. Caller-supplied output paths are rejected. Provider-visible foreground results are limited to 50 KB or 2000 lines, with complete output written to a runtime-generated private temporary artifact when truncation is required.

Other primary models retain their normal tools and routing. The selected primary model owns root orchestration. Naming the obsolete delegated agent `orchestrator` returns a migration error; naming `teamlead` from the root defaults to the runtime Team Lead role for one independently verifiable package.

### Automatic Bedrock routing

`pi/extensions/bedrock-mantle.ts` registers the `bedrock-mantle` provider as a
curated Bedrock interface. At startup it reads the selected region's Mantle
`/v1/models` catalog and exposes the newest supported Claude Fable, Opus,
Sonnet, and Haiku models plus every tier of the newest supported GPT release.

GPT models use Mantle's OpenAI Responses API. Claude models use Mantle's
Anthropic Messages API when the selected Mantle region advertises them. When a
Claude family is absent from Mantle, the same logical model ID routes through
the corresponding `us.*` Bedrock Runtime inference profile instead. Routing is
selected before a request starts; failed requests are not replayed through a
different endpoint.

Authentication reuses `AWS_BEARER_TOKEN_BEDROCK` when present. Otherwise the
AWS-maintained `@aws/bedrock-token-generator` package creates a one-hour
short-term bearer token from `BEDROCK_MANTLE_AWS_PROFILE`, `AWS_PROFILE`, or
the normal AWS credential chain. The token stays in process memory and no
long-term API key is stored. `BEDROCK_MANTLE_REGION` controls Mantle independently
from the Runtime `AWS_REGION` and defaults to `us-east-1`, where both current
Claude and GPT families are available.

The tracked `enabledModels` patterns automatically include newly curated model
IDs in scoped `/model` selection:

```text
bedrock-mantle/anthropic.claude-fable-*
bedrock-mantle/anthropic.claude-opus-*
bedrock-mantle/anthropic.claude-sonnet-*
bedrock-mantle/anthropic.claude-haiku-*
bedrock-mantle/openai.gpt-*-sol
bedrock-mantle/openai.gpt-*-terra
bedrock-mantle/openai.gpt-*-luna
```

Live validation with an existing AWS profile:

```bash
AWS_PROFILE=default \
  pi --provider bedrock-mantle --model anthropic.claude-sonnet-5 \
  --no-tools --no-skills --no-context-files --no-session \
  -p 'Reply with exactly: mantle-ok'

BEDROCK_MANTLE_REGION=us-east-2 AWS_PROFILE=default AWS_REGION=us-east-2 \
  pi --provider bedrock-mantle --model anthropic.claude-sonnet-5 \
  --no-tools --no-skills --no-context-files --no-session \
  -p 'Reply with exactly: runtime-ok'
```

AWS protocol references:

- [API compatibility by models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html)
- [Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html)
- [AWS Bedrock token generator](https://github.com/aws/aws-bedrock-token-generator-js)

### JavaScript package-manager policy

Do not use `npm` in this repository. Do not create or commit `package-lock.json`.

Package-manager priority:

1. Use `pnpm` for the global `pi` install on every platform and for any package that already has `pnpm-lock.yaml`.
2. Prefer `bun` for other JavaScript/TypeScript tooling when no package-specific lockfile or note says otherwise.
3. If npm artifacts are accidentally created, remove `package-lock.json` and reinstall with the correct manager.

Pi-specific package-manager boundaries:

- `pi/` is pnpm-managed (`package.json` + `pnpm-lock.yaml`) and owns Pi TypeScript typecheck/test dependencies.
- `@earendil-works/pi-coding-agent` is installed globally by pnpm. Its declared runtime dependencies, including `pi-ai`, `pi-agent-core`, `pi-tui`, and `typebox`, are linked into `pi/node_modules` by `scripts/pi-deps-link-setup`.
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

pnpm resolves the dependency graph declared by `pi-coding-agent`, uses a content-addressable global store, and provides the explicit build-script approval model satisfied by passing `--allow-build=koffi --allow-build=protobufjs` for the two native postinstall steps Pi requires. Bun previously allowed Pi runtime packages to drift independently and also failed on transitive AWS SDK packages on Windows.

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
pnpm --config.minimumReleaseAge=720 add -g \
    --allow-build=koffi --allow-build=protobufjs \
    @earendil-works/pi-coding-agent@latest
~/.dotfiles/scripts/pi-link-setup
~/.dotfiles/scripts/pi-deps-link-setup
```

---

## Profile-aware Brave control

Pi exposes `browser_session` and `browser_page` for local Brave automation. Isolated mode is the default and requires no machine-local configuration. Real-profile mode uses explicit aliases validated against Brave `Local State`; it never guesses `Default`, a focused tab, or a profile from its display name.

First-time real-profile setup:

1. Call `browser_session` with `action: "discover"`.
2. Match one candidate's profile directory and live display name to the intended Brave profile.
3. Run `/browser-setup` with one JSON object containing an alias, the exact `profileDirectory`, and `userDataDir` when more than one root must be distinguished.
4. Start `browser_session` in `real` mode with that alias, then separately verify the rendered website account.

Tracked files define an identity-free contract:

- `browser-profiles.schema.json` - local configuration schema
- `browser-profiles.example.json` - synthetic example
- `skills/browser-tools/SKILL.md` - operational and comparison rules

Machine-specific files are intentionally untracked:

- `~/.pi/agent/browser-profiles.json` - aliases and allowed profile intent
- `~/.pi/agent/browser/session.json` - atomic runtime ownership record

Discovery supports Brave stable roots on Windows, macOS, and Linux plus `BRAVE_USER_DATA_DIR`. Only one registered automation session may run. Page operations require the current session ID and exact raw CDP target IDs; closed or replaced targets are never substituted. A real-profile restart requires per-call authorization bound to the current process tuple. Pi shutdown cleans only an ownership-verified isolated browser and preserves real-profile browsers.

`browser_page` does not expose cookies, storage, arbitrary evaluation, passwords, tokens, or CAPTCHA interaction. Credential, CAPTCHA, unusual-traffic, and consent-interstitial detection blocks protected capture or mutation and invalidates the current comparison generation.

Run the sanitized Windows comparison-evidence check with:

```powershell
pwsh -File scripts/smoke-browser-control.ps1
```

The smoke script uses synthetic evidence by default. Pass `-EvidencePath` for an operator-observed transaction; account and CAPTCHA values must already be reduced to boolean match/invalidation status.

---

## Damage-control safety validation

Pi damage-control is Pi-only and lives in `pi/extensions/damage-control.ts` plus focused sibling modules for rule loading, pure engine decisions, and opt-in debug logging. The canonical command/path policy is `pi/damage-control-rules.yaml`, loaded through Pi's native policy schema. `PI_DAMAGE_CONTROL_POLICY_PATH` can select an explicit alternate Pi policy. A missing or invalid default or override fails closed.

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
`pi/lib/`, `pi/tests/`, `pi/settings.json`, retired prompt-routing research
code/docs/data/models that remain intentionally versioned, and lockfiles such
as `pi/prompt-routing/uv.lock`.

Do not delete or commit local runtime state unless a separate migration explicitly
approves it. Treat these as generated/local: `pi/history/`, `pi/sessions/`,
`pi/multi-team/sessions/`, all `*-expertise-log.jsonl` files and project-local directories under
`pi/multi-team/expertise/`, local indexes, caches, logs, virtualenvs, and
`node_modules/`. Expertise JSONL is the durable runtime source of truth, but it is
not curated repository source. Curated prompt-routing research data and models
may remain versioned; classify them deliberately rather than hiding broad
directories.

---

## Authentication

Sign in with a Claude Pro/Max subscription:

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
```

Ponytail-derived capability decisions and their canonical local owners are tracked in [`pi/docs/upstream/ponytail.md`](docs/upstream/ponytail.md). Run `just ponytail-upstream` to compare its reviewed commit with the current upstream default branch without changing local files.

Or invoke Pi directly:

```bash
pi
pi --no-extensions
pi -e ~/.dotfiles/pi/extensions/damage-control.ts
```

The Onclave extension uses the broker-backed adapter in `modules/onclave/extensions/onclave-pi/`. The adapter does not load in Pi subagents identified by `PI_SUBAGENT_RUN_ID` or `PI_SUBAGENT_TREE_RUN_ID`. Normal Pi processes need no Onclave-specific environment setup. The loader in `pi/extensions/onclave-pi.ts` contains no adapter implementation.

---

## Extensions

Repository-owned TypeScript extensions live in `~/.dotfiles/pi/extensions/`. See the upstream Pi extension documentation for loading and discovery behavior.

Extension-owned slash commands are TUI-only by default. `pi/lib/slash-command-echo.ts` adds a model-visible invocation only for commands explicitly included by their owner. Semantic workflows persist their bounded prompt or result through the owning extension instead of relying on a default raw invocation echo. Control-plane commands, diagnostics, configuration commands, and terminal or process launch commands such as `/branch`, `/new-instance`, and `/new-terminal` are not added to model context.

### `log-analytics-tool.ts`

`log_analytics` is the sole generic Pi JSONL analytics tool. `catalog` lists stable source IDs and same-named DuckDB views; `query` accepts `{ sources, sql, parameters, maxRows }` and passes documented DuckDB SQL to an invocation-local in-memory engine. Each selected view preserves the complete original JSON record in `record` and exposes `_source_file`, `_record_key`, and `_timestamp` plus typed convenience columns. For example: `SELECT _source_file, _record_key, record FROM session_entries WHERE _timestamp >= $start AND json_extract_string(record, '$.message') LIKE $needle ORDER BY _timestamp`. Use CTEs, JSON functions, date predicates, and ordinary DuckDB parameters; do not use filesystem functions or external table functions. Results stop incrementally at the row and encoded-byte bounds and report `truncated`; there is no persistent analytics database or refresh state.

Active readers use this direct query boundary or typed in-process APIs. `/find-fails`, `/usage`, `/extension-stats`, `/skill-stats`, `/orchestration-stats`, and workflow-friction diagnostics retain their owning command contracts. Correlation is exact or deterministic by default; unique inferred edges are disclosed, opt-in, and never decision authority. Canonical JSONL remains authoritative.

### `damage-control.ts`

Pi damage-control is a Pi-native safety extension with its own policy, parser, engine, status text, `/doctor`, and `/permissions` integration. It enforces Bash, managed background-terminal, PowerShell, file-path, semantic Git, Bash AST, sequence/taint, and post-tool secret-output rules through Pi extension hooks.

Intercepts tool calls and blocks dangerous operations before they execute.

- **Dangerous commands** -- blocks `rm -rf`, `git reset --hard`, `dd if=`, etc.
- **Safe-edit enforcement** -- structurally detects mutating Python heredocs, in-place `sed` or `perl`, and truncating `cat` redirection, then routes repository changes to Pi's safe file-edit tools. Blocks are recorded in damage-control decision and eval telemetry.
- **Repeated-tool circuit breaker** -- aborts the current agent run before a sixth identical tool call when the first five calls produced the same normalized result. It applies to failures, blocked calls, and successful no-op results, persists through automatic continuations, resets on direct user input or when the agent settles, and records `repeated_tool_loop` telemetry.
- **Scoped-delete containment** -- ask-tier `rm` commands are auto-allowed only when every statically extracted target stays under the session cwd or an approved scratch root. `safe_delete_paths` entries authorize static local targets at or below configured roots, including inside compound commands, while the remaining command is still analyzed. Parent traversal, home expansion, dynamic variables or substitution, non-scratch absolute paths, the cwd itself, `.git`, `.pi`, configured no-delete paths, parse failures, and remote SSH payloads still ask.
- **Symlink and glob containment** -- relative globs such as `build/*` are checked by prefix, and any existing target prefix that is a symlink falls back to confirmation.
- **Zero-access paths** -- blocks read/write to `~/.ssh/*`, `*.pem`, `*.key`, `.env`
- **No-delete paths** -- protects `package.json`, `Makefile`, `pyproject.toml`
- **Approval prompts** -- TUI confirmations show a theme-aware severity border and one of six bounded categories: local state, version control, sensitive data, infrastructure, system execution, or remote state. The matched rule reason is highlighted, `Allow once` is selected by default, and Escape still denies. Non-TUI confirmation retains a labeled plain-text fallback.
- **Prompt telemetry** -- every displayed approval records `prompt_shown` before rendering, with category and severity. The later approval or denial references that event through `promptId`; no-UI denials do not record a shown prompt.
- **Auto-allowed telemetry** -- auto-allowed scoped-delete decisions are logged as `auto_allowed` with `tier=scoped_delete`.
- **Shadow judge** -- enabled shadow judge runs are asynchronous, redacted, and context-limited. It can not authorize execution by itself and only provides agreement telemetry in `/damage-control judge` and `/dc judge`.
- **Future arming gate** -- shadow mode must collect at least 100 events, reach at least 95% agreement on approvals, and produce zero judge-allows on danger-shaped denials before any separate authority decision.

Policy file: `~/.dotfiles/pi/damage-control-rules.yaml`. Set `PI_DAMAGE_CONTROL_POLICY_PATH` only when an explicit alternate Pi policy is required.

The shadow judge is disabled by default. Enable it with `damageControl.judge.enabled: true` in Pi settings. Judge logs are persisted to `~/.pi/agent/operator/damage-control/judge.jsonl` and summarized by `/damage-control judge` and `/dc judge`. Inputs are redacted and limited to command, cwd, matched rule, and rule reason; verdicts never affect the tool decision.

### `agents-context.ts`

Extends Pi's native startup context with instructions discovered after successful `read`, `grep`, `find`, or `ls` access or when a mutating tool targets a path, including a path in another repository. It follows native Pi precedence within each directory, using `AGENTS.override.md` instead of `AGENTS.md` when the override exists, and keeps only the instructions applicable to the current target in one hidden report. Native `CLAUDE.md` fallback context is removed before model execution. Native and nested instructions are deduplicated by content, including hardlinks exposed through different paths. Reading an instruction file does not inject that same file as a second context copy. A mutation is deferred at most once while newly applicable instructions reach the model; automatic continuation preserves that delivery, while changed instruction content, direct user input, or a cwd/session change invalidates it.

### `background-terminal/`

Provides bounded process-local management for long-lived Bash commands through `bg_start` and `bg_kill`. `bg_start` passes through the same damage-control shell gate as `bash`; unmanaged shell background operators are rejected because the manager already runs commands asynchronously. Both model tools remain active from session start. The `/ps` dashboard provides operator inspection with live status and bounded output; background terminals do not render a separate status widget because the footer owns process activity status. Natural completion delivers one follow-up result without polling. Managed processes survive `/reload`, `/new`, `/resume`, and `/fork`, and a completion during replacement is delivered to the next active session. Output spills to private capped temporary logs. Pi process exit terminates remaining process trees and removes the logs. Use the scheduler rather than a background terminal for timers or polling waits.

### `copy-all.ts` and `summarize/`

`/copy-all [fallback-file]` copies user and assistant message text through Pi's cross-platform clipboard helper, reports message and byte counts, and writes only an explicitly named new fallback file when clipboard delivery fails.

`/summarize [focus]` remains an active-model workflow that produces a normal assistant response. The extension adds a bounded, redacted evidence packet with tool failures, shell exit codes, and head-tail session coverage while omitting thinking, images, previous recaps, and hidden workflow prompts. It does not run automatically or send content to a separate model or provider.

### `history.ts`

`/history` opens a TUI overlay containing only textual user prompts from the current active session branch. It keeps chronological order initially with the newest prompt selected. Use Up/Down or Page Up/Page Down to select, `/` to search, `v` or Space to inspect the full prompt, and `r` to reverse the list. Use `e` to replace the current editor text, `c` or `y` to copy the exact prompt and close, Enter or `b` to navigate the current session without summarizing, `f` to fork from the prompt, and Escape to clear active search before a later Escape cancels. The command has no global shortcut or numeric argument mode.

### `tool-visibility.ts` and `tool-search.ts`

Keeps workflow-state-gated tools out of the default provider schema until they are valid: commit execution, goal completion/progress, improvement decisions, plan archival, workflow-change tracking, and review-artifact writing. Their owning extensions activate them from deterministic command or prompt state. Current roots see the role-specific subagent tools permitted by their authority. Historical subagent names remain registered but hidden for resumed-session compatibility. General and specialized callable tools, including root-only Onclave, usage-report, web, PowerShell, and scheduler tools, remain active when their authority permits them.

`tool_search` remains active as a fallback and activates all matching inactive tools by default for a non-empty capability query, except hidden historical subagent names. Listing all tools without a query remains inspection-only. Metadata-only `toolset_exposure`, `tool_search_decision`, and `tool_use` metrics record the visible toolset, hashed searches, activation results, and later use without raw queries, arguments, descriptions, or output. The `tool_discovery_activity` DuckDB view exposes those events for local review.

### `active-turn-compaction.ts`

Compacts a tool-driven request before the active model reaches its hard context reserve, then continues from the saved summary. The extension also supports a soft limit through `activeTurnCompaction.softLimitTokens`. When `activeTurnCompaction.softLimitMaxContextWindowTokens` is set, that soft limit applies only to models whose reported context window is no larger than the configured maximum; larger-context models use their native hard reserve instead. The tracked settings use a 255,616-token soft limit for models with context windows up to 372,000 tokens, so 1M-context models do not compact at the smaller-model threshold. This is a local usage-conservation policy, not a claim about a provider's hard context window or subscription pricing. When Pi cannot find a valid compaction cut point, the extension leaves the active request running and retries only after later turns make compaction possible. Pi 0.84.4 may compact natively before the next assistant response; whichever path starts first remains authoritative. Native and extension threshold failures share the bounded failure circuit, while aborted compactions do not open it.

### `quality-gates.ts`

Collects files successfully changed by `write`, `edit`, `text_edit`, and `structured_edit`, preserving the cwd from each edit, then runs cheap file-scoped linters and format checks when the agent run ends. Validator output and aggregate messages are bounded, unchanged content is cached, and stale results are discarded.

Validators, Lizard thresholds, excluded paths, immutable paths, and the repair policy are configured in the Pi-owned `~/.dotfiles/pi/quality-gates.json`. Automatic settlement checks skip policy-marked explicit-only, project-scoped, long-running, and Lizard validators; those remain available to explicit validation callers. Validator pass, failure, autofix, unavailable, skipped, duration, notification, and repair outcomes are recorded in structured metrics.

Failures are resolved in three stages instead of being report-only:

1. **Deterministic autofix** -- validators with a configured `fix` command (ruff-format, gofmt, rustfmt, clang-format, stylua, zig-fmt) run the formatter directly, re-run the check, and report only what still fails. A context notice lists auto-fixed files because their on-disk content changed.
2. **Bounded repair turns** -- remaining non-advisory failures trigger a repair turn in the active session when the active model is an `openai-codex` subscription model. Any other active model (Bedrock fable, opus, sonnet, or Bedrock-hosted GPT) delegates the repair to a spawned child Pi run on the configured `repair.model` so metered models never pay for repairs. Attempts are capped by `repair.maxAttempts`, and an unchanged failure set stops retries immediately.
3. **Visible report** -- failures that survive autofix and repair (or that cannot be repaired) are reported without triggering a turn, matching the previous behavior.

Repositories or paths opt out of all mutation with the Git attribute `quality-autofix=off` in `.gitattributes` (for example `* quality-autofix=off` repo-wide); matching files keep report-only diagnostics. Removing the `repair` block from `quality-gates.json` disables repair turns globally while keeping deterministic autofix.

### `herdr-ui-prompt-state.ts`

Bridges Pi's `ui_prompt_start` and `ui_prompt_end` events into the existing Herdr blocked-state event bus. Herdr reports extension confirmations, selections, inputs, editors, and custom dialogs as waiting for the operator instead of active model work. The generated `herdr-agent-state.ts` remains unmodified.

### `session-hooks.ts`

Runs lifecycle actions at session boundaries. Model and thinking selections remain session-scoped across reload; Pi owns explicit persistence of changed defaults.

- **session_start** -- starts a bounded background `git fetch` preflight and notifies if the branch is behind remote without delaying session initialization
- **session_shutdown** -- archives the session conversation log to `~/.pi/agent/history/YYYY-MM-DD-<sessionId>.jsonl`

Pi session startup does not invoke Claude/menos hook scripts. Optional transcript initialization remains local and bounded by its settings.

### `workflow-commands.ts`

Registers shared skill-backed slash commands:

```
/commit        # smart git commit with LLM-adjudicated secret review
/plan-it       # write an executable plan in primary .specs/
/do-it         # execute one owned worktree with proportional validation
```

Stateful workflow templates are loaded from `~/.dotfiles/pi/skills/workflow/`. The extension-backed `/summarize [focus]` workflow adds bounded session evidence before requesting the recap. Prompt-only commands use Pi-native templates under `~/.dotfiles/pi/prompts/`:

```text
/gitlab-ticket [feature or change] # structured issue with optional branch and draft MR
```

Workflow highlights:
- `/plan-it` writes the canonical plan directly to primary `.specs/{meaningful-slug}/plan.md`, creates no worktree, includes correctness review, and ends with a subtractive overengineering/gold-plating/churn gate. `/plan-it quick [request]` retains the same plan and validation contract but skips both review phases for operator-selected small work sets. `/do-it` materializes that spec in its owned implementation worktree; ignored specs are never force-added and return to the primary local archive only after a successful merge.
- `/do-it` establishes ownership before raw work or canonical-plan execution, confines modifications to the owned worktree, and closes out by archiving artifacts, committing, merging `--no-ff` into the primary branch, verifying merged HEAD, and removing only its owned worktree and branch.
- `/commit` uses deterministic candidate extraction, isolated secret review, and ownership-aware commit planning. The slash workflow and structured commit tools share porcelain-v2 status, preflight, and exact-path staging primitives; each planning pass reuses one status snapshot. Before the parent commit, each dirty direct submodule must be on an attached branch with an upstream, is updated with a fast-forward-only pull, and runs the same commit workflow; `/commit push` pushes each resulting submodule commit before the parent, while `--no-submodules` leaves dirty submodule worktrees untouched. Nested submodules are not processed automatically. Ignored files are omitted. Paths with the repository-defined Git attribute `commit-secrets=allow` bypass secret review; all other paths retain the default blocking policy. Ambiguous cross-domain paths require an explicit user decision instead of becoming one broad commit.

### `loop.ts`

Runs one validated plan slice per resumable iteration. When the worktree is
dirty, `/loop start` runs the existing `/commit` workflow and launches only
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
failures, quiescence, or repeated iterations without a commit. A failed Pi
invocation is retried only when no modifying-capable tool started; otherwise the
job stops for reconciliation rather than replaying a partially modifying
attempt. An unattended goal also stops when correlated runtime evidence is
missing, so extension-load or truncated-log failures cannot authorize a retry.

### `goal.ts`

`/goal` is the outcome-oriented entrypoint. Foreground behavior remains the
same, while unattended mode owns the objective and uses the existing detached
`/loop` supervisor, linked plans, and durable root tasks:

```text
/goal <objective-or-workspace-file>
/goal --unattended <objective-or-workspace-file>
/goal status
/goal stop
/goal resume
```

Ordinary foreground `/goal <objective>` works directly and interactively in
the active session. It does not create a canonical plan, durable task graph,
detached loop, or archive-and-commit closeout by default. A foreground goal
uses a reviewed plan only when the operator explicitly supplies one or material
risk or unresolved ambiguity makes one necessary; any resulting plan and
mapping state remains in the Pi session. Unattended mode always creates or
attaches exactly one reviewed canonical plan, parses unique task keys and
`Depends on` edges, rejects invalid graphs, and materializes the durable
root-task graph before modifying work begins. Each unattended task is stamped
with the goal ID, canonical plan path, objective hash, and plan task key so an
interrupted partial batch can be reconciled without replacing stable links.
Unattended mode prepares the normal clean `/commit` baseline, records the
objective source and hash in the loop job, and exits the interactive Pi process
after launching the supervisor. One non-completed unattended goal may own a
workspace. `/goal status`, `/goal stop`, and `/goal resume` select it by
canonical workspace, so ordinary use never requires a loop ID or plan path.
`/loop` remains the diagnostic surface.

The public states are `running`, `waiting_for_operator`, `completed`, `stopped`,
and `failed`. The task registry is authoritative for dependency readiness;
child-owned task records are rejected and leaf work and retries remain
transient. A blocked task does not block independent ready tasks.
Ask-tier damage-control decisions in print mode return a structured
`needs_approval` result and block only the active root task.
The same denied action cannot restart unattended; at most one materially
different safer strategy may run. Hard blocks remain non-grantable.

`error`, `inconclusive`, schema-invalid output, verifier contradiction,
`not_found`, and infrastructure failure immediately suspend the affected
ordinary attempt and require persisted re-evaluation. At most two recovery
attempts may run, and each must change a deterministic strategy component. If
both fail, only that item waits with reason `recovery_exhausted`. Other terminal
waits record one of `operator_decision`, `access_or_credential`,
`external_dependency`, `safety_boundary`, or `objective_conflict`, together
with bounded evidence and the required operator action. Capability rejection
and damage-control denial may use only an authorized alternative and are never
bypassed. Cancellation and the repeated identical tool-result circuit breaker
remain independent and unchanged.

`/goal resume` verifies the objective hash, plans, task state, and worktree. It
never replays an interrupted modifying attempt. An attempt owned by an earlier
Pi process instance cannot authorize a modifying tool. A dirty interrupted
worktree stays
`waiting_for_operator`; a clean interrupted root task is blocked for explicit
reconciliation and a materially different replacement strategy while
independent work may continue. Resume is also an explicit
operator continuation for an item that exhausted both recovery attempts: the
item returns to required re-evaluation, while unresolved permission-decision
blockers remain blocked and are never replayed automatically.

For an unattended goal, `goal_complete` keeps the goal active unless every
required plan item has a required durable root task and both are complete, the
latest relevant validation evidence comes from an observed successful shell
result after task completion, and recorded artifacts match the final Git diff.
Successful closeout archives the canonical spec directory in the owned
workflow worktree, commits all in-scope artifacts, merges the workflow branch
with `--no-ff` into the currently checked-out clean primary branch, verifies merged HEAD,
and removes only the owned worktree and branch before completion clears active
state. Legacy `archived_pending_commit` jobs remain resumable for recovery. Its report names the
objective, completed work, artifacts, validation, repository state, gaps, and
exact next action. Ordinary foreground completion remains session-owned but
uses the same owned-worktree commit, merge, verification, and cleanup boundary;
plan-backed foreground goals also archive their canonical spec before merging.

Unattended goal identity, recovery state, validation evidence, and completion
state persist in the loop job under the normal loop state root. Continued Pi
sessions remain process/session files owned by `/loop`; live child trees and
in-memory subagent workflow results remain process-local and are not recovered
after a Pi process failure.

### `scheduler.ts`

Provides process-local one-shot and recurring prompt scheduling. Jobs survive
`/reload`, `/new`, `/resume`, and `/fork` within the current Pi process, then
stop when that process exits. Schedule controls when Pi receives a prompt; it
does not store todo state, dependencies, or process lifecycle. If a job becomes
due during session replacement, it is delivered to the next active session.
Recurring jobs keep at most one prompt pending until the agent settles.

```text
/at 15m -- Recheck the deployment status
/at 2026-07-18T09:00:00-04:00 -- Continue the release checklist
/cron "0 9 * * 1-5" --tz America/New_York -- Review open tasks
/schedule list
/schedule cancel <id>
```

Cron expressions use five fields. Scheduled prompts cannot start with `/`, so
slash workflows do not run unattended. The model-callable `schedule` tool can
create, list, and cancel the same jobs. Creation and cancellation do not use a
confirmation dialog. A direct request authorizes creation; an explicit request
or an existing schedule's completion condition authorizes cancellation. Missing
required values may still require a non-confirmation clarification. Every
successful scheduling action reports the next active run in a human-readable
`Next scheduled run:` line, using an explicit schedule timezone when present
and the process-local timezone otherwise. Scheduling actions do not inherently
end the model turn. When a scheduled follow-up is the intended next step and no
useful work remains before it runs, the model ends the turn so the follow-up can
be delivered when due; otherwise it continues useful work. While any schedule
exists, the footer shows the earliest next run as `sched@ 9:32am` immediately
after Onclave; the segment disappears when no schedule remains. Schedule
lifecycle metrics contain job IDs and timing metadata, not prompt text.

### `workflow-friction-review.ts`

Measures each interaction from submission through `agent_settled` and records metadata-only denominator metrics for every interaction. It silently queues selected interactions for a bounded background review: explicit remember requests, corrections after an existing conversation turn, every interaction over 10 minutes, every subagent run lasting at least 2 minutes, high-confidence triggered interactions from 2 through 10 minutes, and a deterministic 15 percent control sample from the remaining 2-to-10-minute interactions. Subagent records include the durable run ID and spawn time for correlation with operator tasks. Review jobs run one at a time from a persistent local queue and never delay the original interaction.

Runtime records live under `~/.pi/agent/workflow-friction/` and remain uncommitted. `interactions.jsonl` contains timing, mode, selection, tool, validation, subagent, and mutation counts without prompt or response content. Reviewed interaction packets remain local in `reviews.jsonl`. Set `PI_WORKFLOW_FRICTION_DIR` to use a separate local directory. At interaction settlement, the extension also emits a metadata-only `orchestration_interaction` metrics event for direct and delegated interactions.

Interaction capture and background review are internal stages. `/usage`, `/usage-stats`, `/extension-stats`, `/skill-stats`, and `/orchestration-stats` remain read-only diagnostics. `/usage-stats` renders its deterministic report without starting a provider turn.

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
- Estimates per-component buckets for rendered system-prompt sections, active provider-visible tool descriptions and parameter schemas, user messages, assistant text/thinking, tool calls, tool results, bash output, provider-visible injected context, and summaries. Prompt buckets include their rendered wrappers, paths, skill locations, and built-in guidance instead of assigning that overhead to a generic base-prompt remainder.
- Shows cumulative session token spend, cache reads/writes, cost, component breakdown, per-tool schema weight, per-context-file content and wrapper estimates, aggregate skill name/description/location/wrapper estimates, and injected context grouped by custom message type.
- Reconciles Pi's provider-based context estimate with the character-based component estimate and reports the unattributed remainder or component overage explicitly.
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
- No provider: refreshes all currently authenticated supported providers, including AWS Bedrock through its provider-scoped credentials.
- Provider argument: refreshes only that provider (currently `amazon-bedrock`, `anthropic`, `openai-codex`, `openrouter`, `opencode`, and `opencode-go`).
- Unsupported providers are skipped with a warning.
- Uses existing session credentials and updates in-session model availability immediately. Bedrock discovery also updates `bedrockRefresh.models` with the latest supported `us.*` Claude family IDs.
- Prints per-provider diffs with model IDs that were added/removed.
- Caches versioned provider catalog facts rather than complete Pi model definitions.
- On startup, preserves current Pi metadata for built-in Codex models, overlays context windows from versioned refresh responses, and restores cached model discoveries that Pi does not yet know. Legacy caches cannot override known model metadata.
- Newly released Codex models may appear through `/refresh-models openai-codex` before they are added to the tracked startup `enabledModels` list.

### `model-visibility.ts`

Applies startup model-list cleanup for noisy provider catalogs.

Behavior:
- Hides date/version-suffixed and preview snapshot models for `openai-codex`, `opencode`, `opencode-go`, and `openrouter`.
- Limits the built-in Amazon Bedrock provider to configured `us.anthropic` Claude models; the curated `bedrock-mantle` provider selects current Claude and GPT models and resolves their Mantle or Runtime transport.
- Applies provider-specific blocklists (including internal/legacy model IDs) before `/model` selection.

### Operator Layer

Three companion extensions surface durable task and permission state for
long-running work. The registries in `pi/lib/task-registry.ts` and
`pi/lib/permission-registry.ts` are the canonical owners of `TaskRecordV1`
and `PermissionDecision`. Only the `task` surface creates durable task
records; `subagent` may correlate a child process with an existing assigned task but
never creates or mutates the task record.

Task storage is the process-shared SQLite database
`~/.pi/agent/operator/tasks.sqlite3`. Permission decisions retain their
separate registry under `~/.pi/agent/operator/permissions/`. Override the
operator root with `PI_OPERATOR_DIR` (used by tests). See
[`pi/docs/goal-execution-domain.md`](docs/goal-execution-domain.md) for the
Goal Execution model, ordering, migration, and rollback contract.

All child Pi processes register with the bounded process-local manager in
`pi/extensions/subagent/run-manager.ts`. `/subagents` presents those transient
runs and can cancel active child processes without treating its TUI state as
lifecycle authority. The task registry separately stores durable todo,
dependency, scope, and lifecycle state; it does not execute or manage child
processes. Damage-control continues to write permission decisions defensively
so registry I/O failure never breaks the protected producer flow.

#### `operator-status.ts`

Adds two status bar slots and the `/doctor` command.

Slots:
- `pi` -- always shown, format `pi vX.Y.Z`
- `task` -- shown only when non-terminal tasks exist, format `task N (M blocked, K failed)`
Healthy default keeps the bar quiet (no `OK` token, no zero counters). Slots
populate at `session_start` and refresh after every `tool_result`.

The custom footer renders directory, branch, model, reasoning level, context
usage, Pi version, and provider quota on the first line. Context usage is a
separate pipe-delimited segment after the reasoning level. Onclave and other
extension statuses render on the left of the second line, followed by token
throughput. Subagent status shows only running and unacknowledged failed counts;
successful and cancelled history remains in `/subagents`, and existing failures clear
when the next interactive user turn starts. At narrow widths, actionable reload,
failure, context-pressure, and quota feedback takes precedence over identity details.
Onclave renders `Onclave[N]: <client>`, coloring the client green only while
connected and red otherwise. An active schedule renders its earliest next run
immediately after Onclave as `sched@ 9:32am`; no schedule renders no segment.
The default client identity uses the compact
`pi-<12-character-session-prefix>` format, remains stable per Pi session, and
the peer count excludes the current session. Compact Bedrock spend remains
right-aligned as the final second-line segment.

Commands:
- `/doctor` -- compact health summary
- `/doctor --verbose` -- multi-line diagnostic (pi version, registry health, cwd, platform, task counts, permission counts)
- `/doctor --json` -- machine-readable structured output

#### `tasks.ts`

Operator surface for the durable task registry.

Commands:
- `/tasks` -- active tasks assigned to the current Pi session and repository workspace, urgency-grouped as blocked > failed > running > pending, with compact rows containing short id + summary + relative time + retry count. `/tasks list --all` forces the full view and includes other sessions plus unscoped, terminal, tombstoned, and foreign-workspace history.
- `/tasks <id-prefix>` -- detail view (id, state, summary, scope, dependencies, notes, timestamps, retries, and legacy metadata when present). Prefix matching needs >=4 chars and rejects ambiguous matches
- `/tasks cancel <id>` -- transitions `running`/`blocked`/`pending` -> `cancelled`; preserves the final summary
- `/tasks retry <id>` -- transitions `failed` -> `running`; the registry bumps `retryCount` and clears `errorReason`. Does not re-execute the work; you re-issue the original action through normal channels.

Model-callable task surface:
- The unified `task` tool owns durable Goal Execution state through `create`, `batch`, `update`, `remove`, `list`, `ready`, and `get`. A Task requires only `summary`. Ordinary short workflows can remain prose; durable records are useful for requested todo lists, Dependency Graphs, and work that may span context compaction.
- A graph-aware `batch` creates 1 through 16 Tasks with request-local keys and dependency keys. Batch publication is atomic: a failed batch persists no generated IDs. Current tool schemas are action-specific and reject unrelated fields, while resumed legacy execution fields retain explicit retirement diagnostics.
- Tasks are tagged with the creating Pi session and current repository workspace. Optional `goalId` associates a Task with a Goal. Optional `produces`, `consumes`, and numeric `priority` refine only `ready` ordering; metadata never creates a Dependency or changes readiness.
- `list` excludes other sessions plus unscoped, terminal, and foreign-workspace records unless `all: true` requests a global view; tombstones remain excluded. Its newest-created-first order is unchanged. `ready` applies the same boundary and returns only pending Tasks with no incomplete hard Dependencies, ordered by priority, exact case-sensitive producer relationship, incomplete direct-dependent count, creation time, and Task ID.
- The parent selects ready work, marks it `running`, passes its `taskId` when executing through `subagent` (or uses `bg_start` without linkage), validates the result, and then records the terminal state. Task never starts, waits for, stops, schedules, or captures output from those processes. Timed prompts belong to the separate `schedule` tool.
- Optional worktree-relative `scope` paths or globs describe Task boundaries for coordination. `blockedBy` is the only persisted authority creating a hard Dependency; create, update, and batch reject missing, tombstoned, duplicate, cyclic, or foreign-workspace Dependencies. Reverse `blocks` detail is derived from current records rather than persisted as a second edge direction.
- Task records and dependency edges are committed atomically in SQLite. Separate Pi processes observe committed state directly without a process cache. Legacy JSON import and rollback export require the quiescent migration workflow documented in [`pi/docs/goal-execution-domain.md`](docs/goal-execution-domain.md).
- Legacy `.pi/todo.json` entries are imported once per workspace. Startup cleanup removes pre-session, imported legacy, and retired execution-era records unless an active durable Dependency still references them, plus terminal Task graphs with no active dependents. Failed and other non-terminal session-owned records remain available only to their owning session or an explicit global view until updated or removed. Isolated tests may set `PI_LEGACY_TODO_SOURCE_DIR` to an empty native directory while preserving the tested workspace identity.

Lifecycle (defined in `pi/lib/operator-state.ts`):
```
pending  -> running, cancelled, failed, skipped
running  -> blocked, completed, failed, cancelled
blocked  -> running, failed, cancelled, skipped
failed   -> running, skipped     (running is retry)
completed, cancelled, skipped = terminal
```

#### `permissions.ts`

Operator surface for the permission registry.

Commands:
- `/permissions` -- summary (last 20 allow/deny decisions)
- `/permissions allows` / `/permissions denies` -- filtered views
- `/permissions retry <id>` -- replay attempt for a denied decision when a `replayPayload` was captured. Records the replay as a new `manual_once` decision linking back to the original via `metadata.replayOf`. Does not re-issue the underlying tool call -- replay through normal channels.

Decision provenance categories: `rule` (config-driven, what damage-control
emits today), `manual_once` (user one-shot approval/denial via `/permissions
retry` or interactive confirm), `session` (session-scoped decision),
`unknown` (uninstrumented paths).

## Prompt-routing research artifacts

The retired prompt-routing experiment remains under `pi/prompt-routing/` for
reproducibility. Its curated datasets, model artifacts, evaluation code, and
research reports are not loaded by Pi and do not affect model or thinking-level
selection. See `pi/prompt-routing/AGENTS.md` before changing those artifacts.

---

## Agent Architecture

Work directly on one coherent task. Delegate when independent work, specialized capability, verification independence, or context isolation provides a concrete benefit. Explicit user routing overrides remain authoritative.

Repository-owned worker definitions live in `pi/agents/`; loading and precedence are implemented by `pi/extensions/subagent/agents.ts`.

### Role topology and scheduling

The process tree is `root -> Team Lead -> subagent`. A root may start a Team Lead or a subagent. A Team Lead may start subagents only. Subagents and depth-two children cannot invoke delegation or workflow tools. The root-owned cross-process scheduler runs eight active descendants by default and queues excess work. `PI_SUBAGENT_MAX_ACTIVE_DESCENDANTS` may set a ceiling from 1 through 16. Broker request and response frames are bounded; aborted, prematurely closed, or stalled transport settles before capacity is released.

Every child role shares the 64-turn ceiling, including a structured-output correction. When turn 64 requests more tool work, the child stops after that turn and returns a budget-limited partial result. Read-only subagents have an eight-minute wall-clock limit; modifying subagents have no wall-clock hard timeout.

Cancellation is recursive: cancelling a Team Lead process or workflow cancels its queued and active descendants. `/subagents` shows bounded process-local tree detail and can cancel a selected tree. Bounded run history, transcript output, workflow state, and settled workflow results survive `/reload`, `/new`, `/resume`, and `/fork` only within the same Pi process; they are discarded when that process exits.

### Callable subagent behavior

Current calls use `subagent_read`, `subagent_write`, or `subagent_teamlead`. Read subagents receive a closed positive read-tool allowlist with no raw shell. Write subagents retain configured mutation tools. Team Leads receive explicit subagent, turn, and soft-deadline budgets and return bounded partial results when a budget settles the run. All three interfaces accept `instructions`, `boundaryPaths`, `boundary`, and an `enforcedBoundary`; only a root may widen beyond its inherited boundary. Advisory paths are markers, and overlap is visible but never rejected.

The `enforcedBoundary` is applied to governed native file tools and recognized recursive `rg`, `grep`, and `find` commands after canonical and nearest-existing-ancestor checks. Static `cd` targets are checked; dynamic or filesystem-root recursive targets reject. It is not a general sandbox for arbitrary programs launched through shell commands.

`subagent_status` accepts an orchestration ID to group children or an exact process ID to inspect PID, liveness, observable activity, active tools, duration, output age, usage, and a ping-backed watchdog classification. Models must not poll status for work progress; they wait for pushed completion, timeout, or watchdog events and use status only for exceptional diagnosis. `subagent_control` can target an authorized exact process or tree. A stalled-tool interruption settles the child process tree and resumes its persisted session with an explicit warning that the interrupted tool result, side effects, and unpersisted output are unknown. Historical `subagent` and `subagent_continue` calls remain executable through one hidden compatibility adapter for resumed sessions.

Every provider-visible foreground result is bounded to 50 KB or 2000 lines. Complete truncated output is saved to a runtime-generated private artifact while internal handoff retains complete content. Callable output selection enables or disables those generated artifacts; caller-selected string paths remain only as resumed/direct compatibility input and are not advertised in current schemas.

New work uses the role-specific interfaces. Advisory path markers do not grant mutation authority and need not be disjoint.

Agent fields enumerate the current trust-aware catalog for each registered subagent tool: user agents are always listed and project-agent names appear only after project trust is validated. To invoke a trusted project agent, set `agentScope` to `project` or `both` and provide its project-local name. A cwd or trust change rebuilds the catalog rather than falling back to raw project discovery; `/reload` also refreshes it. Every invocation validates all requested agents against `agentScope` before any worker starts or a background run is acknowledged.

A root owns durable task creation, state transitions, validation, and closure. Each current subagent item may carry an existing assigned task ID for correlation. If exactly one eligible assigned root task exists in the effective workspace, the runtime may link it unambiguously; invalid or ambiguous links return bounded choices. Children never create or transition task records. Disposable delegation remains task-free.

### Agent configuration

The agent parser consumes these frontmatter fields:

- Required: `name`, `description`
- Enforced by the subagent launcher: `tools`, `model`, `effort`, `skills`

The parser applies no default frontmatter values. Frontmatter `effort` is passed
to child Pi as `--thinking`; an explicit per-launch `effort` override takes
precedence in single, parallel, and chain modes. Child skill discovery is
disabled with `--no-skills`; each
`skills` entry is resolved to an explicit skill file and passed with `--skill`.
Skill entries may be discovered skill names or paths relative to the agent file.
Missing skills fail the launch explicitly. `tools` is a tool-name allowlist, not
a general process sandbox. Workspace policy constrains governed native file tools
and recognized recursive searches; advisory work markers in a prompt or request
do not grant authority. Unknown fields are not execution contracts.

Agent config recovery: if a bad worker definition prevents normal coordination, start Pi
with `pi --no-extensions`, repair the affected file under `pi/agents/`, run
`cd pi && pnpm test subagent.test.ts`, and restart Pi normally.

### Expertise storage and retrieval

Expertise JSONL under `pi/multi-team/expertise/` is the durable runtime source
of truth. Derived indexes are disposable. The legacy mental-model snapshots are
retired, and no active Pi extension registers `read_expertise` or
`append_expertise`. Put durable instructions in `AGENTS.md` or skills instead.

Current paths, retrieval behavior, safety, and canonical tests are documented in
[`pi/docs/expertise-layering.md`](docs/expertise-layering.md).

---

## Skills

Shared skill packages are referenced under `~/.dotfiles/pi/skills/shared/` without duplicating their source. No community skill packages are currently installed.

Loading and invocation behavior is documented by upstream Pi.

---

## Sidecar Trace

Pi can record a high-fidelity, append-only sidecar trace of every session alongside (not inside) the normal session JSONL. This is an opt-in observability feature -- it is **default off** and must be explicitly enabled by the user.

### Scope

The sidecar trace captures:

- Exact provider request payloads sent before each LLM call (`llm_request` events).
- Assistant message content returned at turn end, including **visible thinking** blocks that the model exposes (`assistant_message`, one record per turn at `message_end` -- never one per streaming token).
- Tool-call inputs and outputs as Pi received them, including truncation metadata and a `full_output_path` reference when output is spilled to disk (`tool_call`, `tool_result`).
- Model-selection changes (`model_select`).
- Session lifecycle (`session_start`, `session_shutdown`).
- Nested subagent events correlated to their parent via `parent_trace_id` (W3C Trace Context `TRACEPARENT` propagation).

**Hidden chain-of-thought is explicitly excluded.** Provider-internal reasoning that is not surfaced in the API response is never captured, regardless of whether a future provider exposes it. Only visible thinking blocks returned in the message content are persisted.

### Storage

Trace files are written to `~/.pi/agent/traces/<session-id>.jsonl` by default -- outside the repo and outside any synced project tree. The directory is created with mode 0700; each trace file is written with mode 0600 on Linux/WSL (Windows relies on user-profile ACL). New schema 1.1 records include a unique top-level `event_id`; schema 1.0 records without it remain readable.

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
| `session_compact` | `session_compact` | Records successful compaction metadata without summary content |
| `session_compact_failed` | `session_compact_failed` | Records failed or aborted compaction metadata without summary content |
| `tool_call` (in `transcript-tools.ts`) | `tool_call` | Cloned + redacted parameters |
| `tool_execution_start` | `tool_execution_start` | Records start time for duration computation |
| `tool_execution_end` | `tool_execution_end` | Carries `duration_ms` and `is_error` |
| `tool_result` | `tool_result` | Content, details, error state, truncation metadata |
| `session_shutdown` | `session_shutdown` | Final event before archival |

### Streaming discipline

Pi fires `message_update` per token during assistant message streaming. The transcript extension intentionally does NOT emit a record per token -- doing so would explode trace size on long responses. Instead:

- `message_update` is registered as a no-op hook.
- `message_end` emits exactly ONE `assistant_message` record with the final aggregated content, OTel usage attributes (`gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`), and `stop_reason`.
- A per-turn dedupe flag guards against duplicate emission when Pi fires `message_end` for tool-result messages in the same turn.

An optional `assistant_streaming` heartbeat (one record per N seconds during long generations) is documented in the schema but disabled by default.

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
| `~/.dotfiles/pi/AGENTS.md` | Canonical Pi global instructions |
| `~/.dotfiles/pi/damage-control-rules.yaml` | Pi damage-control safety policy |
| `~/.dotfiles/pi/quality-gates.json` | Pi lint and complexity validator policy |

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
