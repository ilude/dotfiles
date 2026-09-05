import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { getPackageDir, loadSkills } from "@earendil-works/pi-coding-agent";
import { closeTaskDatabase, initializeTaskStore } from "../lib/task-store.ts";
import { discoverSkills } from "../lib/skill-discovery.ts";
import { discoverAgents, resolveAgentSkillPaths, withDispatchSkills } from "../extensions/subagent/agents.ts";
import { READ_TOOL_ALLOWLIST } from "../extensions/subagent/contracts.ts";
import { resolveChildToolAuthority } from "../extensions/subagent/index.ts";
import { prepareSubagentExecution } from "../extensions/subagent/contracts.ts";

const fixtureRoot = path.resolve(import.meta.dirname, "fixtures/test-review");
const stateModule = new URL("../skills/test-review/scripts/state.mjs", import.meta.url);

async function loadStateModule() {
	return import(stateModule.href);
}

describe("test-review loading and authority", () => {
	it("discovers the prompt-shaped skill and keeps calibration fixtures outside test discovery", () => {
		const skill = discoverSkills({ roots: [{ path: path.resolve("skills"), source: "custom" }] }).find(
			(candidate) => candidate.name === "test-review",
		);
		expect(skill?.filePath).toBe(path.resolve("skills/test-review/SKILL.md"));
		expect(fs.existsSync(path.join(fixtureRoot, "shared-command/tests/clusters.test.mjs"))).toBe(true);
		for (const fixture of ["case-01", "case-02", "case-03", "case-04", "case-05", "case-06", "runners/node-test", "runners/vitest", "runners/jest", "runners/typescript"]) {
			expect(fs.existsSync(path.join(fixtureRoot, fixture, "package.json"))).toBe(true);
		}
		expect(fs.existsSync(path.join(fixtureRoot, "controls/safe-hanging-child.mjs"))).toBe(true);
		expect(fs.existsSync(path.join(fixtureRoot, "controls/fake-external-target.mjs"))).toBe(true);
		expect(fixtureRoot).not.toContain(`${path.sep}tests${path.sep}test-review${path.sep}`);
	});

	it("loads the native prompt and skill resources and resolves the reviewer profile without the root skill", async () => {
		const { loadPromptTemplates } = await import(pathToFileURL(path.join(getPackageDir(), "dist/core/prompt-templates.js")).href);
		const templates = loadPromptTemplates({
			cwd: process.cwd(),
			agentDir: path.resolve("."),
			promptPaths: [path.resolve("prompts/test-review.md")],
			includeDefaults: false,
		});
		const template = templates.find((candidate) => candidate.name === "test-review");
		expect(template?.description).toContain("test-suite value");
		expect(template?.content).toContain("Use the `test-review` skill");
		const skills = loadSkills({ cwd: process.cwd(), agentDir: path.resolve("."), skillPaths: [path.resolve("skills/test-review")], includeDefaults: false });
		expect(skills.skills.some((skill) => skill.name === "test-review")).toBe(true);
		const previous = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = path.resolve(".");
		try {
			const agents = discoverAgents(path.resolve("."), "user");
			const reviewer = agents.agents.find((agent) => agent.name === "test-reviewer");
			expect(reviewer).toBeDefined();
			expect(reviewer?.skills).not.toContain("test-review");
			expect(reviewer?.tools).toEqual(["read", "grep", "find", "ls", "log_analytics"]);
			const profileSkills = resolveAgentSkillPaths(reviewer!);
			expect(profileSkills).not.toContain(path.resolve("skills/test-review/SKILL.md"));
			const dispatched = withDispatchSkills(reviewer!, ["testing", "typescript"]);
			const dispatchSkills = resolveAgentSkillPaths(dispatched);
			expect(dispatchSkills).not.toContain(path.resolve("skills/test-review/SKILL.md"));
		} finally {
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
		}
	});

	it("resolves the closed positive read authority for the reviewer", () => {
		const authority = resolveChildToolAuthority(
			{
				name: "test-reviewer",
				description: "closed read",
				systemPrompt: "",
				source: "user",
				filePath: "test-reviewer.md",
				tools: ["read", "grep", "find", "ls", "log_analytics", "bash", "write"],
			},
			{ role: "leaf", depth: 1, hasScopeLease: false, executionKind: "read" },
		);
		expect(authority.tools).toEqual([...READ_TOOL_ALLOWLIST]);
		expect(authority.canDirectlyMutate).toBe(false);
	});
});

