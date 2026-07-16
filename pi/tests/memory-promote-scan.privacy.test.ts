import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const SCRIPT_PATH = path.join(
	REPO_ROOT,
	"pi",
	"scripts",
	"memory-promote-scan.ts",
);

describe("memory-promote-scan privacy", () => {
	it("running with a sandboxed HOME writes only inside that sandbox", () => {
		const sandbox = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-promote-scan-sandbox-"),
		);
		try {
			const env = { ...process.env, HOME: sandbox };
			execSync(`bun ${JSON.stringify(SCRIPT_PATH)}`, {
				env,
				cwd: REPO_ROOT,
				stdio: "pipe",
			});

			const expected = path.join(
				sandbox,
				".pi",
				"agent",
				"index",
				"policy-candidates.md",
			);
			expect(fs.existsSync(expected)).toBe(true);

			const inRepoOutput = path.join(
				REPO_ROOT,
				".pi",
				"agent",
				"index",
				"policy-candidates.md",
			);
			expect(fs.existsSync(inRepoOutput)).toBe(false);
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("emits a candidates or no-qualifying-candidates section", () => {
		const sandbox = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-promote-scan-empty-"),
		);
		try {
			const env = { ...process.env, HOME: sandbox };
			execSync(`bun ${JSON.stringify(SCRIPT_PATH)}`, {
				env,
				cwd: REPO_ROOT,
				stdio: "pipe",
			});
			const out = fs.readFileSync(
				path.join(
					sandbox,
					".pi",
					"agent",
					"index",
					"policy-candidates.md",
				),
				"utf8",
			);
			expect(
				out.startsWith("> LOCAL PRIVATE -- DO NOT COMMIT WITHOUT REVIEW"),
			).toBe(true);
			expect(
				/## Candidate/.test(out) || /## No qualifying candidates/.test(out),
			).toBe(true);
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});
});
