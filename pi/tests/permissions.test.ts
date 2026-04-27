import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-permissions-cmd-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

async function loadPermissions() {
	const pi = createMockPi();
	const mod = await import("../extensions/permissions.ts");
	mod.default(pi as any);
	const cmd = pi._commands.find((c) => c.name === "permissions");
	if (!cmd) throw new Error("permissions command not registered");
	return { pi, cmd };
}

describe("parsePermissionsArgs", () => {
	it("treats empty as summary", async () => {
		const mod = await import("../extensions/permissions.ts");
		expect(mod.parsePermissionsArgs("")).toEqual({ verb: "summary" });
	});

	it("recognizes allows / denies / reset", async () => {
		const mod = await import("../extensions/permissions.ts");
		expect(mod.parsePermissionsArgs("allows")).toEqual({ verb: "allows" });
		expect(mod.parsePermissionsArgs("denies")).toEqual({ verb: "denies" });
		expect(mod.parsePermissionsArgs("reset")).toEqual({ verb: "reset" });
	});

	it("recognizes retry with id", async () => {
		const mod = await import("../extensions/permissions.ts");
		expect(mod.parsePermissionsArgs("retry abc12345")).toEqual({
			verb: "retry",
			idArg: "abc12345",
		});
	});

	it("recognizes retry without id (handler warns)", async () => {
		const mod = await import("../extensions/permissions.ts");
		expect(mod.parsePermissionsArgs("retry")).toEqual({ verb: "retry", idArg: undefined });
	});
});

describe("/permissions summary", () => {
	it("shows empty state when registry is fresh", async () => {
		const { cmd } = await loadPermissions();
		const ctx = createMockCtx();
		await cmd.handler("", ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(text).toContain("session approvals (0)");
		expect(text).toContain("recent allows (0)");
		expect(text).toContain("recent denies (0)");
	});

	it("includes session approvals and recent denies", async () => {
		const { addSessionApproval, recordDecision } = await import("../lib/permission-registry.ts");
		addSessionApproval({ pattern: "Bash(git *)", reason: "session trust" });
		recordDecision({
			action: "Bash:rm -rf /",
			outcome: "deny",
			provenance: "rule",
			summary: "dangerous command",
			rule: "rm -rf",
		});

		const { cmd } = await loadPermissions();
		const ctx = createMockCtx();
		await cmd.handler("", ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(text).toContain("Bash(git *)");
		expect(text).toContain("[deny/rule]");
		expect(text).toContain("Bash:rm -rf /");
	});
});

describe("/permissions allows / denies", () => {
	it("filters allow decisions", async () => {
		const { recordDecision } = await import("../lib/permission-registry.ts");
		recordDecision({ action: "Bash:ls", outcome: "allow", provenance: "rule" });
		recordDecision({ action: "Bash:rm", outcome: "deny", provenance: "rule" });

		const { cmd } = await loadPermissions();
		const ctx = createMockCtx();
		await cmd.handler("allows", ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(text).toContain("Bash:ls");
		expect(text).not.toContain("Bash:rm");
	});

	it("filters deny decisions", async () => {
		const { recordDecision } = await import("../lib/permission-registry.ts");
		recordDecision({ action: "Bash:ls", outcome: "allow", provenance: "rule" });
		recordDecision({ action: "Bash:rm", outcome: "deny", provenance: "rule" });

		const { cmd } = await loadPermissions();
		const ctx = createMockCtx();
		await cmd.handler("denies", ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(text).toContain("Bash:rm");
		expect(text).not.toContain("Bash:ls");
	});

	it("notifies empty state when there are no matching decisions", async () => {
		const { cmd } = await loadPermissions();
		const ctx = createMockCtx();
		await cmd.handler("denies", ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(text).toContain("No recent deny decisions");
	});
});

describe("/permissions reset", () => {
	it("clears session approvals", async () => {
		const { addSessionApproval, listSessionApprovals } = await import(
			"../lib/permission-registry.ts"
		);
		addSessionApproval({ pattern: "Bash(git *)" });
		expect(listSessionApprovals().length).toBe(1);

		const { cmd } = await loadPermissions();
		const ctx = createMockCtx();
		await cmd.handler("reset", ctx);

		expect(listSessionApprovals()).toEqual([]);
		expect((ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
			"Session approvals cleared",
		);
	});
});

describe("/permissions retry", () => {
	it("rejects without an id", async () => {
		const { cmd } = await loadPermissions();
		const ctx = createMockCtx();
		await cmd.handler("retry", ctx);
		const calls = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls;
		expect(calls[0][1]).toBe("warning");
		expect(calls[0][0]).toContain("Usage: /permissions retry");
	});

	it("rejects when target was an allow decision", async () => {
		const { recordDecision } = await import("../lib/permission-registry.ts");
		const allow = recordDecision({ action: "Bash:ls", outcome: "allow", provenance: "rule" });

		const { cmd } = await loadPermissions();
		const ctx = createMockCtx();
		await cmd.handler(`retry ${allow.id}`, ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(text).toContain("Only deny decisions can be retried");
	});

	it("warns when there is no replay payload", async () => {
		const { recordDecision } = await import("../lib/permission-registry.ts");
		const deny = recordDecision({ action: "Bash:rm", outcome: "deny", provenance: "rule" });

		const { cmd } = await loadPermissions();
		const ctx = createMockCtx();
		await cmd.handler(`retry ${deny.id}`, ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(text).toContain("no replay payload");
	});

	it("records a replay attempt as a new decision when replayPayload exists", async () => {
		const { listRecentDecisions, recordDecision } = await import(
			"../lib/permission-registry.ts"
		);
		const original = recordDecision({
			action: "Bash:rm",
			outcome: "deny",
			provenance: "rule",
			replayPayload: { command: "rm -rf x" },
		});

		const { cmd } = await loadPermissions();
		const ctx = createMockCtx();
		await cmd.handler(`retry ${original.id}`, ctx);

		const recent = listRecentDecisions();
		expect(recent.length).toBe(2); // original + replay record
		const replay = recent[0];
		expect(replay.id).not.toBe(original.id);
		expect(replay.provenance).toBe("manual_once");
		expect(replay.metadata?.replayOf).toBe(original.id);
	});
});
