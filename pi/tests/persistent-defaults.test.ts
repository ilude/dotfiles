import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import persistentDefaults, {
	enforcePinnedDefaults,
	PINNED_DEFAULTS,
} from "../extensions/persistent-defaults";
import { createMockPi } from "./helpers/mock-pi";

const tempDirs: string[] = [];

function tempSettingsPath(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-defaults-"));
	tempDirs.push(dir);
	return path.join(dir, "settings.json");
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("persistent defaults guard", () => {
	it("pins GPT-5.6 Sol with low thinking", () => {
		expect(PINNED_DEFAULTS).toEqual({
			defaultModel: "gpt-5.6-sol",
			defaultProvider: "openai-codex",
			defaultThinkingLevel: "low",
		});
	});

	it("restores pinned model provider and thinking defaults while preserving other settings", async () => {
		const settingsPath = tempSettingsPath();
		fs.writeFileSync(
			settingsPath,
			`${JSON.stringify(
				{
					defaultModel: "other-model",
					defaultProvider: "other-provider",
					defaultThinkingLevel: "high",
					metrics: { enabled: false },
				},
				null,
				2,
			)}\n`,
		);

		expect(await enforcePinnedDefaults(settingsPath)).toBe(true);

		const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
		expect(settings).toMatchObject({
			...PINNED_DEFAULTS,
			metrics: { enabled: false },
		});
	});

	it("does not rewrite when defaults are already pinned", async () => {
		const settingsPath = tempSettingsPath();
		fs.writeFileSync(
			settingsPath,
			`${JSON.stringify(PINNED_DEFAULTS, null, 2)}\n`,
		);

		expect(await enforcePinnedDefaults(settingsPath)).toBe(false);
	});

	it("restores pinned defaults before creating a new session", async () => {
		const settingsPath = tempSettingsPath();
		fs.writeFileSync(
			settingsPath,
			`${JSON.stringify(
				{
					defaultModel: "temporary-model",
					defaultProvider: "temporary-provider",
					defaultThinkingLevel: "high",
				},
				null,
				2,
			)}\n`,
		);
		const pi = Object.assign(createMockPi(), {
			setModel: vi.fn(async () => true),
			setThinkingLevel: vi.fn(),
		});
		persistentDefaults(pi as unknown as ExtensionAPI, settingsPath);

		await pi._getHook("session_before_switch")[0].handler({ reason: "new" });

		expect(JSON.parse(fs.readFileSync(settingsPath, "utf-8"))).toEqual(
			PINNED_DEFAULTS,
		);
	});
});
