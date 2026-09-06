import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import subagentExtension from "../extensions/subagent/index.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const originalWorkspaceRoot = process.env.PI_SUBAGENT_WORKSPACE_ROOT;
const roots: string[] = [];

afterEach(() => {
	if (originalWorkspaceRoot === undefined)
		delete process.env.PI_SUBAGENT_WORKSPACE_ROOT;
	else process.env.PI_SUBAGENT_WORKSPACE_ROOT = originalWorkspaceRoot;
	while (roots.length > 0) {
		const root = roots.pop();
		if (root) fs.rmSync(root, { recursive: true, force: true });
	}
});

describe("subagent workspace containment hook", () => {
	it("blocks governed escapes before tool execution without claiming a shell sandbox", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pi-workspace-hook-"));
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pi-workspace-outside-"));
		roots.push(workspace, outside);
		process.env.PI_SUBAGENT_WORKSPACE_ROOT = workspace;
		const pi = createMockPi();
		subagentExtension(pi as Parameters<typeof subagentExtension>[0]);
		const hook = pi._getHook("tool_call")[0]?.handler;
		if (!hook) throw new Error("tool_call containment hook missing");
		const ctx = createMockCtx({ cwd: workspace });

		const escapeResult = await hook(
			{ toolName: "read", input: { path: outside } },
			ctx,
		);
		expect(escapeResult).toMatchObject({
			block: true,
			reason: expect.stringContaining("path_escape"),
		});
		expect(escapeResult.reason).toContain(`workspace: ${workspace}`);
		expect(escapeResult.reason).toContain(`supplied target: ${outside}`);
		expect(escapeResult.reason).toContain(`resolved target: ${outside}`);
		expect(
			await hook({ toolName: "bash", input: { command: `find "${outside}"` } }, ctx),
		).toMatchObject({ block: true, reason: expect.stringContaining("path_escape") });
		const recursiveSearch = { command: "rg needle ." } as {
			command: string;
			timeout?: number;
		};
		expect(
			await hook({ toolName: "bash", input: recursiveSearch }, ctx),
		).toBeUndefined();
		expect(recursiveSearch.timeout).toBe(120);
		const arbitraryCommand = { command: "python -c 'print(1)'" } as {
			command: string;
			timeout?: number;
		};
		expect(
			await hook(
				{ toolName: "bash", input: arbitraryCommand },
				ctx,
			),
		).toBeUndefined();
		expect(arbitraryCommand.timeout).toBeUndefined();
	});
});
