import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
	buildContextEntries,
	sessionEntryToContextMessages,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import echoSlashCommands from "../extensions/00-echo-slash-commands";
import {
	appendNextCommand,
	appendSlashCommandAcknowledgement,
	registerSlashCommand,
	stripTrailingNextCommand,
	SLASH_COMMAND_ECHO_TYPE,
} from "../lib/slash-command-echo";

type EntryRenderer = Parameters<ExtensionAPI["registerEntryRenderer"]>[1];
type MessageRenderer = Parameters<ExtensionAPI["registerMessageRenderer"]>[1];

describe("slash command echo renderer", () => {
	it("strips only a trailing matching next-command section", () => {
		const command = "/do-it .specs/build/plan.md";
		const text = [
			"The design is appropriately scoped and avoids unnecessary churn.",
			"",
			"Next command:",
			"```bash",
			command,
			"```",
		].join("\n");

		expect(stripTrailingNextCommand(text, command)).toBe(
			"The design is appropriately scoped and avoids unnecessary churn.",
		);
		expect(stripTrailingNextCommand(text, "/do-it .specs/other/plan.md")).toBe(text);
		expect(
			stripTrailingNextCommand(
				"The design mentions Next command: in its assessment.",
				command,
			),
		).toBe("The design mentions Next command: in its assessment.");
	});

	it("renders visible slash echoes", () => {
		const registerEntryRenderer = vi.fn();
		const registerMessageRenderer = vi.fn();
		echoSlashCommands({
			registerEntryRenderer,
			registerMessageRenderer,
		} as unknown as ExtensionAPI);

		const renderer = registerEntryRenderer.mock.calls.find(
			([type]) => type === SLASH_COMMAND_ECHO_TYPE,
		)?.[1] as EntryRenderer | undefined;
		expect(renderer).toBeDefined();

		const component = renderer?.(
			{
				type: "custom",
				customType: SLASH_COMMAND_ECHO_TYPE,
				data: { kind: "submitted", text: "/plan-it build the thing" },
			} as Parameters<EntryRenderer>[0],
			{ expanded: false },
			{
				bold: (text: string) => text,
				fg: (_color: string, text: string) => text,
			} as Parameters<EntryRenderer>[2],
		);
		expect(component?.render(80)[0]?.trim()).toBe("> /plan-it build the thing");
	});

	it("wraps handlers with one immediate TUI-only acknowledgement", async () => {
		const appendEntry = vi.fn();
		const handler = vi.fn(async () => undefined);
		const registerCommand = vi.fn();
		registerSlashCommand({ appendEntry, registerCommand } as unknown as ExtensionAPI)("sample", { handler });
		const wrapped = registerCommand.mock.calls[0][1].handler;
		await wrapped("  arg  ", { mode: "tui" } as ExtensionCommandContext);
		expect(appendEntry).toHaveBeenCalledWith(SLASH_COMMAND_ECHO_TYPE, {
			kind: "submitted",
			text: "/sample arg",
		});
		expect(handler).toHaveBeenCalledWith("  arg  ", expect.objectContaining({ mode: "tui" }));
	});

	it("appends a TUI-only entry that restores visibly without entering model context", () => {
		const appendEntry = vi.fn();
		const pi = { appendEntry } as Pick<ExtensionAPI, "appendEntry">;
		const tuiCtx = { mode: "tui" } as Pick<ExtensionCommandContext, "mode">;
		const rpcCtx = { mode: "rpc" } as Pick<ExtensionCommandContext, "mode">;

		appendSlashCommandAcknowledgement(pi, tuiCtx, "plan-it", "build the thing");
		appendSlashCommandAcknowledgement(pi, rpcCtx, "plan-it", "build the other thing");
		appendNextCommand(pi, tuiCtx, "/do-it .specs/build/plan.md");

		expect(appendEntry).toHaveBeenCalledTimes(2);
		const [customType, data] = appendEntry.mock.calls[0];
		expect(customType).toBe(SLASH_COMMAND_ECHO_TYPE);
		expect(data).toEqual({ kind: "submitted", text: "/plan-it build the thing" });
		expect(appendEntry.mock.calls[1][1]).toEqual({
			kind: "next-command",
			text: "/do-it .specs/build/plan.md",
		});

		const restoredEntry = {
			type: "custom",
			id: "entry-1",
			parentId: null,
			timestamp: Date.now(),
			customType,
			data,
		};
		expect(
			buildContextEntries(
				[restoredEntry] as never,
				"entry-1",
				new Map([["entry-1", restoredEntry]]),
			),
		).toEqual([restoredEntry]);
		expect(sessionEntryToContextMessages(restoredEntry as never)).toEqual([]);

		const registerEntryRenderer = vi.fn();
		const registerMessageRenderer = vi.fn();
		echoSlashCommands({ registerEntryRenderer, registerMessageRenderer } as unknown as ExtensionAPI);
		const renderer = registerEntryRenderer.mock.calls[0][1] as EntryRenderer;
		const component = renderer(
			restoredEntry as Parameters<EntryRenderer>[0],
			{ expanded: false },
			{
				bold: (text: string) => text,
				fg: (_color: string, text: string) => text,
			} as Parameters<EntryRenderer>[2],
		);
		expect(component?.render(80)[0]?.trim()).toBe("> /plan-it build the thing");
		const nextComponent = renderer(
			{ ...restoredEntry, data: { kind: "next-command", text: "/do-it .specs/build/plan.md" } },
			{ expanded: false },
			{
				bold: (text: string) => text,
				fg: (_color: string, text: string) => text,
			} as Parameters<EntryRenderer>[2],
		);
		expect(nextComponent?.render(80)[0]?.trim()).toBe("next: /do-it .specs/build/plan.md");

		const messageRenderer = registerMessageRenderer.mock.calls[0][1] as MessageRenderer;
		const messageComponent = messageRenderer(
			{ role: "custom", customType: SLASH_COMMAND_ECHO_TYPE, content: "/summarize", display: true, timestamp: Date.now() },
			{ expanded: false, outputPad: 0 },
			{
				bold: (text: string) => text,
				fg: (_color: string, text: string) => text,
			} as Parameters<MessageRenderer>[2],
		);
		expect(messageComponent?.render(80)[0]?.trim()).toBe("> /summarize");
	});
});
