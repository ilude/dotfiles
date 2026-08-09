import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import echoSlashCommands from "../extensions/00-echo-slash-commands";
import { SLASH_COMMAND_ECHO_TYPE } from "../lib/slash-command-echo";

type MessageRenderer = Parameters<ExtensionAPI["registerMessageRenderer"]>[1];

describe("slash command echo renderer", () => {
	it("renders visible slash echoes", () => {
		const registerMessageRenderer = vi.fn();
		echoSlashCommands({
			registerMessageRenderer,
		} as unknown as ExtensionAPI);

		const renderer = registerMessageRenderer.mock.calls.find(
			([type]) => type === SLASH_COMMAND_ECHO_TYPE,
		)?.[1] as MessageRenderer | undefined;
		expect(renderer).toBeDefined();

		const component = renderer?.(
			{ content: "/plan-it build the thing" } as Parameters<MessageRenderer>[0],
			undefined as Parameters<MessageRenderer>[1],
			{
				bold: (text: string) => text,
				fg: (_color: string, text: string) => text,
			} as Parameters<MessageRenderer>[2],
		);
		expect(component?.render(80)[0]?.trim()).toBe("> /plan-it build the thing");
	});
});
