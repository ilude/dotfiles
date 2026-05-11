import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, getTask } from "../lib/task-registry.js";
import { redactTaskText } from "../lib/task-security.js";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-security-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("task security redaction", () => {
	it("redacts synthetic token-like values from text", () => {
		expect(
			redactTaskText("token=ghp_abcdefghijklmnopqrstuvwxyz123456"),
		).not.toContain("ghp_");
	});

	it("redacts before persistence", () => {
		const task = createTask({
			origin: "other",
			summary: "api_key=sk-abcdefghijklmnopqrstuvwxyz1234567890",
		});
		const file = path.join(tmpRoot, "tasks", `${task.id}.json`);
		const raw = fs.readFileSync(file, "utf-8");
		expect(raw).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
		expect(getTask(task.id)?.summary).toContain("[REDACTED]");
	});
});
