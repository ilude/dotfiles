import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ALLOWED_TRANSITIONS,
	ensureDirectory,
	getDecisionsLogPath,
	getOperatorStateDir,
	getPermissionsDir,
	getTasksDir,
	isAllowedTransition,
	TASK_STATES,
	type TaskState,
	TERMINAL_TASK_STATES,
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
		expect(getOperatorStateDir()).toBe(
			path.join(os.homedir(), ".pi", "agent", "operator"),
		);
	});
});

describe("path helpers", () => {
	it("derives tasks/permissions paths from the state root", () => {
		expect(getTasksDir()).toBe(path.join(tmpRoot, "tasks"));
		expect(getPermissionsDir()).toBe(path.join(tmpRoot, "permissions"));
		expect(getDecisionsLogPath()).toBe(
			path.join(tmpRoot, "permissions", "decisions.jsonl"),
		);
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
	it("lists the five canonical lifecycle states", () => {
		expect(TASK_STATES).toEqual([
			"unassigned",
			"assigned",
			"completed",
			"failed",
			"skipped",
		]);
	});

	it("identifies terminal states", () => {
		expect(TERMINAL_TASK_STATES).toEqual(new Set(["completed", "skipped"]));
		expect(TERMINAL_TASK_STATES.has("failed")).toBe(false);
	});
});

describe("ALLOWED_TRANSITIONS / isAllowedTransition", () => {
	const allowedTransitions: Array<[TaskState, TaskState]> = [
		["unassigned", "assigned"],
		["unassigned", "skipped"],
		["assigned", "unassigned"],
		["assigned", "completed"],
		["assigned", "failed"],
		["assigned", "skipped"],
		["failed", "assigned"],
		["failed", "skipped"],
	];

	it("matches every allowed transition from the plan", () => {
		for (const [from, to] of allowedTransitions) {
			expect(ALLOWED_TRANSITIONS.get(from)?.has(to)).toBe(true);
			expect(isAllowedTransition(from, to)).toBe(true);
		}
	});

	it("allows failed -> assigned as the retry transition", () => {
		expect(isAllowedTransition("failed", "assigned")).toBe(true);
	});

	const rejectedTransitions: Array<[TaskState, TaskState]> = [
		["unassigned", "completed"],
		["assigned", "assigned"],
		["failed", "completed"],
		["completed", "assigned"],
		["skipped", "assigned"],
	];
	for (const [from, to] of rejectedTransitions) {
		it(`${from} -> ${to} is rejected`, () => {
			expect(isAllowedTransition(from, to)).toBe(false);
		});
	}

	it("terminal states have no outgoing transitions", () => {
		for (const state of TERMINAL_TASK_STATES) {
			expect(ALLOWED_TRANSITIONS.get(state)).toEqual(new Set());
		}
	});
});
