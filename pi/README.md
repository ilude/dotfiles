# Pi Profiles

`pp` launches Pi with an isolated profile directory. New and resumed default-profile sessions record that active profile once as a metadata-only `session-profile` custom entry in the session JSONL; it is excluded from model context.

- `pp` uses `pi/profiles/default/`.
- `pp -p legacy` uses `pi/profiles/legacy/`, which contains the previous customized Pi setup and its local runtime state.
- `pp -p <name> --resume <session-id-or-path>` resumes a saved session in that profile.
- Other named profiles use `~/.pi/profiles/<name>/`.

## Documentation ownership

This file owns cross-profile launcher and directory guidance. Customized legacy runtime documentation lives in [`profiles/legacy/docs/README.md`](profiles/legacy/docs/README.md), with the full setup guide in [`profiles/legacy/README.md`](profiles/legacy/README.md). Those documents do not describe the default profile. Keep new profile-specific documentation with its owning profile rather than recreating a shared `pi/docs/` tree.

## Default profile implementation ownership

Default customization uses native `getAgentDir()` for active-profile paths and `profiles/default/lib/profile.ts` for profile labels. Model catalog requests, cache persistence, reconciliation and compatibility conversion live under `profiles/default/lib/models/`; the refresh extension coordinates command output and settings updates. Context analysis and report formatting live in `lib/context-analysis.ts` and `lib/context-report.ts`, with Pi state collection in the command extension.

`extensions/profile-reload.ts` owns reload polling independently of the footer. It publishes state and answers snapshot requests over Pi's shared event bus; the footer and `/clear` never rely on shared imported singleton identity. Each extension gets a separate loader. The monitor baseline belongs to the evaluated owner factory: same-cwd session replacements that reuse cached factories retain it, while actual resource reload reevaluates source and establishes a new baseline. Timers and subscriptions are session-owned and cleaned up on shutdown. `lib/model-runtime.ts` shares profile-local runtime creation configuration for web screening and commit review, but each feature retains its own runtime lifetime, cancellation and permissions. These modules belong to the default profile, not a cross-profile framework.

## Default profile process review

Use `/skill:agent-process` after reload to capture or review operator feedback, workflow failures, and agent-instruction refinements. The [skill](profiles/default/skills/agent-process/SKILL.md) maintains separate [instruction feedback](profiles/default/skills/agent-process/references/instruction-feedback.md) and [failure](profiles/default/skills/agent-process/references/failure-log.md) logs. Instruction changes require operator approval; review is on demand, not automatic.

## Default profile planning

Use `/skill:planning` after reload to create, review, resume, or close a plan. The [skill](profiles/default/skills/planning/SKILL.md) uses repository-local `.specs/<stub>/plan.md` files with ordered checkboxes, fresh-context inputs, explicit decisions, bounded checks, and relevant planning/execution Pi profiles. Consequential uncertainties receive focused questions and recommendations, with bounded factual investigation where useful. Execution uses dedicated task worktrees and branches; completed work and its dated `.specs/archive/<stub>/` plan merge together into recorded targets. Incomplete implementation stays active; blocked integration is reported separately. Execution authorization includes local task commits and merge unless explicitly restricted. Planning alone grants no execution permission; deployment and push remain separately authorized. This is an on-demand instruction workflow, not an automatic archiver or worktree manager.

The [web-fetch gateway plan](../.specs/web-fetch-gateway/plan.md) records implemented acquisition, SQLite routing and default Pi circuit/curl recovery. Deployment is paused. Extra launcher and archive-publication machinery were removed; paywall and archive retrieval remain excluded.

## Default profile safety port

Damage Control is enabled for normal default-profile `pp` launches. Use `/reload` to load it into an existing session. Legacy policy is the baseline, with contextual Luna review for selected Compose, Kubernetes/Helm, database, and process operations in established local development environments. Bounded direct input and untrusted tool observations inform review; no mandatory environment scans or approval cache are added. Luna cannot waive remaining user-only or block rules. Known read-only scheduler queries pass directly. `/dc on`, `/dc off`, and `/dc mode default|noshell` provide the legacy session controls; there is no status command. The explicit `pp --dc-recovery` maintenance path remains available. `/commit` internals and direct operator shell commands remain exempt. See [setup and behavior](profiles/default/docs/damage-control-setup.md) and the [completed restoration plan](../.specs/archive/damage-control-provenance-audit/plan.md).

