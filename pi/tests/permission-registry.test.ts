import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	addSessionApproval,
	getDecision,
	listRecentDecisions,
	listSessionApprovals,
	PermissionRegistryError,
	purgeSessionApprovalsFile,
	recordDecision,
	removeSessionApproval,
	resetSessionApprovals,
} from "../lib/permission-registry.js";

let tmpRoot: string;
let prevOverride: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-permission-registry-"));
	prevOverride = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOverride === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOverride;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("recordDecision", () => {
	it("appends a decision to the JSONL log", () => {
		const decision = recordDecision({
			action: "Bash:git status",
			outcome: "allow",
			provenance: "rule",
			rule: "Bash(git *)",
		});
		expect(decision.schemaVersion).toBe(1);
		expect(decision.id).toBeDefined();
		expect(decision.recordedAt).toBeDefined();

		const file = path.join(tmpRoot, "permissions", "decisions.jsonl");
		expect(fs.existsSync(file)).toBe(true);
		const lines = fs.readFileSync(file, "utf-8").trim().split("\n");
		expect(lines.length).toBe(1);
		const parsed = JSON.parse(lines[0]);
		expect(parsed.id).toBe(decision.id);
	});

	it("rejects missing action", () => {
		expect(() =>
			// @ts-expect-error -- testing runtime guard
			recordDecision({ outcome: "allow", provenance: "rule" }),
		).toThrow(PermissionRegistryError);
	});

	it("rejects an invalid outcome", () => {
		expect(() =>
			recordDecision({
				action: "Bash:rm -rf /",
				// @ts-expect-error -- testing runtime guard
				outcome: "maybe",
				provenance: "unknown",
			}),
		).toThrow(PermissionRegistryError);
	});
});

describe("listRecentDecisions", () => {
	it("returns newest-first", async () => {
		const a = recordDecision({ action: "Bash:ls", outcome: "allow", provenance: "rule" });
		await new Promise((r) => setTimeout(r, 5));
		const b = recordDecision({ action: "Bash:rm", outcome: "deny", provenance: "manual_once" });
		const got = listRecentDecisions();
		expect(got.map((d) => d.id)).toEqual([b.id, a.id]);
	});

	it("filters by outcome and provenance", () => {
		recordDecision({ action: "Bash:ls", outcome: "allow", provenance: "rule" });
		recordDecision({ action: "Bash:rm", outcome: "deny", provenance: "manual_once" });
		recordDecision({ action: "Bash:cat", outcome: "allow", provenance: "session" });

		expect(listRecentDecisions({ outcome: "deny" }).length).toBe(1);
		expect(listRecentDecisions({ provenance: "session" }).length).toBe(1);
		expect(listRecentDecisions({ outcome: "allow", provenance: "rule" }).length).toBe(1);
	});

	it("respects limit", () => {
		for (let i = 0; i < 5; i++) {
			recordDecision({ action: `Bash:cmd${i}`, outcome: "allow", provenance: "rule" });
		}
		expect(listRecentDecisions({ limit: 3 }).length).toBe(3);
	});

	it("returns [] when log does not exist", () => {
		expect(listRecentDecisions()).toEqual([]);
	});

	it("skips malformed lines instead of poisoning the read", () => {
		const file = path.join(tmpRoot, "permissions", "decisions.jsonl");
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(
			file,
			[
				JSON.stringify({
					schemaVersion: 1,
					id: "valid-1",
					action: "Bash:ls",
					outcome: "allow",
					provenance: "rule",
					recordedAt: new Date().toISOString(),
				}),
				"not json garbage",
				"",
			].join("\n"),
			"utf-8",
		);
		const got = listRecentDecisions();
		expect(got.length).toBe(1);
		expect(got[0].id).toBe("valid-1");
	});
});

describe("getDecision", () => {
	it("looks up a decision by id", () => {
		const recorded = recordDecision({
			action: "Bash:ls",
			outcome: "allow",
			provenance: "rule",
		});
		const found = getDecision(recorded.id);
		expect(found?.id).toBe(recorded.id);
	});

	it("returns null for unknown id", () => {
		recordDecision({ action: "Bash:ls", outcome: "allow", provenance: "rule" });
		expect(getDecision("not-found")).toBeNull();
	});
});

describe("session approvals", () => {
	it("starts empty and lists what was added", () => {
		expect(listSessionApprovals()).toEqual([]);
		const a = addSessionApproval({ pattern: "Bash(git *)", reason: "session trust" });
		expect(a.pattern).toBe("Bash(git *)");
		expect(listSessionApprovals().length).toBe(1);
	});

	it("dedupes by pattern -- re-adding refreshes grantedAt", async () => {
		const first = addSessionApproval({ pattern: "Bash(npm *)" });
		await new Promise((r) => setTimeout(r, 5));
		const second = addSessionApproval({ pattern: "Bash(npm *)" });
		expect(listSessionApprovals().length).toBe(1);
		expect(second.grantedAt > first.grantedAt).toBe(true);
	});

	it("removes by pattern", () => {
		addSessionApproval({ pattern: "Read(*.ts)" });
		expect(removeSessionApproval("Read(*.ts)")).toBe(true);
		expect(removeSessionApproval("Read(*.ts)")).toBe(false);
		expect(listSessionApprovals()).toEqual([]);
	});

	it("resets all approvals", () => {
		addSessionApproval({ pattern: "Bash(git *)" });
		addSessionApproval({ pattern: "Read(**/*.md)" });
		resetSessionApprovals();
		expect(listSessionApprovals()).toEqual([]);
	});

	it("rejects an empty pattern", () => {
		expect(() => addSessionApproval({ pattern: "" })).toThrow(PermissionRegistryError);
	});

	it("purgeSessionApprovalsFile removes the on-disk file", () => {
		addSessionApproval({ pattern: "Bash(git *)" });
		const file = path.join(tmpRoot, "permissions", "session-approvals.json");
		expect(fs.existsSync(file)).toBe(true);
		purgeSessionApprovalsFile();
		expect(fs.existsSync(file)).toBe(false);
	});
});

describe("durable storage", () => {
	it("does not depend on transcript parsing -- writes only to permissions/", () => {
		recordDecision({ action: "Bash:ls", outcome: "allow", provenance: "rule" });
		addSessionApproval({ pattern: "Bash(git *)" });
		const decisionsFile = path.join(tmpRoot, "permissions", "decisions.jsonl");
		const sessionFile = path.join(tmpRoot, "permissions", "session-approvals.json");
		expect(fs.existsSync(decisionsFile)).toBe(true);
		expect(fs.existsSync(sessionFile)).toBe(true);
	});
});
