// Keep repo-tracked Pi startup defaults stable.
//
// Pi's built-in model/thinking selectors currently persist every session change
// back to settings.json. That is surprising for prompt routing and for temporary
// /model exploration: both are session-scoped choices, not default preference
// updates. This extension restores the default model/provider/thinking fields
// after those runtime changes so the tracked settings file only changes when a
// user edits the defaults intentionally.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const PINNED_DEFAULTS = {
	defaultModel: "gpt-5.5",
	defaultProvider: "openai-codex",
	defaultThinkingLevel: "minimal",
} as const;

export function getSettingsPath(): string {
	return path.join(os.homedir(), ".pi", "agent", "settings.json");
}

export function enforcePinnedDefaults(
	settingsPath = getSettingsPath(),
): boolean {
	if (!fs.existsSync(settingsPath)) return false;
	const raw = fs.readFileSync(settingsPath, "utf-8");
	const settings = JSON.parse(raw) as Record<string, unknown>;
	const next = { ...settings, ...PINNED_DEFAULTS };
	const nextRaw = `${JSON.stringify(next, null, 2)}\n`;
	if (nextRaw === raw) return false;
	fs.writeFileSync(settingsPath, nextRaw, "utf-8");
	return true;
}

function scheduleEnforce(): void {
	// Settings writes are queued by Pi internals; run once soon and once later to
	// catch both synchronous writes and queued promise flushes.
	setTimeout(() => enforcePinnedDefaults(), 25);
	setTimeout(() => enforcePinnedDefaults(), 250);
}

export default function persistentDefaults(pi: ExtensionAPI): void {
	enforcePinnedDefaults();

	pi.on("session_start", async () => {
		scheduleEnforce();
	});

	pi.on("model_select", async () => {
		scheduleEnforce();
	});

	pi.on("thinking_level_select", async () => {
		scheduleEnforce();
	});

	const originalSetModel = pi.setModel.bind(pi);
	pi.setModel = async (model) => {
		const result = await originalSetModel(model);
		scheduleEnforce();
		return result;
	};

	const originalSetThinkingLevel = pi.setThinkingLevel.bind(pi);
	pi.setThinkingLevel = (level) => {
		originalSetThinkingLevel(level);
		scheduleEnforce();
	};
}
