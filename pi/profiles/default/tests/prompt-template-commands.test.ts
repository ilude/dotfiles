import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatPromptTemplateCommand, registerPromptTemplateCommands } from "../lib/prompt-template-commands.ts";

it("renders a prompt-template invocation without exposing its expanded prompt", async () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-prompt-commands-"));
	writeFileSync(join(directory, "summarize.md"), "---\ndescription: Summarize work\n---\nPrompt body for $ARGUMENTS\n");
	const commands = new Map<string, { handler: (args: string) => Promise<void> }>();
	const sendMessage = vi.fn();
	let renderer: ((message: any, options: any) => any) | undefined;
	const pi = {
		registerCommand: (name: string, command: any) => commands.set(name, command),
		registerMessageRenderer: (_type: string, value: any) => { renderer = value; },
		sendMessage,
	} as unknown as ExtensionAPI;

	vi.setSystemTime(new Date("2026-09-15T12:34:56Z"));
	await registerPromptTemplateCommands(pi, directory);
	await commands.get("summarize")!.handler("release notes");

	const sent = sendMessage.mock.calls[0][0];
	expect(sent).toMatchObject({ customType: "prompt-template-command", content: "Prompt body for release notes\n", display: true, details: { invocation: "/summarize release notes", startedAt: Date.now() } });
	const rendered = renderer!(sent, { outputPad: 0 }).render(200).join("\n").trimEnd();
	expect(rendered).toBe(formatPromptTemplateCommand(sent.details));
	expect(rendered).not.toContain("Prompt body");
});

it("preserves quoted positional, default, and sliced prompt arguments", async () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-prompt-commands-"));
	writeFileSync(join(directory, "example.md"), "---\ndescription: Example\n---\n$1|${2:-fallback}|${@:2}\n");
	const commands = new Map<string, { handler: (args: string) => Promise<void> }>();
	const sendMessage = vi.fn();
	registerPromptTemplateCommands({ registerCommand: (name: string, command: unknown) => commands.set(name, command as any), registerMessageRenderer: vi.fn(), sendMessage } as unknown as ExtensionAPI, directory);

	await commands.get("example")!.handler("\"one value\" two three");
	expect(sendMessage.mock.calls[0][0].content).toBe("one value|two|two three\n");
});
