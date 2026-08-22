import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	checkNativePathTool,
	checkWorkspaceShellCommand,
	checkWorkspaceTool,
	resolveWorkspaceRoot,
	type WorkspacePolicy,
} from "../extensions/subagent/workspace-policy.ts";

const temporaryRoots: string[] = [];

function temporaryDirectory(prefix: string): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	temporaryRoots.push(directory);
	return directory;
}

function policyFor(root: string): WorkspacePolicy {
	const result = resolveWorkspaceRoot(root);
	expect(result.outcome).toBe("allow");
	if (result.outcome === "deny") throw new Error(result.reason);
	return result.policy;
}

afterEach(() => {
	while (temporaryRoots.length > 0) {
		const root = temporaryRoots.pop();
		if (root) fs.rmSync(root, { recursive: true, force: true });
	}
});

describe("workspace root resolution", () => {
	it("returns a canonical existing non-root workspace and defaults to the parent", () => {
		const parent = temporaryDirectory("pi-workspace-policy-parent-");
		const child = path.join(parent, "child");
		fs.mkdirSync(child);
		const link = path.join(parent, "child-link");
		fs.symlinkSync(child, link, process.platform === "win32" ? "junction" : "dir");

		const result = resolveWorkspaceRoot(parent, link);
		expect(result.outcome).toBe("allow");
		if (result.outcome === "allow") {
			expect(result.workspaceRoot).toBe(fs.realpathSync.native(child));
			const defaultResult = resolveWorkspaceRoot(parent);
			expect(defaultResult.outcome).toBe("allow");
			if (defaultResult.outcome === "allow") {
				expect(defaultResult.workspaceRoot).toBe(fs.realpathSync.native(parent));
			}
		}
	});

	it("allows the parent to select an external workspace", () => {
		const parent = temporaryDirectory("pi-workspace-policy-parent-");
		const outside = temporaryDirectory("pi-workspace-policy-outside-");
		const result = resolveWorkspaceRoot(parent, outside, { allowExternal: true });
		expect(result).toMatchObject({
			outcome: "allow",
			workspaceRoot: fs.realpathSync.native(outside),
		});
		expect(resolveWorkspaceRoot(parent, outside)).toMatchObject({
			outcome: "deny",
			code: "workspace_root_widened",
		});
	});

	it("rejects filesystem roots as parent or requested workspaces", () => {
		const root = path.parse(process.cwd()).root;
		const parent = temporaryDirectory("pi-workspace-policy-parent-");
		expect(resolveWorkspaceRoot(root)).toMatchObject({
			outcome: "deny",
			code: "workspace_root_filesystem_root",
		});
		expect(resolveWorkspaceRoot(parent, root)).toMatchObject({
			outcome: "deny",
			code: "workspace_root_filesystem_root",
		});
	});
});

describe("governed native path tools", () => {
	it("allows canonical paths and missing descendants inside the workspace", () => {
		const root = temporaryDirectory("pi-workspace-policy-native-");
		fs.mkdirSync(path.join(root, "src"));
		const policy = policyFor(root);
		const result = checkNativePathTool(
			policy,
			"write",
			{ path: "src/new/file.ts" },
			root,
		);
		expect(result).toMatchObject({ outcome: "allow", governed: true });
	});

	it("rejects symlink and nearest-existing-ancestor escapes before access", () => {
		const root = temporaryDirectory("pi-workspace-policy-native-");
		const outside = temporaryDirectory("pi-workspace-policy-outside-");
		fs.symlinkSync(
			outside,
			path.join(root, "escape"),
			process.platform === "win32" ? "junction" : "dir",
		);
		const policy = policyFor(root);
		const result = checkNativePathTool(
			policy,
			"write",
			{ path: "escape/missing/file.ts" },
			root,
		);
		expect(result).toMatchObject({ outcome: "deny", code: "path_escape" });
	});

	it("rejects filesystem-root native targets and preserves outside-policy tools", () => {
		const root = temporaryDirectory("pi-workspace-policy-native-");
		const policy = policyFor(root);
		const filesystemRoot = path.parse(root).root;
		expect(checkNativePathTool(policy, "read", { path: filesystemRoot }, root)).toMatchObject({
			outcome: "deny",
			code: "filesystem_root_target",
		});
		expect(checkNativePathTool(policy, "custom_tool", { path: "/outside" }, root)).toMatchObject({
			outcome: "allow",
			governed: false,
			reason: "outside-policy",
		});
	});
});

