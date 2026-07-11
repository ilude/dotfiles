import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runIsolatedPiSmoke } from "../scripts/run-isolated-pi-smoke.mjs";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		fs.rmSync(root, { recursive: true, force: true });
	delete process.env.PI_SMOKE_TEST_RECORD;
});

describe("isolated Pi smoke runner", () => {
	it("uses argument arrays, native absolute scratch roots, and bounded captures", async () => {
		const fixtureRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-smoke-test-"),
		);
		roots.push(fixtureRoot);
		const fixture = path.join(fixtureRoot, "fake-pi.mjs");
		const record = path.join(fixtureRoot, "record.json");
		fs.writeFileSync(
			fixture,
			`import fs from "node:fs";
fs.writeFileSync(process.env.PI_SMOKE_TEST_RECORD, JSON.stringify({ args: process.argv.slice(2), env: { metrics: process.env.PI_METRICS_DIR, operator: process.env.PI_OPERATOR_DIR, friction: process.env.PI_WORKFLOW_FRICTION_DIR, legacySource: process.env.PI_LEGACY_TODO_SOURCE_DIR }, cwd: process.cwd() }));
process.stdout.write("x".repeat(70000));
process.stdout.write('\\n{"id":"smoke-state","type":"response","success":true}\\n');
`,
			"utf8",
		);
		process.env.PI_SMOKE_TEST_RECORD = record;

		const result = await runIsolatedPiSmoke({
			command: process.execPath,
			commandArgs: [fixture],
			scratchParent: fixtureRoot,
		});
		roots.push(result.scratch);
		const invocation = JSON.parse(fs.readFileSync(record, "utf8")) as {
			args: string[];
			env: Record<string, string>;
			cwd: string;
		};
		expect(invocation.args).toContain("--mode");
		expect(invocation.args).toContain("rpc");
		expect(invocation.args).not.toContain("--print");
		expect(invocation.env).not.toHaveProperty("isolated");
		for (const key of ["metrics", "operator", "friction", "legacySource"]) {
			const value = invocation.env[key];
			expect(path.isAbsolute(value)).toBe(true);
			expect(path.relative(result.scratch, value)).not.toMatch(/^\.\./);
		}
		expect(path.relative(result.scratch, invocation.cwd)).not.toMatch(/^\.\./);
		expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(64 * 1024);
	});

	it("enables network prompting only with live mode", async () => {
		const fixtureRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-smoke-live-"),
		);
		roots.push(fixtureRoot);
		const fixture = path.join(fixtureRoot, "fake-live-pi.mjs");
		fs.writeFileSync(
			fixture,
			'process.stdout.write("isolated-pi-smoke-ok\\n");\n',
			"utf8",
		);
		const result = await runIsolatedPiSmoke({
			live: true,
			command: process.execPath,
			commandArgs: [fixture],
			scratchParent: fixtureRoot,
		});
		roots.push(result.scratch);
		expect(result.args).toContain("--print");
		expect(result.args).not.toContain("rpc");
	});

	it("rejects live reports whose counts only start with one", async () => {
		const fixtureRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-smoke-telemetry-count-"),
		);
		roots.push(fixtureRoot);
		const fixture = path.join(fixtureRoot, "fake-telemetry-count-pi.mjs");
		fs.writeFileSync(
			fixture,
			`const args = process.argv.slice(2);
if (args.some((arg) => arg.startsWith("/orchestration-stats"))) process.stdout.write("delegated: 10; referenced run IDs: 10\\n");
else process.stdout.write("orchestration-live-ok\\n");
`,
			"utf8",
		);

		await expect(
			runIsolatedPiSmoke({
				live: true,
				scenario: "orchestration-telemetry",
				command: process.execPath,
				commandArgs: [fixture],
				scratchParent: fixtureRoot,
			}),
		).rejects.toThrow("Expected one delegated interaction");
	});

	it("runs paid delegation and no-tools stats as separate live processes", async () => {
		const fixtureRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-smoke-telemetry-"),
		);
		roots.push(fixtureRoot);
		const fixture = path.join(fixtureRoot, "fake-telemetry-pi.mjs");
		fs.writeFileSync(
			fixture,
			`const args = process.argv.slice(2);
if (args.some((arg) => arg.startsWith("/orchestration-stats"))) process.stdout.write("delegated: 1; referenced run IDs: 1\\n");
else process.stdout.write("orchestration-live-ok\\n");
`,
			"utf8",
		);
		const result = await runIsolatedPiSmoke({
			live: true,
			scenario: "orchestration-telemetry",
			command: process.execPath,
			commandArgs: [fixture],
			scratchParent: fixtureRoot,
		});
		roots.push(result.scratch);
		expect(result.invocations).toHaveLength(2);
		expect(result.invocations[0].join(" ")).toContain(
			path.join("subagent", "index.ts"),
		);
		expect(result.invocations[0].join(" ")).toContain(
			"workflow-friction-review.ts",
		);
		expect(result.invocations[1]).toContain("--no-tools");
		expect(result.invocations[1]).toContain("json");
		expect(result.invocations[1]).toContain("/orchestration-stats 1");
		expect(result.invocations[1].join(" ")).toContain("orchestration-stats.ts");
	});
});
