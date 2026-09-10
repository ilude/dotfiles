import { randomUUID, createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { lockSync } from "proper-lockfile";

export type PlanRunState = "launching" | "running" | "waiting" | "blocked" | "unknown";

export interface PlanRun {
	token: string;
	planPath: string;
	pid: number;
	state: PlanRunState;
	tabId?: string;
	paneId?: string;
	sessionId?: string;
}

type RunOwner = Omit<PlanRun, "token" | "planPath">;
type RunPatch = Partial<Omit<PlanRun, "token" | "planPath">>;
export interface PlanRunClaimOptions { replace?: boolean; }

export class PlanRunConflictError extends Error {
	readonly run: PlanRun;

	constructor(run: PlanRun) {
		super(`Plan is already claimed: ${run.planPath}`);
		this.name = "PlanRunConflictError";
		this.run = run;
	}
}

const STATES = new Set<PlanRunState>([
	"launching",
	"running",
	"waiting",
	"blocked",
	"unknown",
]);

function canonicalPath(input: string): string {
	let resolved: string;
	try {
		resolved = fs.realpathSync.native(input);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		resolved = path.resolve(input);
	}
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isDead(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return false;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "ESRCH";
	}
}

function validOptional(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

function parseRun(value: unknown, filePath: string): PlanRun {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Malformed plan run state: ${filePath}`);
	}
	const run = value as Record<string, unknown>;
	if (
		typeof run.token !== "string" ||
		typeof run.planPath !== "string" ||
		!Number.isInteger(run.pid) ||
		(run.pid as number) <= 0 ||
		typeof run.state !== "string" ||
		!STATES.has(run.state as PlanRunState) ||
		!validOptional(run.tabId) ||
		!validOptional(run.paneId) ||
		!validOptional(run.sessionId)
	) {
		throw new Error(`Malformed plan run state: ${filePath}`);
	}
	return run as unknown as PlanRun;
}

export class PlanRunStore {
	private readonly directory: string;

	constructor(directory: string) {
		this.directory = path.resolve(directory);
		fs.mkdirSync(this.directory, { recursive: true });
	}

	get(planPath: string): PlanRun | undefined {
		const canonical = canonicalPath(planPath);
		const filePath = this.filePath(canonical);
		const run = this.read(filePath);
		if (!run) return undefined;
		if (!isDead(run.pid)) return run;

		return this.transaction(() => {
			const current = this.read(filePath);
			if (current && isDead(current.pid)) {
				this.remove(filePath);
				return undefined;
			}
			return current;
		});
	}

	claim(planPath: string, owner: RunOwner, options: PlanRunClaimOptions = {}): PlanRun {
		const canonical = canonicalPath(planPath);
		return this.transaction(() => {
			const filePath = this.filePath(canonical);
			const existing = this.read(filePath);
			if (existing && !isDead(existing.pid) && !options.replace) throw new PlanRunConflictError(existing);
			if (existing) this.remove(filePath);
			this.assertOwner(owner);
			const run: PlanRun = {
				token: randomUUID(),
				planPath: canonical,
				...owner,
			};
			this.write(filePath, run);
			return run;
		});
	}

	update(planPath: string, token: string, patch: RunPatch): PlanRun {
		const canonical = canonicalPath(planPath);
		return this.transaction(() => {
			const filePath = this.filePath(canonical);
			const run = this.read(filePath);
			if (!run || run.token !== token) {
				throw new Error("Plan run token does not match current ownership");
			}
			this.assertPatch(patch);
			const updated = { ...run, ...patch, token: run.token, planPath: run.planPath };
			this.write(filePath, updated);
			return updated;
		});
	}

	release(planPath: string, token: string): void {
		const canonical = canonicalPath(planPath);
		this.transaction(() => {
			const filePath = this.filePath(canonical);
			const run = this.read(filePath);
			if (run?.token === token) this.remove(filePath);
		});
	}

	private filePath(canonical: string): string {
		return path.join(this.directory, `${createHash("sha256").update(canonical).digest("hex")}.json`);
	}

	private read(filePath: string): PlanRun | undefined {
		let raw: string;
		try {
			raw = fs.readFileSync(filePath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
		let value: unknown;
		try {
			value = JSON.parse(raw);
		} catch (error) {
			throw new Error(`Malformed plan run state: ${filePath}`, { cause: error });
		}
		return parseRun(value, filePath);
	}

	private write(filePath: string, run: PlanRun): void {
		const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
		fs.writeFileSync(temporary, `${JSON.stringify(run, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
		try {
			fs.renameSync(temporary, filePath);
		} catch (error) {
			try { fs.unlinkSync(temporary); } catch { /* preserve the original failure */ }
			throw error;
		}
	}

	private remove(filePath: string): void {
		try { fs.unlinkSync(filePath); } catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}

	private transaction<T>(operation: () => T): T {
		const release = lockSync(this.directory, { retries: 0, stale: 10_000 });
		try { return operation(); } finally { release(); }
	}

	private assertOwner(owner: RunOwner): void {
		if (!Number.isInteger(owner.pid) || owner.pid <= 0 || !STATES.has(owner.state)) {
			throw new Error("Invalid plan run owner");
		}
		this.assertPatch(owner);
	}

	private assertPatch(patch: RunPatch): void {
		if (patch.pid !== undefined && (!Number.isInteger(patch.pid) || patch.pid <= 0)) throw new Error("Invalid plan run pid");
		if (patch.state !== undefined && !STATES.has(patch.state)) throw new Error("Invalid plan run state");
		if (!validOptional(patch.tabId) || !validOptional(patch.paneId) || !validOptional(patch.sessionId)) throw new Error("Invalid plan run receipt");
	}
}