describe("recognized recursive shell searches", () => {
	it("checks rg, grep recursive forms, and find targets", () => {
		const root = temporaryDirectory("pi-workspace-policy-shell-");
		const outside = temporaryDirectory("pi-workspace-policy-outside-");
		fs.mkdirSync(path.join(root, "src"));
		const policy = policyFor(root);

		expect(checkWorkspaceShellCommand(policy, "rg needle src", root)).toMatchObject({
			outcome: "allow",
			governed: true,
		});
		expect(checkWorkspaceShellCommand(policy, "grep -R needle src", root)).toMatchObject({
			outcome: "allow",
			governed: true,
		});
		expect(checkWorkspaceShellCommand(policy, "grep -R -e needle /outside", root)).toMatchObject({
			outcome: "deny",
			code: "path_escape",
		});
		expect(checkWorkspaceShellCommand(policy, "find src -type f", root)).toMatchObject({
			outcome: "allow",
			governed: true,
		});
		expect(checkWorkspaceShellCommand(policy, `rg needle "${outside}"`, root)).toMatchObject({
			outcome: "deny",
			code: "path_escape",
		});
		expect(checkWorkspaceShellCommand(policy, `grep -r needle "${outside}"`, root)).toMatchObject({
			outcome: "deny",
			code: "path_escape",
		});
		expect(checkWorkspaceShellCommand(policy, `find "${outside}"`, root)).toMatchObject({
			outcome: "deny",
			code: "path_escape",
		});
		const filesystemRoot = path.parse(root).root.replaceAll("\\", "/");
		expect(
			checkWorkspaceShellCommand(policy, `rg needle "${filesystemRoot}"`, root),
		).toMatchObject({ outcome: "deny", code: "filesystem_root_target" });
	});

	it("applies static cd changes before checking recursive targets", () => {
		const root = temporaryDirectory("pi-workspace-policy-shell-");
		const outside = temporaryDirectory("pi-workspace-policy-outside-");
		fs.mkdirSync(path.join(root, "src"));
		const policy = policyFor(root);

		expect(checkWorkspaceShellCommand(policy, "cd src && rg needle .", root)).toMatchObject({
			outcome: "allow",
			governed: true,
		});
		expect(checkWorkspaceShellCommand(policy, `cd "${outside}" && rg needle .`, root)).toMatchObject({
			outcome: "deny",
			code: "path_escape",
		});
	});

	it("rejects unresolved dynamic recursive targets", () => {
		const root = temporaryDirectory("pi-workspace-policy-shell-");
		const policy = policyFor(root);
		expect(checkWorkspaceShellCommand(policy, "rg needle $TARGET", root)).toMatchObject({
			outcome: "deny",
			code: "dynamic_recursive_target",
		});
		expect(checkWorkspaceShellCommand(policy, "grep -r needle src/*.ts", root)).toMatchObject({
			outcome: "deny",
			code: "dynamic_recursive_target",
		});
		expect(checkWorkspaceShellCommand(policy, "cd $DIR && find .", root)).toMatchObject({
			outcome: "deny",
			code: "dynamic_recursive_target",
		});
	});

	it("does not claim arbitrary shell programs are sandboxed", () => {
		const root = temporaryDirectory("pi-workspace-policy-shell-");
		const policy = policyFor(root);
		const result = checkWorkspaceTool(
			policy,
			"bash",
			{ command: "python -c 'open(\"/outside\", \"w\").write(\"x\")'" },
			root,
		);
		expect(result).toMatchObject({
			outcome: "allow",
			governed: false,
			reason: "outside-policy",
		});
	});
});
