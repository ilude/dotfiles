import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

export interface PreparedPlanRun {
	version: 1;
	specRelativePath: string;
	specStub: string;
	taskWorktreePath: string;
	taskBranch: string;
	originCheckoutPath: string;
	originBranch: string;
	startingTargetCommit: string;
}

export interface PreparePlanRunInput {
	originCheckoutPath: string;
	specRelativePath: string;
	taskWorktreePath?: string;
	taskBranch?: string;
}

const RECORD_NAME = ".pi-plan-run.json";

interface SourceSpecSnapshot {
	version: 1;
	files: Array<{ path: string; sha256: string } | { path: string; symlinkTarget: string }>;
}

function snapshotSpecDirectory(directory: string): SourceSpecSnapshot {
	const files: SourceSpecSnapshot["files"] = [];
	const visit = (current: string, relative = "") => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const entryPath = relative ? `${relative}/${entry.name}` : entry.name;
			if (entryPath === RECORD_NAME) continue;
			const absolute = path.join(current, entry.name);
			if (entry.isDirectory()) visit(absolute, entryPath);
			else if (entry.isFile()) files.push({ path: entryPath, sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex") });
			else if (entry.isSymbolicLink()) files.push({ path: entryPath, symlinkTarget: readlinkSync(absolute) });
		}
	};
	visit(directory);
	files.sort((a, b) => a.path.localeCompare(b.path));
	return { version: 1, files };
}

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function parseReceipt(value: unknown): PreparedPlanRun | undefined {
	if (!value || typeof value !== "object") return;
	const record = value as Record<string, unknown>;
	const keys: (keyof PreparedPlanRun)[] = ["specRelativePath", "specStub", "taskWorktreePath", "taskBranch", "originCheckoutPath", "originBranch", "startingTargetCommit"];
	if (record.version !== 1 || keys.some((key) => typeof record[key] !== "string" || !(record[key] as string).length)) return;
	return { version: 1, specRelativePath: record.specRelativePath as string, specStub: record.specStub as string, taskWorktreePath: record.taskWorktreePath as string, taskBranch: record.taskBranch as string, originCheckoutPath: record.originCheckoutPath as string, originBranch: record.originBranch as string, startingTargetCommit: record.startingTargetCommit as string };
}

