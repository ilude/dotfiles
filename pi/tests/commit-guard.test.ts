/**
 * Behavioral tests for commit-guard.ts.
 *
 * Per Phase 2 plan T2 AC#2: BOTH directions of the block decision must be
 * covered. A forbidden pattern returns `{ block: true, reason: <non-empty> }`;
 * an allowed pattern returns undefined.
 */
import { describe, it, expect } from "vitest";

type ToolCallHook = (event: any, ctx: any) => Promise<any> | any;

class MockPi {
	hooks = new Map<string, ToolCallHook[]>();
	on(event: string, handler: ToolCallHook) {
		const list = this.hooks.get(event) ?? [];
		list.push(handler);
		this.hooks.set(event, list);
	}
}

async function getCommitGuardHook(): Promise<ToolCallHook> {
	const mod = await import("../extensions/commit-guard.ts");
	const pi = new MockPi();
	mod.default(pi as any);
	const hooks = pi.hooks.get("tool_call") ?? [];
	expect(hooks.length).toBe(1);
	return hooks[0];
}

function bashEvent(command: string) {
	return { toolName: "bash", input: { command } };
}

describe("commit-guard extension", () => {
	describe("blocks (forbidden patterns)", () => {
		it("blocks --no-verify with a non-empty reason", async () => {
			const hook = await getCommitGuardHook();
			const result = await hook(bashEvent('git commit --no-verify -m "fix: x"'), {});
			expect(result?.block).toBe(true);
			expect(typeof result?.reason).toBe("string");
			expect(result.reason.length).toBeGreaterThan(0);
		});

		it("blocks commits missing -m with a non-empty reason", async () => {
			const hook = await getCommitGuardHook();
			const result = await hook(bashEvent("git commit"), {});
			expect(result?.block).toBe(true);
			expect(result.reason.length).toBeGreaterThan(0);
		});

		it("blocks non-conventional commit messages with a non-empty reason", async () => {
			const hook = await getCommitGuardHook();
			const result = await hook(bashEvent('git commit -m "just some change"'), {});
			expect(result?.block).toBe(true);
			expect(result.reason.length).toBeGreaterThan(0);
		});
	});

	describe("allows (non-forbidden patterns)", () => {
		it("allows a conventional commit message (returns undefined)", async () => {
			const hook = await getCommitGuardHook();
			const result = await hook(bashEvent('git commit -m "feat: add widget"'), {});
			expect(result).toBeUndefined();
		});

		it("allows scoped conventional commit messages (returns undefined)", async () => {
			const hook = await getCommitGuardHook();
			const result = await hook(bashEvent('git commit -m "fix(auth): close session"'), {});
			expect(result).toBeUndefined();
		});

		it("allows --amend without -m (returns undefined)", async () => {
			const hook = await getCommitGuardHook();
			const result = await hook(bashEvent("git commit --amend"), {});
			expect(result).toBeUndefined();
		});

		it("ignores non-git-commit bash commands (returns undefined)", async () => {
			const hook = await getCommitGuardHook();
			const result = await hook(bashEvent("ls -la"), {});
			expect(result).toBeUndefined();
		});

		it("ignores non-bash tool calls (returns undefined)", async () => {
			const hook = await getCommitGuardHook();
			const result = await hook({ toolName: "read", input: { path: "x" } }, {});
			expect(result).toBeUndefined();
		});
	});
});
