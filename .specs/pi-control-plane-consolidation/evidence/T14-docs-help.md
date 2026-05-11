# T14 docs/help/status and active-source references

## Checks
```
pi/README.md:166:just team     # legacy recipe; use subagent team dispatch for new workflows
pi/README.md:167:just full     # all extensions (damage-control + chain + subagent + quality-gates + session-hooks)
pi/README.md:225:Shared team-config helpers for subagent team dispatch. `/team` is no longer an active slash command; use the `subagent` tool instead:
pi/README.md:338:record subagent runs or permission decisions.
pi/README.md:343:Producer wiring: `subagent` and `damage-control` write to the
pi/README.md:370:- `/tasks` -- urgency-grouped list (blocked > failed > running > pending > completed > cancelled), compact rows with short id + summary + relative time + retry count
pi/README.md:371:- `/tasks <id-prefix>` -- detail view (id, state, origin, agent, summary, prompt/preview, timestamps, retries, blockReason/errorReason, usage tokens). Prefix matching needs >=4 chars and rejects ambiguous matches
pi/README.md:372:- `/tasks cancel <id>` -- transitions `running`/`blocked`/`pending` -> `cancelled`; preserves the final summary
pi/README.md:373:- `/tasks retry <id>` -- transitions `failed` -> `running`; the registry bumps `retryCount` and clears `errorReason`. Does not re-execute the work; you re-issue the original action through normal channels.
pi/README.md:574:Team configuration: `~/.dotfiles/pi/agents/teams.yaml`
pi/README.md:774:- Nested subagent events correlated to their parent via `parent_trace_id` (W3C Trace Context `TRACEPARENT` propagation).
pi/README.md:867:When `subagent` spawns a child Pi process via `child_process.spawn`, it injects a W3C Trace Context env var:
pi/README.md:870:TRACEPARENT=00-<parent-trace-id>-<subagent-span-id>-01
pi/README.md:873:The child Pi's `session_start` handler parses `TRACEPARENT`, adopts the parent's 32-hex `trace_id`, and writes the parent's 16-hex span id into `parent_trace_id` on every event it emits. This means a child trace file under `~/.pi/agent/traces/<child-session-id>.jsonl` can be stitched to its parent's trace by trace_id, and the originating subagent invocation can be located by parent_trace_id.
pi/README.md:875:A fresh span id is generated for each subagent invocation (single, parallel, or chain step) so concurrent children do not share spans. When the parent has no active trace (transcript disabled), a new trace id is fabricated and propagated so the child can still record consistent W3C-shaped ids on its own side.
pi/README.md:886:| `~/.dotfiles/pi/agents/teams.yaml` | Team roster and hierarchy |
pi/README.md:910:Use the `subagent` tool with a team key or lead name from `pi/agents/teams.yaml`:
pi/extensions/agent-chain.ts:44: * planner/builder/reviewer subagent invocations track themselves via
pi/extensions/agent-chain.ts:45: * subagent/index.ts. Defensive try/catch so registry I/O never breaks /chain.
pi/extensions/agent-chain.ts:856:				"Use the subagent tool to execute each stage sequentially, passing the previous output as input to the next:",
pi/extensions/agent-team.ts:4: * Legacy /team registration has been retired. This module keeps the pure
pi/extensions/agent-team.ts:5: * team-config helpers used by subagent dispatch and tests, but intentionally
pi/extensions/agent-team.ts:6: * does not register an active /team command.
pi/extensions/agent-team.ts:153:		`Use the subagent tool to dispatch this task to the ${teamEntry.name} at ${agentFilePath}.`,
pi/extensions/agent-team.ts:155:		"The lead has the following workers available (delegate to them sequentially via subagent):",
pi/extensions/agent-team.ts:174:	// Intentionally empty: /team is no longer an active command. Use the
pi/extensions/agent-team.ts:175:	// subagent tool with { team: "<team-key>", task: "..." } instead.
pi/extensions/README.md:56:Subdirectories under `pi/extensions/` (such as `pi/extensions/subagent/` and
pi/extensions/session-hooks.ts:90:		// W3C TRACEPARENT internally so subagent processes inherit parent_trace_id
pi/extensions/subagent/agents.ts:15: * via the operator-layer registry so /tasks can show them. Future runtime
pi/extensions/subagent/index.ts:4: * Spawns a separate `pi` process for each subagent invocation,
pi/extensions/subagent/index.ts:12: * Uses JSON mode to capture structured output from subagents.
pi/extensions/subagent/index.ts:62:			origin: "subagent",
pi/extensions/subagent/index.ts:75:				origin: "subagent",
pi/extensions/subagent/index.ts:107:		// ignore -- registry should never block subagent flow
pi/extensions/subagent/index.ts:121: * Build a W3C `TRACEPARENT` value for a child subagent process. The parent
pi/extensions/subagent/index.ts:122: * span id is freshly generated for each subagent invocation so parallel
pi/extensions/subagent/index.ts:324:	const dir = path.join(os.tmpdir(), "pi-subagent-artifacts");
pi/extensions/subagent/index.ts:409:	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
pi/extensions/subagent/index.ts:510:	// Operator task registry: track this subagent invocation as durable work.
pi/extensions/subagent/index.ts:516:		name: "subagent.run",
pi/extensions/subagent/index.ts:517:		category: "subagent",
pi/extensions/subagent/index.ts:550:			// subagent's span as its parent. Spread process.env first so all
pi/extensions/subagent/index.ts:750:	team: Type.Optional(Type.String({ description: "Team key or lead name from pi/agents/teams.yaml (team-dispatch mode)" })),
pi/extensions/subagent/index.ts:765:		name: "subagent",
pi/extensions/subagent/index.ts:768:			"Delegate tasks to specialized subagents with isolated context.",
pi/extensions/subagent/index.ts:772:			'Optional modelSize/modelPolicy parameters dynamically map subagents onto the current provider/model ladder.',
pi/extensions/subagent/index.ts:819:						content: [{ type: "text", text: "Could not load teams config for subagent team dispatch." }],
pi/extensions/subagent/index.ts:1069:					theme.fg("toolTitle", theme.bold("subagent ")) +
pi/extensions/subagent/index.ts:1090:					theme.fg("toolTitle", theme.bold("subagent ")) +
pi/extensions/subagent/index.ts:1104:				theme.fg("toolTitle", theme.bold("subagent ")) +
pi/extensions/tasks.ts:85:	return "Usage: /tasks|/tasks list [--all]|show <id>|create <summary>|start <id>|complete <id>|skip <id> [reason]|cancel <id>|retry <id>|reopen <id>|clear completed|settings mode compact|full|hidden. Retry/reopen does not execute work.";
pi/extensions/tasks.ts:119:function originFrom(value: unknown): "subagent" | "team" | "shell" | "other" {
pi/extensions/tasks.ts:120:	return value === "subagent" || value === "team" || value === "shell"
pi/extensions/tasks.ts:233:			"Task control plane. Use /tasks help for lifecycle, settings, and recovery commands.",
pi/extensions/tasks.ts:246:						`Task display mode: ${getTaskRenderMode()}. Use /tasks settings mode compact|full|hidden.`,
pi/extensions/transcript-runtime.ts:9: *   - Expose the current trace/span IDs to the subagent extension so it can
pi/extensions/transcript-runtime.ts:14: * tools, prompt-router, session-hooks, and subagent extensions without
pi/extensions/transcript-runtime.ts:119: * Pi was spawned as a subagent. When absent, generates a fresh trace id.
pi/agents/code-reviewer.md:6:routingUse: "Use for direct read-only code review of a diff/branch; not plan review or team coordination."
pi/agents/coding-heavy.md:3:description: Heavy coding subagent for complex implementation, architecture-sensitive refactors, migrations, and multi-file coordination.
pi/agents/coding-heavy.md:11:tools: read, grep, bash, edit, write, ask_user, subagent, append_expertise, log_exchange, read_expertise, tool_search, web_search, web_fetch, pwsh, test_status, test_debug, test_targets, test_run, test_canary, test_recover, test_infra_research, test_lock_clear, todo, commit_plan, commit_validate_message
pi/agents/coding-heavy.md:16:You are a heavy coding subagent powered by the OpenAI Codex provider's `gpt-5.3-codex` model. Use this agent for complex implementation tasks that need deep understanding, multi-file coordination, or architectural judgment, but still require direct execution rather than team-lead coordination.
pi/agents/coding-light.md:3:description: "Lightweight coding subagent powered by OpenAI Codex GPT-5.3 Codex for small, focused implementation tasks."
pi/agents/coding-light.md:11:tools: read, grep, bash, edit, write, ask_user, subagent, append_expertise, log_exchange, read_expertise, tool_search, web_search, web_fetch, pwsh, test_status, test_debug, test_targets, test_run, test_canary, test_recover, test_infra_research, test_lock_clear, todo, commit_plan, commit_validate_message
pi/agents/coding-light.md:18:You are a lightweight coding subagent powered by the OpenAI Codex provider's `gpt-5.3-codex` model. Use this agent for small, focused coding tasks where fast implementation, patch review, or targeted debugging is more important than broad architectural planning.
pi/agents/coding-medium.md:3:description: "Medium-weight coding subagent powered by OpenAI Codex GPT-5.3 Codex for implementation, debugging, and refactoring tasks."
pi/agents/coding-medium.md:11:tools: read, grep, bash, edit, write, ask_user, subagent, append_expertise, log_exchange, read_expertise, tool_search, web_search, web_fetch, pwsh, test_status, test_debug, test_targets, test_run, test_canary, test_recover, test_infra_research, test_lock_clear, todo, commit_plan, commit_validate_message
pi/agents/coding-medium.md:18:You are a medium-weight coding subagent powered by the OpenAI Codex provider's `gpt-5.3-codex` model. Use this agent for implementation tasks that need more context, judgment, or multi-file coordination than `coding-light`, but do not require full architectural leadership.
pi/agents/engineering-lead.md:26:tools: read, grep, find, ls, subagent
pi/agents/engineering-lead.md:56:- Use dynamic same-provider model routing for worker delegation when invoking `subagent`:
pi/agents/ml-research-lead.md:22:tools: read, grep, find, ls, subagent
pi/agents/orchestrator.md:28:tools: read, grep, find, ls, subagent
pi/agents/orchestrator.md:61:- When using `subagent`, prefer dynamic model routing rather than relying on pinned agent models alone:
pi/agents/planning-lead.md:26:tools: read, grep, find, ls, subagent
pi/agents/planning-lead.md:58:- Use dynamic same-provider model routing for worker delegation when invoking `subagent`:
pi/agents/utility-mini.md:3:description: "Lightweight OpenAI Codex GPT-5.4 Mini subagent for concise research, summarization, and utility tasks."
pi/agents/utility-mini.md:11:tools: read, grep, bash, edit, write, ask_user, subagent, append_expertise, log_exchange, read_expertise, tool_search, web_search, web_fetch, pwsh, test_status, test_debug, test_targets, test_run, test_canary, test_recover, test_infra_research, test_lock_clear, todo, commit_plan, commit_validate_message
pi/agents/utility-mini.md:18:You are a compact general-purpose subagent powered by the OpenAI Codex provider's `gpt-5.4-mini` model. Use this agent for fast, low-overhead utility tasks such as summarizing documents, extracting links, proposing search topics, inspecting files, and answering focused implementation questions.
pi/agents/validation-lead.md:26:tools: read, grep, find, ls, subagent
pi/agents/validation-lead.md:58:- Use dynamic same-provider model routing for worker delegation when invoking `subagent`:
```

## Result
- `pi/README.md` documents /branch Windows Terminal support/fallback, /tasks MVP/settings recovery, /team removal, and subagent replacement examples.
- `pi/extensions/tasks.ts` help/status output covers lifecycle and settings modes.
- `pi/extensions/subagent/index.ts` exposes explicit agent/lead/team dispatch.
- Active `/team` registration removed from `pi/extensions/agent-team.ts`.