## Default profile footer

The operator footer shows repository, model, context, and provider usage. `[reload]` indicates changed resource files since startup or reload. It checks the active profile's resources, trusted project resources, literal configured paths, and loaded command/tool/theme source paths every two seconds. It excludes credentials, sessions, generated model catalogs, and usage ledgers. Monitoring failures display `[reload check failed]`; package glob additions and arbitrary imported dependencies are not comprehensively discovered. Use `/reload` to load changes and reset the baseline.

## Default profile usage and context reports

Codex subscription usage is shown in the transcript on Pi startup and after `/new` or `/clear`. `/usage` refreshes it on demand. Reports include quota windows and local reset times, credits and reported additional limits except GPT-5.3-Codex-Spark, the OpenAI usage-page link, and the recent prompt cache-read percentage. Quota failures retain the link and show unavailable, not zero. The footer refreshes quota every five minutes, marking last-known values stale on failure. An immediate reload after `/clear` completes a pending report without duplicating a completed one. Reports are display-only custom entries, never model context.

Cache statistics cover the last 100 observed Codex assistant responses in the active profile, across sessions. Cache-read share is `cacheRead / (input + cacheRead)` over responses with both counts available; the report also shows observation coverage and model request mix. Only model names and those counts are appended to the gitignored `codex-cache.jsonl`; reads are bounded to its last 128 KiB. The log is append-only and may be deleted to reset history. Legacy history is not imported. No request-shape diagnostics, `/cache-doctor`, orchestration telemetry, or hidden session datetime injection is included.

Footer line 2 shows live output throughput, first-token latency, token count and streaming duration alongside scheduler and Bedrock status. Live character-based estimates use `~`; final throughput uses provider output counts and excludes tool execution and first-token waiting. Latency is measured from Pi's assistant-message start to its first nonempty output delta (including thinking/tool arguments), not from an independently observed HTTP send. Final values remain visible and restore on reload/resume; new sessions clear them. At narrow widths scheduler then timing take priority, with Bedrock shown at the right when space permits.

`/context` shows estimated prompt components, tool schemas, context files, skills, messages, thinking, tool results, summaries, cache usage and session spend. It uses Pi's compaction-aware active entries and separates component estimates from provider-backed context totals. These are not exact tokenizer measurements or an inspection of the final provider payload. `/context widget` shows a snapshot above the editor; `/context hide` and `/context clear` remove it without clearing the conversation.

## Default profile model catalogs

`/refresh-models [provider]` refreshes model availability for configured Anthropic, OpenAI Codex, OpenRouter, OpenCode, OpenCode Go, and Bedrock providers without repeating `/login`. With no provider it refreshes every configured supported provider and isolates per-provider failures. Non-Bedrock providers use their authenticated catalog endpoints; Bedrock delegates to the default profile's native `bedrock-mantle` refresh. Refreshed non-Bedrock catalogs are restored from the gitignored `model-cache/refresh-models/` directory, and changed catalogs or curated scope trigger a resource reload.

At startup, the default profile hides the same obsolete, preview, snapshot, unsupported, and noisy models as the legacy profile for Codex, OpenRouter, OpenCode, OpenCode Go, and native Amazon Bedrock. Refresh also rewrites `enabledModels` in curated provider order while preserving unrelated settings. Generated catalogs contain model metadata, not credentials or authorization headers. Use `/reload` after changing the extension or policy source itself. Focused offline validation from `pi/profiles/default/` is `pnpm test model-visibility.test.ts refresh-models.test.ts && node scripts/model-catalog-smoke.mjs`.

## Default profile Amazon Bedrock

The default profile owns one curated `bedrock-mantle` provider while leaving Pi's native `amazon-bedrock` provider available. Authentication is provider-scoped under `/login`; Mantle and Runtime regions remain independent. `/bedrock` inspects routes and local estimates, `/bedrock refresh` refreshes only this provider, and `/refresh-models` delegates Bedrock discovery to that same native refresh path. `/usage` includes month-to-date model/token estimates with explicit unpriced coverage. The footer consumes the same ledger and no longer writes a separate total. See [setup, routing, accounting, and rollback](profiles/default/docs/bedrock.md).

