import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	enforcePinnedDefaults,
	PINNED_DEFAULTS,
} from "../extensions/persistent-defaults";

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
	it("restores pinned model provider and thinking defaults while preserving other settings", () => {
		const settingsPath = tempSettingsPath();
		fs.writeFileSync(
			settingsPath,
			`${JSON.stringify(
				{
					defaultModel: "other-model",
					defaultProvider: "other-provider",
					defaultThinkingLevel: "high",
					router: { policy: { N_HOLD: 0 } },
				},
				null,
				2,
			)}\n`,
		);

		expect(enforcePinnedDefaults(settingsPath)).toBe(true);

		const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
		expect(settings).toMatchObject({
			...PINNED_DEFAULTS,
			router: { policy: { N_HOLD: 0 } },
		});
	});

	it("does not rewrite when defaults are already pinned", () => {
		const settingsPath = tempSettingsPath();
		fs.writeFileSync(
			settingsPath,
			`${JSON.stringify(PINNED_DEFAULTS, null, 2)}\n`,
		);

		expect(enforcePinnedDefaults(settingsPath)).toBe(false);
	});
});
