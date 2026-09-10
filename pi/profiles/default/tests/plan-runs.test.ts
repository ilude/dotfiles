import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { PlanRunConflictError, PlanRunStore } from "../lib/plan-runs.js";

const dirs: string[] = [];
function fixture() {
	const directory = mkdtempSync(path.join(tmpdir(), "plan-runs-"));
	dirs.push(directory);
	return { directory, plan: path.join(directory, "plan.md"), store: new PlanRunStore(path.join(directory, "registry")) };
}
afterEach(() => { for (const directory of dirs.splice(0)) rmSync(directory, { recursive: true, force: true }); });

const owner = (pid = process.pid) => ({ pid, state: "launching" as const });

describe("PlanRunStore", () => {
	it("claims, updates lifecycle state, and releases by token", () => {
		const { plan, store } = fixture();
		const run = store.claim(plan, owner());
		expect(store.get(plan)).toEqual(run);
		expect(store.update(plan, run.token, { state: "running", sessionId: "s" }).state).toBe("running");
		expect(store.update(plan, run.token, { tabId: "tab" }).state).toBe("running");
		store.update(plan, run.token, { state: "waiting" });
		store.update(plan, run.token, { state: "blocked" });
		store.update(plan, run.token, { state: "unknown" });
		store.release(plan, run.token);
		expect(store.get(plan)).toBeUndefined();
	});

	it("uses the same key for aliases", () => {
		const { directory, plan, store } = fixture();
		const alias = path.join(directory, "alias.md");
		writeFileSync(plan, "plan");
		try { symlinkSync(plan, alias); } catch { return; }
		const run = store.claim(alias, owner());
		expect(store.get(plan)?.token).toBe(run.token);
	});

	it("allows only one native concurrent claimant", async () => {
		const { directory, plan } = fixture();
		const registry = path.join(directory, "registry");
		const moduleUrl = pathToFileURL(path.resolve("lib/plan-runs.ts")).href;
		const loader = pathToFileURL(path.resolve("node_modules/tsx/dist/loader.mjs")).href;
		const script = `import { PlanRunStore } from ${JSON.stringify(moduleUrl)}; try { new PlanRunStore(process.env.REGISTRY).claim(process.env.PLAN, { pid: process.pid, state: "launching" }); process.stdout.write("won"); await new Promise((resolve) => setTimeout(resolve, 500)); } catch (error) { process.exitCode = error.name === "PlanRunConflictError" ? 2 : 3; }`;
		const run = () => new Promise<number>((resolve, reject) => {
			const child = spawn(process.execPath, ["--import", loader, "-e", script], { env: { ...process.env, REGISTRY: registry, PLAN: plan }, stdio: ["ignore", "pipe", "pipe"] });
			child.once("error", reject);
			child.once("exit", (code) => resolve(code ?? 3));
		});
		const results = await Promise.all([run(), run()]);
		expect(results.filter((code) => code === 0)).toHaveLength(1);
		expect(results.filter((code) => code !== 0)).toHaveLength(1);
	});

	it("rejects live ownership and fences stale tokens", () => {
		const { plan, store } = fixture();
		const first = store.claim(plan, owner());
		expect(() => store.claim(plan, owner())).toThrow(PlanRunConflictError);
		expect(() => store.update(plan, "stale", { state: "blocked" })).toThrow();
		store.release(plan, "stale");
		expect(store.get(plan)?.token).toBe(first.token);
	});

	it("allows explicit replacement of a live owner while fencing its stale token", () => {
		const { plan, store } = fixture();
		const first = store.claim(plan, { pid: process.pid, state: "launching" });
		const replacement = store.claim(plan, { pid: process.pid, state: "waiting" }, { replace: true });
		expect(replacement.token).not.toBe(first.token);
		expect(() => store.update(plan, first.token, { state: "blocked" })).toThrow();
		store.release(plan, first.token);
		expect(store.get(plan)?.token).toBe(replacement.token);
	});

	it("reclaims a confirmed dead owner", () => {
		const { plan, store } = fixture();
		const dead = store.claim(plan, owner(999999));
		expect(store.get(plan)).toBeUndefined();
		const next = store.claim(plan, owner());
		expect(next.token).not.toBe(dead.token);
	});

	it("fails closed for corrupt and unreadable state", () => {
		const { directory, plan, store } = fixture();
		const run = store.claim(plan, owner());
		const file = path.join(directory, "registry", `${createHash("sha256").update(run.planPath).digest("hex")}.json`);
		writeFileSync(file, "not json");
		expect(() => store.get(plan)).toThrow();
		unlinkSync(file);
		mkdirSync(file);
		expect(() => store.get(plan)).toThrow();
	});
});
