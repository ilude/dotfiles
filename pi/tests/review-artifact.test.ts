import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockPi, type RegisteredTool } from "./helpers/mock-pi.js";

describe("review_artifact_write extension", () => {
	let tmpDir: string;
	let previousCwd: string;
	let tool: RegisteredTool;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-review-artifact-"));
		previousCwd = process.cwd();
		process.chdir(tmpDir);
		const mockPi = createMockPi();
		const mod = await import("../extensions/review-artifact.ts");
		mod.default(mockPi as unknown as ExtensionAPI);
		const registeredTool = mockPi._getTool("review_artifact_write");
		if (!registeredTool)
			throw new Error("review_artifact_write not registered");
		tool = registeredTool;
	});

	afterEach(() => {
		process.chdir(previousCwd);
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("writes canonical reviewer artifact under a review directory", async () => {
		const result = await tool.execute(
			"id",
			{
				reviewDir: ".specs/example/review-1",
				reviewer: "security-reviewer",
				artifactName: "security-reviewer.md",
				findings: [
					{
						severity: "high",
						evidence: "Plan lacks bounded artifact writer.",
						required_fix: "Use review_artifact_write.",
						category: "automation-readiness",
						confidence: "high",
					},
				],
			},
			undefined,
			undefined,
			{},
		);

		expect(result.content[0].text).toBe(
			"WROTE: .specs/example/review-1/security-reviewer.md",
		);
		const artifact = fs.readFileSync(
			path.join(tmpDir, ".specs/example/review-1/security-reviewer.md"),
			"utf8",
		);
		expect(artifact).toContain("reviewer: security-reviewer");
		expect(artifact).toContain("finding_count: 1");
		expect(artifact).toContain("severity: high");
	});

	it("rejects path traversal", async () => {
		const result = await tool.execute(
			"id",
			{
				reviewDir: ".specs/example/review-1",
				reviewer: "reviewer",
				artifactName: "../plan.md",
				findings: [],
			},
			undefined,
			undefined,
			{},
		);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("path traversal");
	});

	it("rejects non-review directories", async () => {
		const result = await tool.execute(
			"id",
			{
				reviewDir: ".specs/example",
				reviewer: "reviewer",
				artifactName: "reviewer.md",
				findings: [],
			},
			undefined,
			undefined,
			{},
		);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("reviewDir must be under");
	});

	it("rejects too many findings", async () => {
		const findings = Array.from({ length: 6 }, () => ({
			severity: "low",
			evidence: "evidence",
			required_fix: "fix",
		}));
		const result = await tool.execute(
			"id",
			{
				reviewDir: ".specs/example/review-1",
				reviewer: "reviewer",
				artifactName: "reviewer.md",
				findings,
			},
			undefined,
			undefined,
			{},
		);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("at most 5");
	});
});
