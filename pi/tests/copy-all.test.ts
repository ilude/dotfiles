import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const copyToClipboardMock = vi.hoisted(() => vi.fn());
vi.mock("@earendil-works/pi-coding-agent", () => ({
	copyToClipboard: copyToClipboardMock,
}));

import copyAllExtension, {
	serializeConversationForClipboard,
} from "../extensions/copy-all.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
	copyToClipboardMock.mockReset();
});

function branch() {
	return [
		{
			type: "message",
			message: { role: "user", content: [{ type: "text", text: "Question" }] },
		},
		{
			type: "message",
			message: {
				role: "assistant",
				content: [
					{ type: "text", text: "Answer" },
					{ type: "image", data: "ignored" },
				],
			},
		},
		{
			type: "message",
			message: { role: "toolResult", content: "not copied" },
		},
	];
}

function setup() {
	let command:
		| { handler: (args: string, ctx: Record<string, unknown>) => Promise<void> }
		| undefined;
	const sendMessage = vi.fn();
	const pi = {
		registerCommand: vi.fn((name: string, definition) => {
			if (name === "copy-all") command = definition;
		}),
		sendMessage,
	};
	copyAllExtension(pi as never);
	if (!command) throw new Error("copy-all command was not registered");
	return { command, sendMessage };
}

describe("copy-all", () => {
	it("serializes only user and assistant messages", () => {
		expect(serializeConversationForClipboard(branch())).toEqual({
			text: "USER:\nQuestion\n\n---\n\nASSISTANT:\nAnswer",
			messageCount: 2,
		});
	});

	it("acknowledges before pending idle work and only once", async () => {
		copyToClipboardMock.mockResolvedValue(undefined);
		const { command } = setup();
		const notify = vi.fn();
		let release!: () => void;
		const idle = new Promise<void>((resolve) => {
			release = resolve;
		});
		const pending = command.handler("", {
			cwd: process.cwd(),
			waitForIdle: () => idle,
			sessionManager: { getBranch: () => branch() },
			ui: { notify },
		});

		expect(notify).toHaveBeenCalledTimes(1);
		expect(notify).toHaveBeenCalledWith("Copying conversation.", "info");
		release();
		await pending;
		expect(notify.mock.calls.filter(([message]) => message === "Copying conversation.")).toHaveLength(1);
	});

	it("copies through Pi's clipboard helper and reports bytes", async () => {
		copyToClipboardMock.mockResolvedValue(undefined);
		const { command, sendMessage } = setup();
		const notify = vi.fn();
		await command.handler("", {
			cwd: process.cwd(),
			waitForIdle: vi.fn(async () => {}),
			sessionManager: { getBranch: () => branch() },
			ui: { notify },
		});

		expect(copyToClipboardMock).toHaveBeenCalledWith(
			"USER:\nQuestion\n\n---\n\nASSISTANT:\nAnswer",
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringMatching(/^Copied 2 messages \(\d+ bytes\)\.$/),
			"info",
		);
		expect(sendMessage).not.toHaveBeenCalled();
	});

	it("writes an explicit new fallback file when clipboard delivery fails", async () => {
		copyToClipboardMock.mockRejectedValue(new Error("clipboard unavailable"));
		const root = mkdtempSync(join(tmpdir(), "pi-copy-all-"));
		roots.push(root);
		const { command } = setup();
		const notify = vi.fn();
		await command.handler("conversation.txt", {
			cwd: root,
			waitForIdle: vi.fn(async () => {}),
			sessionManager: { getBranch: () => branch() },
			ui: { notify },
		});

		expect(readFileSync(join(root, "conversation.txt"), "utf8")).toContain(
			"ASSISTANT:\nAnswer",
		);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("wrote 2 messages"),
			"warning",
		);
	});
});