describe("test-review representative lifecycle", () => {
	it("uses a real Git revision and fixed reviewer results through report and resume invalidation", async () => {
		const repository = fs.mkdtempSync(path.join(os.tmpdir(), "test-review-repository-"));
		const operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-review-operator-"));
		const previousOperatorDir = process.env.PI_OPERATOR_DIR;
		const previous = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = path.resolve(".");
		process.env.PI_OPERATOR_DIR = operatorDir;
		try {
			initializeTaskStore(operatorDir);
			execFileSync("git", ["init", "-q", "--initial-branch", "main"], { cwd: repository });
			execFileSync("git", ["config", "user.name", "review-test"], { cwd: repository });
			execFileSync("git", ["config", "user.email", "review-test@example.invalid"], { cwd: repository });
			fs.writeFileSync(path.join(repository, "parser.mjs"), "export const parse = (value) => value.trim();\n");
			fs.writeFileSync(path.join(repository, "setup.mjs"), "export const input = ' value ';\n");
			fs.writeFileSync(path.join(repository, "parser.test.mjs"), "import test from 'node:test'; import assert from 'node:assert/strict'; import {parse} from './parser.mjs'; import {input} from './setup.mjs'; test('parser', () => assert.equal(parse(input), 'value')); test('formatter', () => assert.equal(parse(input).toUpperCase(), 'VALUE'));\n");
			fs.writeFileSync(path.join(repository, "control.mjs"), "export const identity = (value) => value;\n");
			execFileSync("git", ["add", "."], { cwd: repository });
			execFileSync("git", ["commit", "-qm", "initial"], { cwd: repository });
			const startingCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
			const commonDir = path.resolve(repository, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: repository, encoding: "utf8" }).trim());
			const reviewer = discoverAgents(path.resolve("."), "user").agents.find((agent) => agent.name === "test-reviewer");
			expect(reviewer).toBeDefined();
			const prepared = prepareSubagentExecution({ kind: "read", items: [{ agent: "test-reviewer", instructions: "Review parser cluster", cwd: repository, requiredReadPaths: [path.join(repository, "parser.mjs")] }] }, { parentCwd: repository });
			expect(prepared.items[0].agent).toEqual(reviewer);
			expect(resolveChildToolAuthority(prepared.items[0].agent, { role: "leaf", depth: 1, hasScopeLease: false, executionKind: "read" }).tools).toEqual([...READ_TOOL_ALLOWLIST]);
			const { initializeState, statePathFor, updateState, readState } = await loadStateModule();
			const args = { commonDir, baselineName: "representative", repositoryId: repository, scopeId: "owned-tests", ownerId: "root-a" };
			const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repository, encoding: "utf8" }).split("\0").filter(Boolean);
			expect(tracked).toEqual(["control.mjs", "parser.mjs", "parser.test.mjs", "setup.mjs"]);
			const initial = await initializeState({ ...args, state: { startingCommit, inventory: [{ id: "parser", tests: ["parser.test.mjs#parser"] }, { id: "formatter", tests: ["parser.test.mjs#formatter"] }, { id: "control", tests: [], exclusion: "independent source control" }], units: [{ id: "parser", status: "pending", inputs: ["parser.mjs", "parser.test.mjs", "setup.mjs"] }, { id: "formatter", status: "pending", inputs: ["parser.mjs", "parser.test.mjs", "setup.mjs"] }, { id: "control", status: "reviewed", reviewedCommit: startingCommit, inputs: ["control.mjs"], evidenceIds: ["control-static"] }] } });
			const statePath = statePathFor(commonDir, args.baselineName);
			const fixedReviewerResult = { status: "complete", candidates: [{ id: "candidate-1", unitId: "parser", outcome: "retain" }], noChange: ["formatter"], contextRequests: [] };
			const started = performance.now();
			const output = execFileSync(process.execPath, ["--test", "parser.test.mjs"], { cwd: repository, timeout: 10_000, encoding: "utf8" });
			const durationMs = performance.now() - started;
			const reviewed = await updateState({ ...args, statePath, update: (state) => ({ ...state, reviewerResult: fixedReviewerResult, units: state.units.map((unit) => unit.id === "parser" || unit.id === "formatter" ? { ...unit, status: "reviewed", reviewedCommit: startingCommit, evidenceIds: ["e-review"], measurementIds: ["measure-shared"] } : unit), measurements: [{ id: "measure-shared", command: "node --test parser.test.mjs", revision: startingCommit, durationMs, runner: process.version, scope: ["parser", "formatter"], inputs: ["parser.mjs", "parser.test.mjs", "setup.mjs"], output, status: "current" }] }) });
			expect(reviewed.units[0].measurementIds).toEqual(reviewed.units[1].measurementIds);
			await expect(updateState({ ...args, statePath, ownerId: "root-b", update: (state) => state })).rejects.toThrow("ownerId mismatch");
			const verified = await updateState({ ...args, statePath, update: (state) => ({ ...state, verification: { candidates: state.reviewerResult.candidates, findings: [], dispositions: [] } }) });
			const reportPath = path.join(path.dirname(statePath), "report.md");
			fs.writeFileSync(reportPath, `# representative\n\n${verified.inventory.map((unit) => `- ${unit.id}`).join('\n')}\n\nShared measurement: measure-shared\n`);
			expect(fs.readFileSync(reportPath, "utf8").split("\n").filter((line) => line.startsWith("- ")).map((line) => line.slice(2))).toEqual(verified.inventory.map((unit) => unit.id));
			const checkpoint = fs.readFileSync(statePath, "utf8");
			await expect(updateState({ ...args, statePath, update: () => { throw new Error("interrupted"); } })).rejects.toThrow("interrupted");
			expect(fs.readFileSync(statePath, "utf8")).toBe(checkpoint);
			fs.appendFileSync(path.join(repository, "setup.mjs"), "export const version = 2;\n");
			execFileSync("git", ["add", "setup.mjs"], { cwd: repository });
			execFileSync("git", ["commit", "-qm", "change shared input"], { cwd: repository });
			const finalCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
			const changedInputs = execFileSync("git", ["diff", "--name-only", startingCommit, finalCommit], { cwd: repository, encoding: "utf8" }).trim().split("\n");
			expect(changedInputs).toEqual(["setup.mjs"]);
			const resumed = await updateState({ ...args, statePath, update: (state) => ({ ...state, comparisons: [{ from: startingCommit, to: finalCommit, changedInputs }], units: state.units.map((unit) => unit.inputs.some((input) => changedInputs.includes(input)) ? { ...unit, status: "pending", reviewedCommit: null, invalidatedBy: changedInputs, evidenceIds: [], measurementIds: [] } : { ...unit, carriedTo: finalCommit }), measurements: state.measurements.map((measurement) => ({ ...measurement, status: "stale", invalidatedBy: changedInputs })) }) });
			expect(initial.startingCommit).toBe(startingCommit);
			expect(resumed.units.find((unit) => unit.id === "parser").status).toBe("pending");
			expect(resumed.units.find((unit) => unit.id === "formatter").status).toBe("pending");
			expect(resumed.units.find((unit) => unit.id === "control")).toMatchObject({ status: "reviewed", evidenceIds: ["control-static"], carriedTo: finalCommit });
			expect(resumed.measurements[0]).toMatchObject({ id: "measure-shared", status: "stale", revision: startingCommit });
			expect((await readState({ ...args, statePath })).measurements).toHaveLength(1);
		} finally {
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
			closeTaskDatabase(operatorDir);
			if (previousOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
			else process.env.PI_OPERATOR_DIR = previousOperatorDir;
			fs.rmSync(operatorDir, { recursive: true, force: true });
			fs.rmSync(repository, { recursive: true, force: true });
		}
	});
});

