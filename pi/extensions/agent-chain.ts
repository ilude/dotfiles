/**
 * Agent Chain Extension
 *
 * Implements the expertise file system — the core mechanism for knowledge compounding.
 * Agents append discoveries to per-agent JSONL logs (safe for concurrent use), and read
 * their expertise YAML at task start via the mental-model skill.
 *
 * Registers:
 *   - /chain command: sequentially runs planner → builder → reviewer agents
 *   - append_expertise tool: agents call this to record discoveries (append-only, thread-safe)
 *   - log_exchange tool: records all agent exchanges to the shared session JSONL
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { type ExtensionAPI, withFileMutationQueue } from "@mariozechner/pi-coding-agent";

// Resolve the multi-team directory relative to the Pi agent dir (~/.pi/agent)
function getMultiTeamDir(): string {
	const agentDir = path.join(os.homedir(), ".pi", "agent");
	return path.join(agentDir, "multi-team");
}

// Append a single JSONL record to a file, using withFileMutationQueue to prevent corruption
async function appendJsonl(filePath: string, record: object): Promise<void> {
	await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
	await withFileMutationQueue(filePath, async () => {
		const line = JSON.stringify(record) + "\n";
		await fs.promises.appendFile(filePath, line, { encoding: "utf-8" });
	});
}

// Read all JSONL records from a file (returns [] if file doesn't exist)
async function readJsonl(filePath: string): Promise<object[]> {
	try {
		const content = await fs.promises.readFile(filePath, "utf-8");
		return content
			.split("\n")
			.filter((l) => l.trim())
			.map((l) => JSON.parse(l));
	} catch {
		return [];
	}
}

export default function (pi: ExtensionAPI) {
	const multiTeamDir = getMultiTeamDir();

	// ── Tool: append_expertise ──────────────────────────────────────────────────
	// Agents call this to record discoveries. Append-only JSONL prevents concurrent
	// write corruption (H-2: sequential-only YAML updates are not safe under concurrency).
	pi.registerTool({
		name: "append_expertise",
		label: "Append Expertise",
		description:
			"Append a discovery or decision to your expertise log. Use this at the end of a task to record what you learned. " +
			"Entries are appended to {agent}-expertise-log.jsonl — never overwrites existing knowledge.",
		parameters: Type.Object({
			agent: Type.String({ description: "Agent name (e.g. backend-dev, orchestrator)" }),
			category: Type.String({
				description: "Category: pattern | strong_decision | key_file | observation | open_question | system_overview",
			}),
			entry: Type.Object(
				{},
				{
					additionalProperties: true,
					description: "Structured entry. For strong_decision include why_good. For key_file include role.",
				},
			),
			session_id: Type.Optional(Type.String({ description: "Session ID for traceability" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { agent, category, entry, session_id } = params as {
				agent: string;
				category: string;
				entry: object;
				session_id?: string;
			};

			const logPath = path.join(multiTeamDir, "expertise", `${agent}-expertise-log.jsonl`);
			const record = {
				timestamp: new Date().toISOString(),
				session_id: session_id ?? "unknown",
				category,
				entry,
			};

			await appendJsonl(logPath, record);

			return {
				content: [{ type: "text", text: `Appended ${category} entry to ${agent}-expertise-log.jsonl` }],
				details: { agent, category, logPath },
			};
		},
	});

	// ── Tool: log_exchange ──────────────────────────────────────────────────────
	// Records all agent exchanges to the shared session JSONL (H-3 schema).
	pi.registerTool({
		name: "log_exchange",
		label: "Log Exchange",
		description: "Record an agent exchange to the shared session conversation log. " +
			"Schema: {role, agent, content, session_id, timestamp}",
		parameters: Type.Object({
			session_id: Type.String({ description: "Session ID (directory name under sessions/)" }),
			role: Type.String({ description: "Role: user | orchestrator | planning-lead | engineering-lead | validation-lead | worker" }),
			agent: Type.Union([Type.String(), Type.Null()], { description: "Agent name, or null for user messages" }),
			content: Type.String({ description: "Message content" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { session_id, role, agent, content } = params as {
				session_id: string;
				role: string;
				agent: string | null;
				content: string;
			};

			const sessionDir = path.join(multiTeamDir, "sessions", session_id);
			const logPath = path.join(sessionDir, "conversation.jsonl");

			const record = {
				role,
				agent,
				content,
				session_id,
				timestamp: new Date().toISOString(),
			};

			await appendJsonl(logPath, record);

			return {
				content: [{ type: "text", text: `Logged ${role} exchange to session ${session_id}` }],
				details: { session_id, role, agent, logPath },
			};
		},
	});

	// ── Tool: read_expertise ───────────────────────────────────────────────────
	// Agents call this at task start to load their accumulated knowledge.
	pi.registerTool({
		name: "read_expertise",
		label: "Read Expertise",
		description:
			"Read your expertise log at task start. Returns all accumulated discoveries from previous sessions. " +
			"Always call this before starting work — it prevents re-discovering what you already know.",
		parameters: Type.Object({
			agent: Type.String({ description: "Agent name (e.g. backend-dev, orchestrator)" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { agent } = params as { agent: string };

			const logPath = path.join(multiTeamDir, "expertise", `${agent}-expertise-log.jsonl`);
			const entries = await readJsonl(logPath);

			if (entries.length === 0) {
				return {
					content: [{ type: "text", text: `No expertise recorded yet for ${agent}. This is your first session.` }],
					details: { agent, entryCount: 0 },
				};
			}

			const summary = entries
				.map((e: any) => `[${e.timestamp?.slice(0, 10) ?? "?"}] ${e.category}: ${JSON.stringify(e.entry)}`)
				.join("\n");

			return {
				content: [{ type: "text", text: `Expertise for ${agent} (${entries.length} entries):\n\n${summary}` }],
				details: { agent, entryCount: entries.length },
			};
		},
	});

	// ── Command: /chain ─────────────────────────────────────────────────────────
	// Runs a plan-build-review sequence: planner → builder → reviewer (sequential).
	// Each agent gets the previous agent's output as input context.
	pi.registerCommand("chain", {
		description: "Run plan-build-review sequence: planner → builder → reviewer",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("Usage: /chain <task description>", "warning");
				return;
			}

			const agentsDir = path.join(multiTeamDir, "agents");
			const agentFiles: Record<string, string> = {
				planner: path.join(agentsDir, "planner.md"),
				builder: path.join(agentsDir, "builder.md"),
				reviewer: path.join(agentsDir, "reviewer.md"),
			};

			// Verify agent persona files exist
			const missing = Object.entries(agentFiles)
				.filter(([, p]) => !fs.existsSync(p))
				.map(([name]) => name);

			if (missing.length > 0) {
				ctx.ui.notify(
					`Missing agent persona files: ${missing.join(", ")}. Create them in ${agentsDir}`,
					"warning",
				);
				return;
			}

			const message = [
				`Run the plan-build-review chain for this task: ${args.trim()}`,
				"",
				"Use the subagent tool to execute each stage sequentially, passing the previous output as input to the next:",
				`1. Planner: ${agentFiles.planner}`,
				`2. Builder: ${agentFiles.builder} (receives planner output)`,
				`3. Reviewer: ${agentFiles.reviewer} (receives builder output)`,
				"",
				"Do not proceed to the next stage until the current one completes.",
			].join("\n");

			await pi.sendUserMessage(message);
		},
	});
}
