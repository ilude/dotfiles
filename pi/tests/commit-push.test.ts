import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitAsyncRunner } from "../lib/commit/git.ts";
import { pushCommit } from "../lib/commit/push.ts";

const repos: string[] = [];

function run(cwd: string, args: string[]) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if ((result.status ?? 1) !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	}
	return result.stdout.trim();
}

function repo() {
	const dir = mkdtempSync(join(tmpdir(), "pi-commit-push-"));
	repos.push(dir);
	run(dir, ["init", "--initial-branch", "main"]);
	run(dir, ["config", "user.email", "pi@example.invalid"]);
	run(dir, ["config", "user.name", "Pi Test"]);
	writeFileSync(join(dir, "file.txt"), "content\n");
	run(dir, ["add", "--", "file.txt"]);
	run(dir, ["commit", "-m", "feat: initial"]);
	return dir;
}

afterEach(() => {
	for (const dir of repos.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("commit push", () => {
	it("pushes only an ahead branch with the expected HEAD", async () => {
		const dir = repo();
		const head = run(dir, ["rev-parse", "HEAD"]);
		const calls: string[][] = [];
		const runner: GitAsyncRunner = vi.fn(async (_cwd, args) => {
			calls.push(args);
			const key = args.join(" ");
			if (key === "rev-parse HEAD") return { code: 0, stdout: `${head}\n`, stderr: "" };
			if (key === "symbolic-ref --short HEAD") return { code: 0, stdout: "main\n", stderr: "" };
			if (key.includes("@{upstream}") && key.startsWith("rev-parse")) {
				return { code: 0, stdout: "origin/main\n", stderr: "" };
			}
			if (key.startsWith("rev-list")) return { code: 0, stdout: "1\t0\n", stderr: "" };
			return { code: 0, stdout: "", stderr: "" };
		});

		await expect(pushCommit(dir, head.slice(0, 12), runner)).resolves.toEqual({
			branch: "main",
			hash: head.slice(0, 12),
			pushed: true,
		});
		expect(calls).toContainEqual(["fetch", "--prune", "origin"]);
		expect(calls).toContainEqual(["push", "--porcelain"]);
		expect(calls.flat()).not.toContain("--force");
	});

	it("refuses to push when the upstream is ahead", async () => {
		const dir = repo();
		const head = run(dir, ["rev-parse", "HEAD"]);
		const runner: GitAsyncRunner = vi.fn(async (_cwd, args) => {
			const key = args.join(" ");
			if (key === "rev-parse HEAD") return { code: 0, stdout: `${head}\n`, stderr: "" };
			if (key === "symbolic-ref --short HEAD") return { code: 0, stdout: "main\n", stderr: "" };
			if (key.includes("@{upstream}") && key.startsWith("rev-parse")) {
				return { code: 0, stdout: "origin/main\n", stderr: "" };
			}
			if (key.startsWith("rev-list")) return { code: 0, stdout: "1\t1\n", stderr: "" };
			return { code: 0, stdout: "", stderr: "" };
		});

		await expect(pushCommit(dir, head, runner)).rejects.toThrow(/behind its upstream/);
		expect(runner).not.toHaveBeenCalledWith(
			dir,
			["push", "--porcelain"],
			undefined,
		);
	});
});