Focused checks from `pi/profiles/default/`:

```sh
pnpm test usage-context-tps.test.ts scheduler-footer.test.ts
pnpm exec tsc --noEmit -p tests/tsconfig.usage.json
node scripts/usage-smoke.mjs
```

The smoke check uses the installed Pi loader offline with an empty temporary profile. It does not verify live subscription credentials or the private OpenAI endpoint.

## Default profile scheduling

The agent-facing `schedule` tool provides one-shot `create_at`, `list`, and `cancel` actions for user-requested reminders or tasks that genuinely depend on a known future wall-clock time. It must not be used to continue implementation, advance a plan, extend a turn, wait for normal tool or agent work, or compensate for stopping early. Before creating a job, the agent lists existing jobs and avoids duplicate or overlapping reminders. Use a positive duration (`30s`, `15m`, `2h`, `1d`) or a future ISO timestamp; timestamps without an offset use local time. There are no scheduling slash commands, recurring jobs, persistence, metrics, or extra dependencies. To change a schedule, cancel it and create another.

Schedules live only in the current Pi process. They survive `/new`, `/resume`, `/fork`, and `/reload`, delivering into whichever conversation is active, not necessarily the originating project. At the due time, Pi receives a follow-up prompt: idle agents start a turn; busy agents finish their current work first. Closing Pi discards all schedules, and timers do not keep a noninteractive process alive. Prompts due during session replacement are handed off after rebinding. Cancelling works only before handoff; prompts already in Pi's queue cannot be recalled by this tool.

The footer shows only the next injection time (`sched@ 9:00am`, local time), clearing when none remains. It does not show pending states or errors. Synchronous handoff failures remain inspectable through `list`, with no automatic retries or injected error prompts; cancel and reschedule them. Limits remain 64 outstanding schedules and 4,000 characters per prompt; slash-command prompts are rejected. Use `/reload` to activate the tool.

## Default profile log analytics

The default profile provides deferred `log_analytics` for existing sessions and usage records. Activate it through `tool_search` with `session analytics`, inspect `catalog`, then use metadata-only `sessions` discovery or bounded DuckDB `query`. Searches default to the active registered profile; select `profiles: ["legacy"]` or `["default", "legacy"]` explicitly. Exact session references reduce staging. Event-time SQL filters still scan the selected files so old resumed sessions are not missed.

The port preserves invocation-local DuckDB, serialized staging, input/deadline/thread/memory limits, and incremental bounded output. It adds no telemetry, persistent index, disk spill, history import, or legacy report commands. Existing default Bedrock and Codex ledgers remain unchanged; Codex observations have no timestamp/session metadata. See the [skill and query reference](profiles/default/skills/pi-log-analytics/SKILL.md) for source support, coverage, limits, installation, and offline checks. Use `/reload` or a fresh `pp` session after installation; analytics starts deferred.

## Default profile web tools

The default profile provides `web_search` (SearXNG) and `web_fetch` (local readable extraction with automatic public-URL Jina fallback). A tool-free Luna call adds best-effort prompt-injection annotations before results enter context; screening failures are marked, not blocked. See [setup, behavior, and limitations](profiles/default/docs/web-tools.md).

## Default profile Herdr

Repository-owned deferred `herdr_layout` and `herdr_pane` tools use the installed CLI for visible servers and logs, with concise descriptions, bounded output, and explicit command-safety handling. The thin `herdr` skill loads installed documentation dynamically and uses Herdr automatically for requested long-running processes while inside it. No third-party Pi extension or service supervisor is added.

Run `node scripts/pi-herdr-setup.mjs` from the lasting checkout to link the local argv plugin. Herdr `/new-instance` and `/branch` then launch Pi through a preflight-preserving Node bootstrap without a shell host; `/new-terminal` and non-Herdr behavior stay unchanged. Generated lifecycle reporting and a native prompt bridge preserve Pi UI and existing sound/desktop settings. See [setup, ownership, limitations, and checks](profiles/default/docs/herdr.md).

## Default profile browser control

