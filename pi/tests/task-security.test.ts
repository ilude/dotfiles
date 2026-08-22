import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, getTask } from "../lib/task-registry.js";
import { redactTaskText } from "../lib/task-security.js";
import {
	closeTaskDatabase,
	initializeTaskStore,
	openTaskDatabase,
	readStoredTask,
} from "../lib/task-store.js";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-security-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
	initializeTaskStore(tmpRoot);
});

afterEach(() => {
	closeTaskDatabase(tmpRoot);
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
		const syntheticToken = `sk-${"x".repeat(40)}`;
		const task = createTask({
			origin: "other",
			summary: `api_key=${syntheticToken}`,
		});
		const stored = readStoredTask(task.id, openTaskDatabase(tmpRoot));
		expect(JSON.stringify(stored)).not.toContain(syntheticToken);
		expect(getTask(task.id)?.summary).toContain("[REDACTED]");
	});
});
