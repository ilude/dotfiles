import { describe, expect, it } from "vitest";

import { parseDamageControlJudgeSettings } from "../lib/damage-control-settings.ts";

describe("damage-control judge settings", () => {
	it("keeps the judge disabled by default", () => {
		expect(parseDamageControlJudgeSettings({})).toEqual({
			enabled: false,
			autoAllow: false,
			provider: "openai-codex",
			model: "gpt-5.6-luna",
		});
	});

	it("preserves explicitly enabled shadow-only review", () => {
		expect(
			parseDamageControlJudgeSettings({
				damageControl: { judge: { enabled: true } },
			}),
		).toEqual({
			enabled: true,
			autoAllow: false,
			provider: "openai-codex",
			model: "gpt-5.6-luna",
		});
	});

	it("enables auto-allow only for an exact configured Luna model", () => {
		expect(
			parseDamageControlJudgeSettings({
				damageControl: {
					judge: {
						enabled: true,
						autoAllow: true,
						provider: "openai-codex",
						model: "gpt-5.6-luna",
					},
				},
			}),
		).toEqual({
			enabled: true,
			autoAllow: true,
			provider: "openai-codex",
			model: "gpt-5.6-luna",
		});
	});

	it.each([
		{ enabled: "yes" },
		{ autoAllow: "yes" },
		{ provider: 42 },
		{ model: [] },
	])("fails closed for invalid consumed fields: %j", (judge) => {
		expect(
			parseDamageControlJudgeSettings({ damageControl: { judge } }),
		).toMatchObject({ enabled: false, autoAllow: false });
	});

	it.each([
		{ provider: "openai-codex", model: "gpt-5.6-sol" },
		{ provider: "openai-codex" },
		{ model: "gpt-5.6-luna" },
	])("rejects auto-allow without a configured Luna identity: %j", (identity) => {
		expect(
			parseDamageControlJudgeSettings({
				damageControl: {
					judge: { enabled: true, autoAllow: true, ...identity },
				},
			}),
		).toMatchObject({ enabled: true, autoAllow: false });
	});
});
