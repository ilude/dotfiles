import { onSessionStart } from "../lib/session-start-metrics.js";
// Keep repo-tracked Pi startup defaults stable.
//
// Pi's built-in model/thinking selectors currently persist every session change
// back to settings.json. That is surprising for prompt routing and for temporary
// /model exploration: both are session-scoped choices, not default preference
// updates. This extension restores the default model/provider/thinking fields
// after those runtime changes so the tracked settings file only changes when a
// user edits the defaults intentionally.

import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	getSettingsPath as getRuntimeSettingsPath,
	updateJsonObjectAtomic,
} from "../lib/settings-file.ts";

export const PINNED_DEFAULTS = {
	defaultModel: "gpt-5.6-sol",
	defaultProvider: "openai-codex",
	defaultThinkingLevel: "low",
} as const;

export function getSettingsPath(): string {
	return getRuntimeSettingsPath();
}

export async function enforcePinnedDefaults(
	settingsPath = getSettingsPath(),
): Promise<boolean> {
	if (!fs.existsSync(settingsPath)) return false;
	return updateJsonObjectAtomic(settingsPath, (settings) => ({
		...settings,
		...PINNED_DEFAULTS,
	}));
}

function reportEnforcementError(error: unknown): void {
	console.error(
		`[persistent-defaults] ${error instanceof Error ? error.message : String(error)}`,
	);
}

function scheduleEnforce(settingsPath: string): void {
	// Settings writes are queued by Pi internals; run once soon and once later to
	// catch both synchronous writes and queued promise flushes.
	const enforce = () => {
		void enforcePinnedDefaults(settingsPath).catch(reportEnforcementError);
	};
	setTimeout(enforce, 25);
	setTimeout(enforce, 250);
}

export default function persistentDefaults(
	pi: ExtensionAPI,
	settingsPath = getSettingsPath(),
): void {
	onSessionStart(pi, import.meta.url, async () => {
		await enforcePinnedDefaults(settingsPath);
		scheduleEnforce(settingsPath);
	});

	pi.on("session_before_switch", async (event) => {
		if (event.reason === "new") {
			await enforcePinnedDefaults(settingsPath);
		}
	});

	pi.on("model_select", async () => {
		scheduleEnforce(settingsPath);
	});

	pi.on("thinking_level_select", async () => {
		scheduleEnforce(settingsPath);
	});

	const originalSetModel = pi.setModel.bind(pi);
	pi.setModel = async (model) => {
		const result = await originalSetModel(model);
		scheduleEnforce(settingsPath);
		return result;
	};

	const originalSetThinkingLevel = pi.setThinkingLevel.bind(pi);
	pi.setThinkingLevel = (level) => {
		originalSetThinkingLevel(level);
		scheduleEnforce(settingsPath);
	};
}
