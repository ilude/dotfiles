import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockPi } from "./helpers/mock-pi.ts";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-tools-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("task tools", () => {
	it("registers MVP lower_snake_case task tools", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/tasks.ts");
		mod.default(pi as any);
		for (const name of [
			"task_create",
			"task_batch_create",
			"task_list",
			"task_get",
			"task_update",
		]) {
			expect(pi._getTool(name)).toBeDefined();
		}
	});

	it("defers execution tools without running work", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/tasks.ts");
		mod.default(pi as any);
		const result = await pi._getTool("task_execute")?.execute({});
		expect(result.details).toEqual({ outcome: "deferred" });
	});

	it("registers provider-safe object schemas for Codex/OpenAI", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/tasks.ts");
		mod.default(pi as any);
		for (const tool of pi._tools) {
			expect(tool.parameters.type).toBe("object");
			expect(tool.parameters).toHaveProperty("properties");
			expect(tool.parameters.properties).toBeTypeOf("object");
		}
	});
});
