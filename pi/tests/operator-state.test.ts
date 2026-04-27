import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ALLOWED_TRANSITIONS,
	TASK_STATES,
	TERMINAL_TASK_STATES,
	ensureDirectory,
	getDecisionsLogPath,
	getOperatorStateDir,
	getPermissionsDir,
	getSessionApprovalsPath,
	getTasksDir,
	isAllowedTransition,
	type TaskState,
} from "../lib/operator-state.js";

let tmpRoot: string;
let prevOverride: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-operator-state-"));
	prevOverride = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOverride === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOverride;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("getOperatorStateDir", () => {
	it("honors PI_OPERATOR_DIR", () => {
		expect(getOperatorStateDir()).toBe(tmpRoot);
	});

	it("falls back to <agent-dir>/operator when no override is set", () => {
		delete process.env.PI_OPERATOR_DIR;
		expect(getOperatorStateDir()).toBe(path.join(os.homedir(), ".pi", "agent", "operator"));
	});
});

describe("path helpers", () => {
	it("derives tasks/permissions paths from the state root", () => {
		expect(getTasksDir()).toBe(path.join(tmpRoot, "tasks"));
		expect(getPermissionsDir()).toBe(path.join(tmpRoot, "permissions"));
		expect(getDecisionsLogPath()).toBe(path.join(tmpRoot, "permissions", "decisions.jsonl"));
		expect(getSessionApprovalsPath()).toBe(path.join(tmpRoot, "permissions", "session-approvals.json"));
	});
});

describe("ensureDirectory", () => {
	it("creates the directory recursively", () => {
		const target = path.join(tmpRoot, "a", "b", "c");
		ensureDirectory(target);
		expect(fs.statSync(target).isDirectory()).toBe(true);
	});

	it("is idempotent on repeated calls", () => {
		const target = path.join(tmpRoot, "exists");
		ensureDirectory(target);
		ensureDirectory(target);
		expect(fs.statSync(target).isDirectory()).toBe(true);
	});
});

describe("TASK_STATES", () => {
	it("includes the six canonical lifecycle states", () => {
		expect(new Set(TASK_STATES)).toEqual(
			new Set(["pending", "running", "blocked", "completed", "failed", "cancelled"]),
		);
	});

	it("identifies terminal states", () => {
		expect(TERMINAL_TASK_STATES.has("completed")).toBe(true);
		expect(TERMINAL_TASK_STATES.has("cancelled")).toBe(true);
		expect(TERMINAL_TASK_STATES.has("failed")).toBe(false); // failed is retryable
		expect(TERMINAL_TASK_STATES.has("running")).toBe(false);
	});
});

describe("ALLOWED_TRANSITIONS / isAllowedTransition", () => {
	const cases: Array<[TaskState, TaskState, boolean]> = [
		["pending", "running", true],
		["pending", "cancelled", true],
		["pending", "failed", true],
		["pending", "completed", false],
		["pending", "blocked", false],
		["running", "blocked", true],
		["running", "completed", true],
		["running", "failed", true],
		["running", "cancelled", true],
		["running", "pending", false],
		["blocked", "running", true],
		["blocked", "failed", true],
		["blocked", "cancelled", true],
		["blocked", "completed", false],
		["failed", "running", true],
		["failed", "completed", false],
		["failed", "cancelled", false],
		["completed", "running", false],
		["completed", "failed", false],
		["cancelled", "running", false],
	];
	for (const [from, to, expected] of cases) {
		it(`${from} -> ${to} is ${expected ? "allowed" : "rejected"}`, () => {
			expect(isAllowedTransition(from, to)).toBe(expected);
		});
	}

	it("terminal states have no outgoing transitions", () => {
		expect(ALLOWED_TRANSITIONS.get("completed")?.size).toBe(0);
		expect(ALLOWED_TRANSITIONS.get("cancelled")?.size).toBe(0);
	});
});
