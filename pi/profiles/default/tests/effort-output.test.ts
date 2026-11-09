import { afterEach, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import registerEffort from "../extensions/effort.ts";

afterEach(() => vi.unstubAllEnvs());
it.each(["tui", "rpc"] as const)("preserves effort model messages and presents results for %s", async mode => {
	vi.stubEnv("T3_PI_MCP_EXTENSION_PATH", "fixture");
	vi.stubEnv("PI_SUBAGENT_AUTHORITY", "");
	const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
	let level = "low";
	const sendMessage = vi.fn();
	const pi = {
		registerEntryRenderer: vi.fn(), appendEntry: vi.fn(), sendMessage,
		registerCommand: (name: string, command: Parameters<ExtensionAPI["registerCommand"]>[1]) => commands.set(name, command),
		getThinkingLevel: () => level,
		setThinkingLevel: (requested: string) => { level = requested; },
	};
	registerEffort(pi as unknown as ExtensionAPI);
	const notify = vi.fn();
	const ctx = { mode, hasUI: true, ui: { notify } } as unknown as ExtensionCommandContext;
	for (const [args, result] of [["", "Current effort: low."], ["high", "Effort set to high."], ["invalid", "Invalid effort level: invalid."]]) {
		await commands.get("effort")!.handler(args, ctx);
		expect(sendMessage).toHaveBeenLastCalledWith({ customType: "effort-command", content: expect.stringContaining(result), display: true }, { triggerTurn: false });
		if (mode === "rpc") expect(notify).toHaveBeenLastCalledWith(expect.stringContaining(result), "info");
	}
	if (mode === "tui") expect(notify).not.toHaveBeenCalled();
});
