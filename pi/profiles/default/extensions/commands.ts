import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Box, matchesKey, Text } from "@earendil-works/pi-tui";
import { completePartialArgument } from "../lib/argument-completions.ts";
import { commands } from "../commands/index.ts";
import { runCommitReviewer } from "../commands/commit/reviewer.ts";
import { registerProfileCommand } from "../lib/profile-command.ts";

const RESULT_ENTRY = "profile-commit-result";
const STATUS_KEY = "profile-commit";

export default function profileCommands(pi: ExtensionAPI): void {
	const directory = join(dirname(fileURLToPath(import.meta.url)), "..", "commands");
	let active: AbortController | undefined;

	pi.registerEntryRenderer<{ text: string; error: boolean }>(RESULT_ENTRY, (entry, _options, theme) => {
		const box = new Box(1, 1, content => theme.bg("userMessageBg", content));
		const data = entry.data;
		box.addChild(new Text(data?.error ? theme.fg("error", data.text) : data?.text ?? "", 0, 0));
		return box;
	});

	function report(message: string, ctx: ExtensionContext, triggerTurn = false): void {
		if (ctx.hasUI) ctx.ui.notify(message, "error");
		pi.sendMessage({ customType: "profile-command-error", content: message, display: true }, { triggerTurn });
	}

	function presentCommit(text: string, error: boolean, ctx: ExtensionContext, args: string): void {
		pi.appendEntry(RESULT_ENTRY, { text, error });
		pi.sendMessage({
			customType: RESULT_ENTRY,
			content: `/commit${args.trim() ? ` ${args.trim()}` : ""}\n${text}`,
			display: false,
		}, { triggerTurn: true });
		if (ctx.hasUI && error) ctx.ui.notify("/commit failed; see result above", "error");
	}

	async function waitForMainIdle(ctx: ExtensionContext, signal: AbortSignal): Promise<void> {
		if (ctx.isIdle()) return;
		await new Promise<void>((resolve, reject) => {
			let unsubscribe = () => {};
			const cleanup = () => { unsubscribe(); signal.removeEventListener("abort", onAbort); };
			const onAbort = () => { cleanup(); reject(new Error("Cancelled")); };
			const onSettled = () => {
				if (!ctx.isIdle()) return;
				cleanup();
				resolve();
			};
			signal.addEventListener("abort", onAbort, { once: true });
			unsubscribe = pi.on("agent_settled", onSettled);
			if (signal.aborted) onAbort();
			else onSettled(); // Cover settlement between the initial check and subscription.
		});
	}

	async function commit(rawArgs: string, ctx: ExtensionContext, waitForIdle?: () => Promise<void>): Promise<void> {
		let controller: AbortController | undefined;
		let stopInput: (() => void) | undefined;
		let inIgnoreDialog = false;
		try {
			const parse = commands.find((command) => command.name === "commit")?.arguments;
			if (!parse) throw new Error("Commit command is unavailable.");
			const parsed = parse(rawArgs.trim());
			if (active) throw new Error("A commit is already running.");
			controller = new AbortController();
			active = controller;
			if (ctx.mode === "tui") stopInput = ctx.ui.onTerminalInput((data) => {
				// Let the native input path handle Escape too. In particular, an
				// ignore-file dialog owns its own cancellation while it is open.
				if (matchesKey(data, "escape") && !inIgnoreDialog) controller?.abort();
				return undefined;
			});
			ctx.ui.setStatus(STATUS_KEY, "Committing…");
			if (ctx.hasUI) ctx.ui.notify("Committing…", "info");
			if (waitForIdle) {
				const signal = controller.signal;
				await new Promise<void>((resolve, reject) => {
					const onAbort = () => { signal.removeEventListener("abort", onAbort); reject(new Error("Cancelled")); };
					signal.addEventListener("abort", onAbort, { once: true });
					void waitForIdle().then(
						() => { signal.removeEventListener("abort", onAbort); resolve(); },
						(error) => { signal.removeEventListener("abort", onAbort); reject(error); },
					);
					if (signal.aborted) onAbort();
				});
			} else await waitForMainIdle(ctx, controller.signal);
			controller.signal.throwIfAborted();
			const result = await runCommitReviewer(pi, ctx, parsed.options?.push === true, controller.signal,
				(text) => {
					inIgnoreDialog = text === "Waiting for ignore-file decision…";
					ctx.ui.setStatus(STATUS_KEY, text);
				});
			presentCommit(result.text, false, ctx, rawArgs);
		} catch (error) {
			presentCommit(`/commit failed: ${error instanceof Error ? error.message : String(error)}`, true, ctx, rawArgs);
		} finally {
			stopInput?.();
			if (controller && active === controller) active = undefined;
			if (controller) ctx.ui.setStatus(STATUS_KEY, undefined);
		}
	}

	async function invokePrompt(command: (typeof commands)[number], rawArgs: string, ctx: ExtensionContext): Promise<void> {
		try {
			const args = rawArgs.trim();
			if (!command.arguments && args) throw new Error(`Usage: /${command.name}`);
			const parsed = command.arguments?.(args) ?? { extra: "" };
			const prompt = readFileSync(join(directory, command.name, "prompt.md"), "utf8").trim();
			if (!prompt) throw new Error("Command prompt is empty.");
			pi.sendMessage({
				customType: "profile-command-prompt",
				content: parsed.extra ? `${prompt}\n\n${parsed.extra}` : prompt,
				display: false,
			}, { deliverAs: "steer", triggerTurn: true });
		} catch (error) {
			report(`/${command.name} failed: ${error instanceof Error ? error.message : String(error)}`, ctx, true);
		}
	}

	for (const command of commands) {
		registerProfileCommand(pi, command.name, {
			description: command.description,
			getArgumentCompletions: (prefix) => completePartialArgument(prefix, command.completions ?? []),
			handler: (rawArgs, ctx: ExtensionCommandContext) => command.name === "commit"
				? commit(rawArgs, ctx, () => ctx.waitForIdle())
				: invokePrompt(command, rawArgs, ctx),
		});
	}

	pi.registerShortcut("f9", {
		description: "Commit changes and push to origin",
		handler: (ctx) => commit("push", ctx),
	});
	pi.registerShortcut("f10", {
		description: "Commit changes",
		handler: (ctx) => commit("", ctx),
	});

	pi.on("session_shutdown", () => active?.abort());
}