export function readPreparedPlanRun(specDirectory: string): PreparedPlanRun | undefined {
	const recordFile = path.join(specDirectory, RECORD_NAME);
	if (!existsSync(recordFile)) return undefined;
	try {
		const record = parseReceipt(JSON.parse(readFileSync(recordFile, "utf8")));
		if (!record) throw new Error("invalid receipt shape");
		return record;
	} catch (error) {
		throw new Error(`Corrupt prepared-run record ${recordFile}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

export function preparePlanRun(input: PreparePlanRunInput): PreparedPlanRun {
	const origin = path.resolve(input.originCheckoutPath);
	const relative = input.specRelativePath.replace(/\\/g, "/");
	const spec = path.resolve(origin, relative);
	if (path.isAbsolute(relative) || relative.split("/").length !== 3 || relative.split("/")[0] !== ".specs" || relative.split("/")[1] === "" || relative.split("/")[1] === "." || relative.split("/")[1] === ".." || path.basename(relative) !== "plan.md" || !existsSync(spec)) throw new Error(`Selected plan must be an existing .specs/<stub>/plan.md: ${input.specRelativePath}`);
	const specDir = path.dirname(spec), stub = path.basename(specDir);
	const recordFile = path.join(specDir, RECORD_NAME);
	const existing = readPreparedPlanRun(specDir);
	if (existing) {
		if (existing.specRelativePath !== relative || existing.specStub !== stub || path.resolve(existing.originCheckoutPath) !== origin) throw new Error(`Prepared-run record does not match selected plan/origin: ${recordFile}`);
		const worktree = path.resolve(existing.taskWorktreePath);
		if (input.taskWorktreePath !== undefined && path.resolve(origin, input.taskWorktreePath) !== worktree) throw new Error(`Explicit task worktree path does not match prepared-run record: ${path.resolve(origin, input.taskWorktreePath)} != ${worktree}`);
		if (input.taskBranch !== undefined && input.taskBranch !== existing.taskBranch) throw new Error(`Explicit task branch does not match prepared-run record: ${input.taskBranch} != ${existing.taskBranch}`);
		if (!existsSync(worktree) || path.resolve(git(worktree, "rev-parse", "--show-toplevel")) !== realpathSync(worktree) || git(worktree, "branch", "--show-current") !== existing.taskBranch) throw new Error(`Recorded task coordinates do not match an existing Git worktree and branch: ${worktree} (${existing.taskBranch})`);
		const originRoot = path.resolve(git(origin, "rev-parse", "--show-toplevel"));
		const commonDir = path.resolve(worktree, git(worktree, "rev-parse", "--git-common-dir"));
		const originCommonDir = path.resolve(origin, git(origin, "rev-parse", "--git-common-dir"));
		if (originRoot !== origin || commonDir !== originCommonDir) throw new Error(`Recorded task worktree does not belong to selected origin repository: ${worktree}`);
		const registered = git(origin, "worktree", "list", "--porcelain").split(/\r?\n/).some((line) => line.startsWith("worktree ") && path.resolve(line.slice("worktree ".length)) === realpathSync(worktree));
		if (!registered) throw new Error(`Recorded task path is not a registered worktree of selected origin: ${worktree}`);
		if (!existsSync(path.join(worktree, relative))) throw new Error(`Recorded worktree is missing the selected plan: ${path.join(worktree, relative)}`);
		return { ...existing, taskWorktreePath: worktree };
	}
	const originRoot = path.resolve(git(origin, "rev-parse", "--show-toplevel"));
	if (originRoot !== origin) throw new Error(`Origin must be the repository root: ${origin}`);
	const originBranch = git(origin, "branch", "--show-current");
	if (!originBranch) throw new Error("Origin checkout is detached; cannot record an integration branch");
	const startingTargetCommit = git(origin, "rev-parse", "HEAD");
	const taskWorktreePath = path.resolve(origin, input.taskWorktreePath ?? path.join(".worktrees", stub));
	const taskBranch = input.taskBranch ?? `task/${stub}`;
	if (existsSync(taskWorktreePath)) throw new Error(`Task path is occupied but has no verified preparation record: ${taskWorktreePath}`);
	try { git(origin, "show-ref", "--verify", "--quiet", `refs/heads/${taskBranch}`); throw new Error(`Task branch is already occupied without a verified preparation record: ${taskBranch}`); }
	catch (error) { if (error instanceof Error && error.message.includes("already occupied")) throw error; }
	mkdirSync(path.dirname(taskWorktreePath), { recursive: true });
	git(origin, "worktree", "add", "-b", taskBranch, taskWorktreePath, startingTargetCommit);
	try {
		const sourceSpecSnapshot = snapshotSpecDirectory(specDir);
		cpSync(specDir, path.join(taskWorktreePath, path.relative(origin, specDir)), { recursive: true, force: true, verbatimSymlinks: true });
		const receipt: PreparedPlanRun = { version: 1, specRelativePath: relative, specStub: stub, taskWorktreePath, taskBranch, originCheckoutPath: origin, originBranch, startingTargetCommit };
		const rawRecord = { ...receipt, sourceSpecSnapshot };
		const serialized = `${JSON.stringify(rawRecord, null, 2)}\n`;
		writeFileSync(recordFile, serialized, { flag: "wx" });
		writeFileSync(path.join(taskWorktreePath, path.relative(origin, recordFile)), serialized, { flag: "wx" });
		return receipt;
	} catch (error) {
		throw new Error(`Prepared Git worktree but could not carry/register plan; retained at ${taskWorktreePath}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