describe("test-review checkpoint boundary", () => {
	it("initializes exclusively and performs owner-checked atomic updates", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-review-state-"));
		try {
			const { initializeState, statePathFor, updateState, readState } = await loadStateModule();
			const commonDir = path.join(root, "git-common");
			const args = { commonDir, baselineName: "baseline", repositoryId: "repo", scopeId: "owned", ownerId: "owner-a" };
			const [first, second] = await Promise.allSettled([
				initializeState(args),
				initializeState(args),
			]);
			expect([first, second].filter((result) => result.status === "fulfilled")).toHaveLength(1);
			expect([first, second].filter((result) => result.status === "rejected")).toHaveLength(1);
			const statePath = statePathFor(commonDir, "baseline");
			expect(() => statePathFor(commonDir, "../outside")).toThrow(/safe identifier/);
			await updateState({ ...args, statePath, update: (state) => ({
				...state,
				status: "active",
				marker: "kept",
				measurements: [{ id: "measure-1", command: "node --test", durationMs: 12 }],
				units: [
					{ id: "parser", measurementIds: ["measure-1"] },
					{ id: "formatter", measurementIds: ["measure-1"] },
				],
			}) });
			const saved = await readState({ ...args, statePath });
			expect(saved.marker).toBe("kept");
			expect(saved.units[0].measurementIds).toEqual(saved.units[1].measurementIds);
			expect(saved.measurements).toHaveLength(1);
			await expect(updateState({ ...args, statePath, ownerId: "owner-b", update: (state) => state })).rejects.toThrow(/ownerId mismatch/);
			const before = fs.readFileSync(statePath, "utf8");
			await expect(updateState({ ...args, statePath, update: () => { throw new Error("interrupted review"); } })).rejects.toThrow("interrupted review");
			expect(fs.readFileSync(statePath, "utf8")).toBe(before);
			await expect(updateState({ ...args, statePath, update: (state) => {
				const circular = {} as { self?: unknown };
				circular.self = circular;
				return { ...state, circular };
			} })).rejects.toThrow();
			expect(fs.readFileSync(statePath, "utf8")).toBe(before);
			fs.writeFileSync(statePath, "not-json\n");
			await expect(updateState({ ...args, statePath, update: (state) => state })).rejects.toThrow();
			expect(fs.readFileSync(statePath, "utf8")).toBe("not-json\n");
			fs.writeFileSync(statePath, JSON.stringify({ schemaVersion: 99 }) + "\n");
			await expect(readState({ ...args, statePath })).rejects.toThrow(/unsupported state schema/);
			fs.writeFileSync(statePath, before);
			const policyFreeState = await updateState({ ...args, statePath, update: (state) => ({
				...state,
				status: "closed-assessed",
				finalCommit: "r1",
				reconciliation: {},
				inventory: ["parser"],
				units: [{ id: "parser", status: "pending" }],
			}) });
			expect(policyFreeState.units[0].status).toBe("pending");
			await expect(updateState({ ...args, statePath, update: (state) => ({ ...state, ownerId: "owner-b" }) })).rejects.toThrow(/ownerId is immutable/);
			await expect(updateState({ ...args, statePath, update: (state) => ({ ...state, baselineName: "other-baseline" }) })).rejects.toThrow(/baselineName is immutable/);
			const outside = path.join(root, "outside.json");
			fs.writeFileSync(outside, before);
			fs.rmSync(statePath);
			fs.symlinkSync(outside, statePath);
			await expect(readState({ ...args, statePath })).rejects.toThrow(/symbolic link/);
			fs.rmSync(statePath);
			fs.writeFileSync(statePath, before);
			const redirectedRoot = path.join(root, "redirected-review");
			fs.mkdirSync(redirectedRoot);
			fs.rmSync(path.join(commonDir, "test-review"), { recursive: true, force: true });
			fs.symlinkSync(redirectedRoot, path.join(commonDir, "test-review"), "junction");
			await expect(readState({ ...args, statePath })).rejects.toThrow(/outside the canonical/);
			fs.rmSync(path.join(commonDir, "test-review"), { recursive: true, force: true });
			fs.mkdirSync(path.join(commonDir, "test-review", "baseline"), { recursive: true });
			fs.writeFileSync(statePath, before);
			const loopState = await updateState({ ...args, statePath, update: (state) => ({
				...state,
				status: "active",
				inventory: ["parser", "formatter", "control"],
				units: [
					{ id: "parser", status: "reviewed", reviewedCommit: "r1", evidenceIds: ["e1"], measurementIds: ["measure-1"] },
					{ id: "formatter", status: "reviewed", reviewedCommit: "r1", evidenceIds: ["e1"], measurementIds: ["measure-1"] },
					{ id: "control", status: "pending", inputs: ["shared-config@r1"] },
				],
				verification: { findings: [], candidates: ["candidate-1"] },
				report: { inventory: ["parser", "formatter", "control"] },
			}) });
			expect(loopState.units[0].measurementIds).toEqual(loopState.units[1].measurementIds);
			expect(loopState.measurements).toHaveLength(1);
			const resumed = await updateState({ ...args, statePath, update: (state) => ({
				...state,
				units: state.units.map((unit) => unit.id === "control"
					? { ...unit, status: "pending", invalidatedBy: ["shared-config@r2"], carriedEvidenceIds: ["e1"] }
					: unit),
				resume: { from: "r1", changedInputs: ["shared-config@r2"] },
			}) });
			expect(resumed.units.find((unit) => unit.id === "parser").evidenceIds).toEqual(["e1"]);
			expect(resumed.units.find((unit) => unit.id === "control").status).toBe("pending");
			const contention = await Promise.allSettled([
				updateState({ ...args, statePath, update: async (state) => { await new Promise((resolve) => setTimeout(resolve, 20)); return { ...state, writer: "first" }; } }),
				updateState({ ...args, statePath, update: (state) => ({ ...state, writer: "second" }) }),
			]);
			expect(contention.filter((result) => result.status === "rejected")).toHaveLength(1);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
