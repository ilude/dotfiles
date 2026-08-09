import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
	copyToClipboard,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

interface MessageLike {
	role?: unknown;
	content?: unknown;
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	return content
		.flatMap((block) => {
			if (!block || typeof block !== "object" || !("type" in block)) return [];
			if (
				block.type === "text" &&
				"text" in block &&
				typeof block.text === "string"
			) {
				return [block.text];
			}
			return [];
		})
		.join("\n");
}

export function serializeConversationForClipboard(branch: readonly unknown[]): {
	text: string;
	messageCount: number;
} {
	const sections = branch.flatMap((entry) => {
		if (!entry || typeof entry !== "object" || !("type" in entry)) return [];
		if (entry.type !== "message" || !("message" in entry)) return [];
		const message = entry.message as MessageLike;
		if (message.role !== "user" && message.role !== "assistant") return [];
		const content = textFromContent(message.content).trim();
		return content ? [`${message.role.toUpperCase()}:\n${content}`] : [];
	});

	return {
		text: sections.join("\n\n---\n\n"),
		messageCount: sections.length,
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export default function copyAllExtension(pi: ExtensionAPI): void {

	pi.registerCommand("copy-all", {
		description:
			"Copy user and assistant messages to the clipboard; optional fallback file",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const { text, messageCount } = serializeConversationForClipboard(
				ctx.sessionManager.getBranch(),
			);
			if (!text) {
				ctx.ui.notify("No user or assistant messages to copy.", "info");
				return;
			}

			const bytes = Buffer.byteLength(text, "utf8");
			try {
				await copyToClipboard(text);
				ctx.ui.notify(
					`Copied ${messageCount} messages (${bytes.toLocaleString()} bytes).`,
					"info",
				);
				return;
			} catch (error) {
				const fallbackArg = args.trim();
				if (!fallbackArg) {
					ctx.ui.notify(
						`Clipboard copy failed: ${errorMessage(error)}. Retry with /copy-all <fallback-file>.`,
						"error",
					);
					return;
				}

				const fallbackPath = isAbsolute(fallbackArg)
					? fallbackArg
					: resolve(ctx.cwd, fallbackArg);
				if (existsSync(fallbackPath)) {
					ctx.ui.notify(
						`Clipboard copy failed and fallback file already exists: ${fallbackPath}`,
						"error",
					);
					return;
				}
				try {
					await writeFile(fallbackPath, text, { encoding: "utf8", flag: "wx" });
					ctx.ui.notify(
						`Clipboard copy failed; wrote ${messageCount} messages (${bytes.toLocaleString()} bytes) to ${fallbackPath}.`,
						"warning",
					);
				} catch (writeError) {
					ctx.ui.notify(
						`Clipboard copy and fallback write failed: ${errorMessage(writeError)}`,
						"error",
					);
				}
			}
		},
	});
}
