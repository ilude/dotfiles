import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import skillReviewExtension, {
	runSkillReview,
} from "../extensions/skill-review-command.js";
import { discoverSkills } from "../lib/skill-discovery.js";
import {
	buildInventory,
	buildSkillReviewArtifacts,
	buildTriggerEvals,
	inventoryFromMarkdownFiles,
	lintInventory,
	parseModelReview,
	rankHighRiskSkills,
	synthesizeComparison,
	validateGeneratedArtifacts,
	validatePacketSafety,
} from "../lib/skill-review.js";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

let tmpRoot: string;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-skill-review-"));
});

afterEach(() => {
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const fixtureRoot = path.resolve("tests/fixtures/skill-review");

function asPi(value: unknown): ExtensionAPI {
	return value as ExtensionAPI;
}

function asCtx(value: unknown): ExtensionContext {
	return value as ExtensionContext;
}

function fixtureSkills() {
	return discoverSkills({ roots: [{ path: fixtureRoot, source: "custom" }] });
}

function fileHashes(root: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const dirent of fs.readdirSync(root, {
		recursive: true,
		withFileTypes: true,
	})) {
		if (!dirent.isFile()) continue;
		const full = path.join(dirent.parentPath, dirent.name);
		out.set(path.relative(root, full), fs.readFileSync(full, "utf-8"));
	}
	return out;
}

describe("skill-review deterministic core", () => {
	it("extracts inventory metadata and usage placeholders", () => {
		const inventory = buildInventory(fixtureSkills(), path.resolve(".."));
		const clean = inventory.find((item) => item.name === "clean-skill");
		expect(clean?.description).toContain("focused clean");
		expect(clean?.boundarySignal).toBe(true);
		expect(clean?.usage.signal).toBe("unused");
		expect(clean?.frontmatterFields).toContain("name");
	});

	it("reports distinct deterministic finding rules", () => {
		const findings = lintInventory(
			buildInventory(fixtureSkills(), path.resolve("..")),
		);
		const rules = findings.map((finding) => finding.ruleId);
		expect(rules).toEqual(
			expect.arrayContaining([
				"skill-name-format",
				"description-missing",
				"boundary-missing",
				"trigger-overlap",
				"reference-missing",
				"body-too-long",
			]),
		);
		expect(findings[0]).toHaveProperty("recommendation");
		expect(findings[0]).toHaveProperty("findingClass");
	});

	it("generates high-risk trigger evals with negative controls", () => {
		const inventory = buildInventory(fixtureSkills(), path.resolve(".."));
		const highRisk = rankHighRiskSkills(inventory, lintInventory(inventory));
		const evals = buildTriggerEvals(highRisk, inventory);
		expect(evals.some((item) => item.expectedTrigger === false)).toBe(true);
		expect(evals.some((item) => item.promptId.endsWith("explicit"))).toBe(true);
		expect(evals.some((item) => item.promptId.endsWith("implicit"))).toBe(true);
	});

	it("renders complete stable artifact sets and validates malformed data", () => {
		const artifacts = buildSkillReviewArtifacts({
			repoRoot: path.resolve(".."),
			runId: "test-run",
			now: new Date("2026-07-08T00:00:00.000Z"),
			skills: fixtureSkills(),
		});
		expect(Object.keys(artifacts).sort()).toEqual([
			"comparison-template.json",
			"decision-ledger.json",
			"findings.json",
			"high-risk-skills.json",
			"inventory.json",
			"model-packet.md",
			"run-manifest.json",
			"subagent-tasks.json",
			"summary.md",
			"trigger-evals.json",
		]);
		expect(validateGeneratedArtifacts(artifacts).ok).toBe(true);
		expect(artifacts["model-packet.md"]).toContain("GPT-5.5");
		expect(artifacts["model-packet.md"]).toContain("Fable-5");
		expect(artifacts["model-packet.md"]).toContain("skip/medium/high");
		expect(validatePacketSafety("API_KEY=abc").ok).toBe(false);
		expect(parseModelReview("{}").valid).toBe(false);
	});

	it("converts malformed model output into invalid comparison state", () => {
		const artifacts = buildSkillReviewArtifacts({
			repoRoot: path.resolve(".."),
			runId: "test-run",
			skills: fixtureSkills(),
		});
		const comparison = synthesizeComparison(
			"not json",
			"not json",
			artifacts["decision-ledger.json"],
		);
		expect(comparison.comparison).toContain("GPT valid: false");
		expect(comparison.ledger).toContain("invalid");
	});

	it("supports markdown-file inventory fixtures without absolute paths", () => {
		const records = inventoryFromMarkdownFiles([
			{
				filePath: "relative/example/SKILL.md",
				source: "custom",
				content:
					"---\nname: inline-skill\ndescription: Inline skill.\n---\n# Inline\n",
			},
		]);
		expect(records[0].name).toBe("inline-skill");
	});

	it("labels out-of-repo skill paths without leaking local absolute paths", () => {
		const inventory = buildInventory(fixtureSkills(), tmpRoot);
		expect(inventory.every((item) => item.path.startsWith("external/"))).toBe(
			true,
		);
		expect(JSON.stringify(inventory)).not.toContain(fixtureRoot);
	});
});

describe("skill-review command", () => {
	it("registers /skill-review and rejects user-facing arguments", async () => {
		const pi = createMockPi();
		skillReviewExtension(asPi(pi));
		const command = pi._commands.find((item) => item.name === "skill-review");
		expect(command).toBeDefined();
		const ctx = createMockCtx({ cwd: tmpRoot });
		await command?.handler("--root elsewhere", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Usage: /skill-review (no arguments)",
			"error",
		);
	});

	it("writes artifacts under repo-root output and leaves source fixtures unchanged", async () => {
		const before = fileHashes(fixtureRoot);
		const pi = createMockPi();
		pi.exec.mockResolvedValue({ code: 0, stdout: `${tmpRoot}\n`, stderr: "" });
		const result = await runSkillReview(
			asPi(pi),
			asCtx(createMockCtx({ cwd: path.join(tmpRoot, "subdir") })),
			{
				repoRoot: tmpRoot,
				outputRoot: path.join(tmpRoot, ".tmp", "skill-review"),
				runId: "fixed",
				skills: fixtureSkills(),
				now: new Date("2026-07-08T00:00:00.000Z"),
			},
		);
		expect(result.runDir).toBe(".tmp/skill-review/fixed");
		for (const name of [
			"summary.md",
			"inventory.json",
			"findings.json",
			"high-risk-skills.json",
			"trigger-evals.json",
			"model-packet.md",
			"subagent-tasks.json",
			"comparison-template.json",
			"decision-ledger.json",
			"run-manifest.json",
		])
			expect(fs.existsSync(path.join(tmpRoot, result.runDir, name))).toBe(true);
		expect(fileHashes(fixtureRoot)).toEqual(before);
	});

	it("uses explicit collision behavior for run directories", async () => {
		const pi = createMockPi();
		pi.exec.mockResolvedValue({ code: 0, stdout: `${tmpRoot}\n`, stderr: "" });
		const options = {
			repoRoot: tmpRoot,
			outputRoot: path.join(tmpRoot, ".tmp", "skill-review"),
			runId: "fixed",
			skills: fixtureSkills(),
		};
		const first = await runSkillReview(
			asPi(pi),
			asCtx(createMockCtx({ cwd: tmpRoot })),
			options,
		);
		const second = await runSkillReview(
			asPi(pi),
			asCtx(createMockCtx({ cwd: tmpRoot })),
			options,
		);
		expect(first.runDir).toBe(".tmp/skill-review/fixed");
		expect(second.runDir).toBe(".tmp/skill-review/fixed-01");
	});

	it("fails closed when output root escapes the repo", async () => {
		const pi = createMockPi();
		await expect(
			runSkillReview(asPi(pi), asCtx(createMockCtx({ cwd: tmpRoot })), {
				repoRoot: tmpRoot,
				outputRoot: path.join(os.tmpdir(), "outside-skill-review"),
				skills: fixtureSkills(),
			}),
		).rejects.toThrow(/escapes repo root/);
	});
});
