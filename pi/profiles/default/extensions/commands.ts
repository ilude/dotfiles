import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { commands } from "../commands/index.ts";

export default function profileCommands(pi: ExtensionAPI): void {
	pi.registerMessageRenderer("profile-command", (message, { outputPad }) =>
		new Text(typeof message.content === "string" ? message.content : "", outputPad, 0));

	const directory = join(dirname(fileURLToPath(import.meta.url)), "..", "commands");
	const owned = new Set<string>();
	const toolsByCommand = new Map<string, string[]>();
	const loadErrors = new Map<string, string>();
	let running: string | undefined;

	function report(message: string, ctx: ExtensionContext, triggerTurn = false): void {
		if (ctx.hasUI) ctx.ui.notify(message, "error");
		pi.sendMessage({ customType: "profile-command-error", content: message, display: true }, { triggerTurn });
	}

	function deactivate(): void {
		running = undefined;
		// Remove only our tools, preserving changes made by other extensions.
		pi.setActiveTools(pi.getActiveTools().filter((name) => !owned.has(name)));
	}

	for (const command of commands) {
		try {
			const tools = command.tools?.(pi) ?? [];
			for (const tool of tools) {
				if (owned.has(tool.name)) throw new Error(`Duplicate command tool: ${tool.name}`);
				owned.add(tool.name);
				pi.registerTool({
					...tool,
					async execute(...args) {
						if (running !== command.name) throw new Error(`${tool.name} is only available during /${command.name}.`);
						// Pi surfaces thrown tool errors in the transcript and model context.
						return tool.execute(...args);
					},
				});
			}
			toolsByCommand.set(command.name, tools.map((tool) => tool.name));
		} catch (error) {
			loadErrors.set(command.name, error instanceof Error ? error.message : String(error));
		}

		pi.registerCommand(command.name, {
			description: command.description,
			getArgumentCompletions: (prefix) => {
				// Empty or complete arguments must submit, not select an optional action.
				if (!prefix.trim()) return null;
				const matches = command.completions?.filter((value) => value !== prefix && value.startsWith(prefix));
				return matches?.length ? matches.map((value) => ({ value, label: value })) : null;
			},
			handler: async (rawArgs, ctx) => {
				try {
					// A short, durable transcript entry; don't echo arbitrary arguments/secrets.
					pi.sendMessage({ customType: "profile-command", content: `/${command.name}`, display: true });
					const failure = loadErrors.get(command.name);
					if (failure) throw new Error(failure);
					const args = rawArgs.trim();
					if (!command.arguments && args) throw new Error(`Usage: /${command.name}`);
					const extra = command.arguments?.(args) ?? "";
					const prompt = readFileSync(join(directory, command.name, "prompt.md"), "utf8").trim();
					if (!prompt) throw new Error("Command prompt is empty.");
					running = command.name;
					pi.setActiveTools([...new Set([...pi.getActiveTools().filter((name) => !owned.has(name)), ...(toolsByCommand.get(command.name) ?? [])])]);
					// Commands retain this conversation/model. /commit's tool delegates the
					// complete Git workflow privately and returns only its result.
					// A general named-agent dispatch/context-transfer policy remains future work.
					pi.sendMessage({ customType: "profile-command-prompt", content: extra ? `${prompt}\n\n${extra}` : prompt, display: false }, { triggerTurn: true });
				} catch (error) {
					deactivate();
					report(`/${command.name} failed: ${error instanceof Error ? error.message : String(error)}`, ctx, true);
				}
			},
		});
	}

	pi.on("session_start", (_event, ctx) => {
		deactivate();
		for (const [name, error] of loadErrors) report(`/${name} unavailable: ${error}`, ctx);
	});
	// Keep tools through retries, compaction, and queued continuations, not just one turn.
	pi.on("agent_settled", () => deactivate());
	pi.on("session_shutdown", () => deactivate());
}
