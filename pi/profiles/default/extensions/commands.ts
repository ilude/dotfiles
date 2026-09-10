import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { CommandInvocationAuthority } from "../lib/command-invocations.ts";
import { completePartialArgument } from "../lib/argument-completions.ts";
import { commands } from "../commands/index.ts";

export default function profileCommands(pi: ExtensionAPI): void {
	pi.registerMessageRenderer("profile-command", (message, { outputPad }) =>
		new Text(typeof message.content === "string" ? message.content : "", outputPad, 0));

	const directory = join(dirname(fileURLToPath(import.meta.url)), "..", "commands");
	const owned = new Set<string>();
	const toolsByCommand = new Map<string, ReadonlySet<string>>();
	const commandByTool = new Map<string, string>();
	const loadErrors = new Map<string, string>();
	const invocations = new CommandInvocationAuthority();

	function clearOwnedTools(): void {
		// Remove only our tools, preserving changes made by other extensions.
		pi.setActiveTools(pi.getActiveTools().filter((name) => !owned.has(name)));
	}

	function settle(): void {
		invocations.settle();
		clearOwnedTools();
	}

	function report(message: string, ctx: ExtensionContext, triggerTurn = false): void {
		if (ctx.hasUI) ctx.ui.notify(message, "error");
		pi.sendMessage({ customType: "profile-command-error", content: message, display: true }, { triggerTurn });
	}

	for (const command of commands) {
		try {
			const tools = command.tools?.(pi, invocations) ?? [];
			const toolNames = new Set<string>();
			for (const tool of tools) {
				if (owned.has(tool.name)) throw new Error(`Duplicate command tool: ${tool.name}`);
				owned.add(tool.name);
				toolNames.add(tool.name);
				commandByTool.set(tool.name, command.name);
				pi.registerTool({
					...tool,
					async execute(...args) {
						const [toolCallId] = args;
						const invocation = invocations.getToolCall(toolCallId);
						if ((!invocation || invocation.command !== command.name || !toolNames.has(tool.name)) && !command.allowDirectToolCalls) {
							throw new Error(`${tool.name} is only available during its delivered /${command.name} invocation.`);
						}
						return tool.execute(...args);
					},
				});
			}
			toolsByCommand.set(command.name, toolNames);
		} catch (error) {
			loadErrors.set(command.name, error instanceof Error ? error.message : String(error));
		}

		pi.registerCommand(command.name, {
			description: command.description,
			getArgumentCompletions: (prefix) => completePartialArgument(prefix, command.completions ?? []),
			handler: async (rawArgs, ctx) => {
				try {
					// A short, durable transcript entry; don't echo arbitrary arguments/secrets.
					pi.sendMessage({ customType: "profile-command", content: `/${command.name}`, display: true });
					const failure = loadErrors.get(command.name);
					if (failure) throw new Error(failure);
					const args = rawArgs.trim();
					if (!command.arguments && args) throw new Error(`Usage: /${command.name}`);
					const parsed = command.arguments?.(args) ?? { extra: "", options: {} };
					const prompt = readFileSync(join(directory, command.name, "prompt.md"), "utf8").trim();
					if (!prompt) throw new Error("Command prompt is empty.");

					const invocation = invocations.create(command.name, parsed.options ?? {});
					// Prepare schemas before submission. This is additive so an executing batch
					// keeps its tools; authority is still granted only at message delivery.
					const currentTools = pi.getActiveTools();
					pi.setActiveTools([...new Set([...currentTools, ...(toolsByCommand.get(command.name) ?? [])])]);
					pi.sendMessage({
						customType: "profile-command-prompt",
						content: parsed.extra ? `${prompt}\n\n${parsed.extra}` : prompt,
						display: false,
						details: { invocationId: invocation.id },
					}, { deliverAs: "steer", triggerTurn: true });
				} catch (error) {
					// Invalid or failed submissions must not deactivate a valid in-flight command.
					report(`/${command.name} failed: ${error instanceof Error ? error.message : String(error)}`, ctx, true);
				}
			},
		});
	}

	// Details are selected only for a locally-created, actually delivered message.
	pi.on("message_start", (event) => {
		const message = event.message as { customType?: unknown; details?: unknown };
		if (message.customType === "profile-command-prompt") invocations.deliver(message.details);
	});
	// Bind before execution, then discard each binding after its result is finalized.
	pi.on("tool_call", (event) => {
		const command = commandByTool.get(event.toolName);
		if (!command) return;
		try {
			invocations.bindToolCall(event.toolCallId, event.toolName, command, toolsByCommand);
		} catch (error) {
			const definition = commands.find((item) => item.name === command);
			if (!definition?.allowDirectToolCalls) return { block: true, reason: error instanceof Error ? error.message : String(error), terminate: true };
		}
	});
	pi.on("tool_result", (event) => invocations.releaseToolCall(event.toolCallId));
	pi.on("tool_execution_end", (event) => invocations.releaseToolCall(event.toolCallId));

	pi.on("session_start", (_event, ctx) => {
		settle();
		for (const [name, error] of loadErrors) report(`/${name} unavailable: ${error}`, ctx);
	});
	// Keep tools through retries, compaction, and queued continuations, not just one turn.
	pi.on("agent_settled", () => settle());
	pi.on("session_shutdown", () => {
		invocations.shutdown();
		clearOwnedTools();
	});
}
