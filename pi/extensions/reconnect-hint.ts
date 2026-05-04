import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { uiNotify } from "../lib/extension-utils.js";

function quoteCliArg(value: string): string {
	return `"${value.replace(/"/g, '\\"')}"`;
}

function buildReconnectCommand(sessionId: string): string {
	return `pi --session ${quoteCliArg(sessionId)}`;
}

type ReconnectHintState = {
	exitHookRegistered: boolean;
	pendingCommand: string | undefined;
	currentCommand: string | undefined;
};

const stateKey = Symbol.for("dotfiles.pi.reconnectHint.state");

function getState(): ReconnectHintState {
	const root = globalThis as typeof globalThis & {
		[stateKey]?: ReconnectHintState;
	};
	root[stateKey] ??= {
		exitHookRegistered: false,
		pendingCommand: undefined,
		currentCommand: undefined,
	};
	return root[stateKey];
}

function formatReconnectMessage(command: string): string {
	return `\nReconnect to this session with:\n${command}\n`;
}

function rememberCurrentSession(sessionId: string | undefined): void {
	if (!sessionId) return;
	getState().currentCommand = buildReconnectCommand(sessionId);
}

function markReconnectForProcessExit(command: string | undefined): void {
	if (!command) return;
	getState().pendingCommand = command;
}

function installProcessExitHook(): void {
	const state = getState();
	if (state.exitHookRegistered) return;
	state.exitHookRegistered = true;

	process.once("exit", () => {
		const command = getState().pendingCommand;
		if (!command) return;
		process.stdout.write(formatReconnectMessage(command));
	});
}

export default function reconnectHint(pi: ExtensionAPI) {
	installProcessExitHook();

	pi.on("session_start", (_event, ctx) => {
		rememberCurrentSession(ctx.sessionManager.getSessionId());
	});

	pi.on("input", (event, ctx) => {
		if (event.source !== "interactive") return;
		if (event.text.trim().toLowerCase() !== "exit") return;

		rememberCurrentSession(ctx.sessionManager.getSessionId());
		markReconnectForProcessExit(getState().currentCommand);
	});

	pi.on("session_shutdown", async (event, ctx) => {
		if (event.reason !== "quit") return;

		const sessionId = ctx.sessionManager.getSessionId();
		if (!sessionId) return;

		const command = buildReconnectCommand(sessionId);
		markReconnectForProcessExit(command);
		uiNotify(ctx, "info", `Reconnect to this session with:\n${command}`, {
			prefix: "reconnect",
		});
	});
}