The default profile provides `browser_session`, `browser_page`, and `/browser-setup` for one ownership-verified Brave session. Isolated mode stores browser data under the active profile. Real-profile mode accepts only configured aliases discovered from Brave `Local State`; the legacy aliases are copied once into the default profile, while sessions and browser data are not migrated. Browser launch, lifecycle, and page operations use TypeScript and direct CDP. Windows process identity uses a narrow PowerShell CIM adapter; the default browser tools do not invoke Python, `agent-browser`, or `npx`. Credential, CAPTCHA, cookie, storage, and arbitrary-evaluation surfaces remain unavailable. See [`profiles/default/skills/browser-tools/SKILL.md`](profiles/default/skills/browser-tools/SKILL.md).

## Default profile image tools

The default profile provides deferred `image_inspect` and `image_transform` tools backed by Sharp. Use `tool_search` with image, crop, resize, rotate, convert, compress, or metadata terms to activate both tools for the current session; a new session hides them again. Transforms accept local single-frame images, never overwrite a source or existing destination, enforce byte/dimension/pixel limits, strip covered metadata, and reopen outputs before publication. The initial operations are crop, resize, auto-orient, quarter-turn rotation, and JPEG/PNG/WebP conversion with bounded quality. Screenshots, OCR, generation, drawing, annotation, remote images, and animation editing are excluded. See [`profiles/default/skills/image-editing/SKILL.md`](profiles/default/skills/image-editing/SKILL.md).

## Default profile Onclave

Default Pi loads the shared Onclave adapter for orchestrator-to-orchestrator communication between independent Pi instances. `onclave_instances` discovers peers, `onclave_message` sends asks, asynchronous requests, or inert informs, and `/onclave` reports status. Registration/reconnect is automatic; trusted-network requests start when idle or queue as follow-ups when busy, without host confirmation prompts. Subagents do not participate. See [setup, behavior, and offline checks](profiles/default/docs/onclave.md). The legacy loader shares the same adapter changes; `/yt` and `/yt-local` remain separate vault workflows.

## Default profile commands

- `/branch` opens a branched copy of the current session in a new terminal tab.
- `/bro` restates the last response in plain language.
- `/clear` starts a new session, matching `/new`, and reloads profile resources when the footer shows `[reload]`.
- `/commit` quietly delegates review, grouping/messages, staging, and commits to `gpt-5.6-luna` at low reasoning. Unclear grouping falls back to one commit for all eligible changes. Only likely `.gitignore` candidates require a question; completion lists each short hash and commit subject.
- `exit` or `/exit` gracefully quits Pi; Pi prints its built-in resume hint on shutdown.
- `/effort [level]` shows or sets thinking effort.
- `/handoff`, `/init`, `/summarize`, and `/war-report` are native prompt templates.
- `/new-instance` opens a new Pi instance for the current profile; `/new-terminal` opens a plain shell.
- `/astra` switches to GPT-6 Astra, and `/sol` and `/luna` switch to their GPT-5.6 models through the Codex subscription; `/fable` switches to Claude Fable through Amazon Bedrock.
- `/yt <request>` ingests, searches, lists, or fetches YouTube content through Onclave, then compares ingested videos with the current repository without modifying it.
- `/yt-local <url-or-id> [transcript|metadata] [options]` explicitly fetches local YouTube artifacts without uploading them to Onclave.
- `/commit push` additionally pushes the current branch to `origin`, including existing outgoing commits, without force-pushing.

The [profile-local command system](profiles/default/docs/commands.md) uses an explicit TS registry, Markdown prompts, and optional command-scoped tools. Commands print an invocation and add errors to model context, using the current conversation and model. `/commit` runs the complete Git workflow privately in Luna; the main thread shows progress, ignore-file questions, failures, and the actual commit summary, not routine Git commands/output. Luna flags new files that likely belong in `.gitignore`; dedicated secret handling is deferred. There is no extra test, typecheck, lint, or build phase. Normal Git hooks remain enabled, and actual failures surface and stop the workflow. The workflow targets 30 seconds, with a 30-second active-work budget paused for user decisions and 15-second Git/shell timeouts; no extra staging-ambiguity, path-accounting, or busy-command gates. There are no inventory/report files or custom prepare/execute tools. See [the command contract](profiles/default/docs/commit.md). Use `/reload` to activate changes. The legacy profile's existing command is unchanged.

The compatibility path `~/.pi/agent` points to the legacy profile so direct `pi` invocations retain the previous behavior.
