import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { createTask, createTaskBatch, getTask, updateAndTransitionTask } from "../lib/task-registry.js";
import { closeTaskDatabase, exportLegacyTasks, getStoreMetadata, importLegacyTasks, initializeTaskStore, migrationLockPath, openTaskDatabase, openTaskDatabaseForMigration, readStoredTasks, TaskMigrationError, withTaskTransaction } from "../lib/task-store.js";
import { migrationExitCode } from "../scripts/task-store-migrate.ts";

let operatorDir: string;
const migrateScript = path.resolve("scripts/task-store-migrate.ts");

afterEach(() => {
	if (operatorDir) closeTaskDatabase(operatorDir);
	if (operatorDir) fs.rmSync(operatorDir, { recursive: true, force: true });
	delete process.env.PI_OPERATOR_DIR;
});

function runCli(...args: string[]) {
	return spawnSync(process.execPath, ["--experimental-strip-types", migrateScript, ...args], { encoding: "utf8" });
}

function childResult(child: ReturnType<typeof spawn>): Promise<{ status: number | null; stdout: string; stderr: string }> {
	let stdout = "";
	let stderr = "";
	child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
	child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
	return once(child, "close").then(([status]) => ({ status: status as number | null, stdout, stderr }));
}

describe("SQLite task store T1", () => {
	it("requires explicit SQLite authority for normal registry access", () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		process.env.PI_OPERATOR_DIR = operatorDir;
		expect(() => createTask({ origin: "other", summary: "before authority" })).toThrow(/not initialized/);
		expect(fs.existsSync(path.join(operatorDir, "tasks.sqlite3"))).toBe(false);
	});

	it("serializes batch writes and rolls back every record", () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		initializeTaskStore(operatorDir);
		process.env.PI_OPERATOR_DIR = operatorDir;
		const result = createTaskBatch([
			{ origin: "other", summary: "one", key: "one" },
			{ origin: "other", summary: "two", blockedByKeys: ["one"] },
		], "/workspace", { beforeWrite: (() => { let count = 0; return () => { count += 1; if (count === 2) throw new Error("injected"); }; })() });
		expect(result).toMatchObject({ outcome: "write_failed", persistedIds: [] });
		expect(readStoredTasks(openTaskDatabase(operatorDir))).toEqual([]);
	});

	it("rolls back an update-plus-transition when the transition is invalid", () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		initializeTaskStore(operatorDir);
		process.env.PI_OPERATOR_DIR = operatorDir;
		const task = createTask({ origin: "other", summary: "before" });
		expect(() => updateAndTransitionTask(task.id, { summary: "after" }, "completed")).toThrow(/invalid transition/);
		expect(getTask(task.id)?.summary).toBe("before");
	});

	it("ignores known legacy atomic-write residue during import", () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		const tasksDir = path.join(operatorDir, "tasks");
		fs.mkdirSync(path.join(tasksDir, "output"), { recursive: true });
		const record = { id: "residue", createdAt: "2026-01-01T00:00:00.000Z", summary: "legacy" };
		fs.writeFileSync(path.join(tasksDir, "residue.json"), `${JSON.stringify(record)}\n`, "utf8");
		fs.writeFileSync(path.join(tasksDir, "residue.json.1234.tmp"), "partial", "utf8");
		fs.writeFileSync(path.join(tasksDir, "residue.json.1234.abc-def.tmp"), "partial", "utf8");

		expect(importLegacyTasks(operatorDir).imported).toBe(1);
		expect(readStoredTasks(openTaskDatabase(operatorDir))).toEqual([record]);
		expect(fs.existsSync(path.join(operatorDir, "tasks.legacy", "residue.json.1234.tmp"))).toBe(true);
		expect(fs.existsSync(path.join(operatorDir, "tasks.legacy", "output"))).toBe(true);
	});

	it("preserves omitted blockedBy through import and export", () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		const tasksDir = path.join(operatorDir, "tasks");
		fs.mkdirSync(tasksDir, { recursive: true });
		const record = { id: "omitted", createdAt: "2026-01-01T00:00:00.000Z", summary: "legacy" };
		fs.writeFileSync(path.join(tasksDir, "omitted.json"), `${JSON.stringify(record)}\n`, "utf8");
		expect(importLegacyTasks(operatorDir).imported).toBe(1);
		expect(readStoredTasks(openTaskDatabase(operatorDir))).toEqual([record]);
		expect(exportLegacyTasks(operatorDir).imported).toBe(1);
		expect(JSON.parse(fs.readFileSync(path.join(tasksDir, "omitted.json"), "utf8"))).toEqual(record);
	});

	it("rejects unsafe imported filenames before authority changes", () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		const tasksDir = path.join(operatorDir, "tasks");
		fs.mkdirSync(tasksDir, { recursive: true });
		fs.writeFileSync(path.join(tasksDir, "unsafe id.json"), JSON.stringify({ id: "unsafe id", createdAt: "now" }), "utf8");
		expect(() => importLegacyTasks(operatorDir)).toThrow(/unsafe/);
		expect(fs.existsSync(tasksDir)).toBe(true);
		expect(getStoreMetadata("authority", openTaskDatabaseForMigration(operatorDir))).toBeUndefined();
	});

	it("refuses an unstable legacy snapshot without changing authority", () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		const tasksDir = path.join(operatorDir, "tasks");
		fs.mkdirSync(tasksDir, { recursive: true });
		fs.writeFileSync(path.join(tasksDir, "x.json"), JSON.stringify({ id: "x", createdAt: "now" }), "utf8");
		expect(() => importLegacyTasks(operatorDir, {
			beforeCutover: () => fs.writeFileSync(path.join(tasksDir, "x.json"), JSON.stringify({ id: "x", createdAt: "changed" }), "utf8"),
		})).toThrow(/changed during migration/);
		expect(fs.existsSync(tasksDir)).toBe(true);
		expect(getStoreMetadata("authority", openTaskDatabaseForMigration(operatorDir))).toBeUndefined();
	});

	it("restores the legacy directory when the SQLite import transaction fails", () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		const tasksDir = path.join(operatorDir, "tasks");
		fs.mkdirSync(tasksDir, { recursive: true });
		fs.writeFileSync(path.join(tasksDir, "x.json"), JSON.stringify({ id: "x", createdAt: "now" }), "utf8");
		const db = openTaskDatabaseForMigration(operatorDir);
		db.exec("CREATE TRIGGER reject_x BEFORE INSERT ON tasks WHEN NEW.id = 'x' BEGIN SELECT RAISE(ABORT, 'injected'); END");
		expect(() => importLegacyTasks(operatorDir)).toThrow(/injected/);
		expect(fs.existsSync(tasksDir)).toBe(true);
		expect(fs.existsSync(`${tasksDir}.legacy`)).toBe(false);
		expect(getStoreMetadata("authority", db)).toBeUndefined();
	});

	it("waits for pre-lock SQLite writers before taking the export snapshot", async () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		initializeTaskStore(operatorDir);
		const dbPath = path.join(operatorDir, "tasks.sqlite3");
		const holder = spawn(process.execPath, ["-e", "const fs=require('node:fs'); const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync(process.argv[1]); d.exec(\"PRAGMA busy_timeout=5000\"); d.exec('BEGIN IMMEDIATE'); d.prepare('INSERT INTO tasks VALUES (?, ?, ?)').run('drained','now',JSON.stringify({id:'drained',createdAt:'now'})); const watcher=fs.watch(process.argv[2],(_,name)=>{if(name==='tasks.migration.lock'){watcher.close();d.exec('COMMIT');d.close()}}); console.log('ready');", dbPath, operatorDir], { stdio: ["ignore", "pipe", "pipe"] });
		await once(holder.stdout!, "data");
		exportLegacyTasks(operatorDir);
		expect((await childResult(holder)).status).toBe(0);
		expect(fs.existsSync(path.join(operatorDir, "tasks", "drained.json"))).toBe(true);
	});

	it("uses one migration lock to quiesce normal mutations", () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		fs.mkdirSync(migrationLockPath(operatorDir));
		expect(runCli("export", "--operator-dir", operatorDir).status).toBe(3);
		process.env.PI_OPERATOR_DIR = operatorDir;
		expect(() => createTask({ origin: "other", summary: "blocked by lock" })).toThrow(/quiesced/);
	});

	it("recovers a migration lock left by a terminated migrator", async () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		const migrator = spawn(process.execPath, ["-e", "import('./lib/task-store.ts').then(({acquireMigrationLock})=>{ acquireMigrationLock(process.argv[1]); console.log('ready'); process.stdin.resume(); })", operatorDir], { cwd: path.resolve("."), stdio: ["ignore", "pipe", "pipe"] });
		await once(migrator.stdout!, "data");
		migrator.kill();
		expect((await childResult(migrator)).status).not.toBe(0);
		const tasksDir = path.join(operatorDir, "tasks");
		fs.mkdirSync(tasksDir, { recursive: true });
		fs.writeFileSync(path.join(tasksDir, "recovered.json"), JSON.stringify({ id: "recovered", createdAt: "now" }), "utf8");
		expect(importLegacyTasks(operatorDir).imported).toBe(1);
	});

	it("serializes simultaneous real-process writers and exposes only committed rows", async () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		const dbPath = path.join(operatorDir, "tasks.sqlite3");
		const setup = "const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync(process.argv[1]); d.exec(\"PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS task_store_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL); INSERT OR IGNORE INTO task_store_metadata VALUES ('authority','sqlite');\");";
		const releasePath = path.join(operatorDir, 'release');
		const holder = spawn(process.execPath, ["-e", `${setup} const fs=require('node:fs'); d.exec('BEGIN IMMEDIATE'); d.prepare('INSERT INTO tasks VALUES (?, ?, ?)').run('holder','now',JSON.stringify({id:'holder',createdAt:'now'})); const watcher=fs.watch(process.argv[2],(_,name)=>{if(name==='release'){watcher.close();d.exec('COMMIT');d.close()}}); console.log('ready');`, dbPath, operatorDir], { stdio: ["ignore", "pipe", "pipe"] });
		const holderOutput = childResult(holder);
		await once(holder.stdout!, "data");
		const writer = spawn(process.execPath, ["-e", `console.log('started'); ${setup} d.exec('BEGIN IMMEDIATE'); d.prepare('INSERT INTO tasks VALUES (?, ?, ?)').run('writer','now',JSON.stringify({id:'writer',createdAt:'now'})); d.exec('COMMIT'); d.close();`, dbPath], { stdio: ["ignore", "pipe", "pipe"] });
		await once(writer.stdout!, "data");
		fs.writeFileSync(releasePath, "release");
		const writerResult = await childResult(writer);
		const holderResult = await holderOutput;
		expect(holderResult.status).toBe(0);
		expect(writerResult.status).toBe(0);
		const db = openTaskDatabase(operatorDir);
		expect(readStoredTasks(db).map((task) => task.id).sort()).toEqual(["holder", "writer"]);
	});

	it("has no dirty reads and recovers after terminated writer processes", async () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		const dbPath = path.join(operatorDir, "tasks.sqlite3");
		const setup = "const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync(process.argv[1]); d.exec(\"PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS task_store_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL); INSERT OR IGNORE INTO task_store_metadata VALUES ('authority','sqlite');\");";
		const holder = spawn(process.execPath, ["-e", `${setup} d.exec('BEGIN IMMEDIATE'); d.prepare('INSERT INTO tasks VALUES (?, ?, ?)').run('uncommitted','now','{}'); console.log('ready'); process.stdin.resume();`, dbPath], { stdio: ["ignore", "pipe", "pipe"] });
		await once(holder.stdout!, "data");
		const reader = spawnSync(process.execPath, ["-e", "const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync(process.argv[1]); console.log(d.prepare('SELECT count(*) AS count FROM tasks').get().count); d.close();", dbPath], { encoding: "utf8" });
		expect(reader.stdout.trim()).toBe("0");
		holder.kill();
		await childResult(holder);
		const db = openTaskDatabase(operatorDir);
		withTaskTransaction(db, () => db.prepare("INSERT INTO tasks VALUES (?, ?, ?)").run("reopened", "now", JSON.stringify({ id: "reopened", createdAt: "now" })));
		expect(readStoredTasks(db).map((task) => task.id)).toEqual(["reopened"]);
	});

	it("supports Windows-style operator paths and post-cutover JSON semantic equality", () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi task store "));
		const tasksDir = path.join(operatorDir, "tasks");
		fs.mkdirSync(tasksDir, { recursive: true });
		const legacy = { id: "legacy", createdAt: "2026-01-01T00:00:00.000Z", summary: "legacy", metadata: { value: "x" } };
		fs.writeFileSync(path.join(tasksDir, "legacy.json"), `${JSON.stringify(legacy)}\n`, "utf8");
		importLegacyTasks(operatorDir);
		process.env.PI_OPERATOR_DIR = operatorDir;
		const postCutover = createTask({ origin: "other", summary: "post cutover" });
		expect(getTask(postCutover.id)?.summary).toBe("post cutover");
		fs.mkdirSync(tasksDir);
		exportLegacyTasks(operatorDir);
		expect(fs.readdirSync(operatorDir).some((name) => name.startsWith("tasks.rollback-"))).toBe(true);
		const exported = fs.readdirSync(tasksDir).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(fs.readFileSync(path.join(tasksDir, name), "utf8")) as { id: string });
		expect(exported.map((record) => record.id).sort()).toEqual(["legacy", postCutover.id].sort());
		expect(JSON.parse(fs.readFileSync(path.join(tasksDir, "legacy.json"), "utf8"))).toEqual(legacy);
	});

	it("returns distinct documented CLI exit codes", () => {
		operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-store-"));
		expect(runCli("--bad").status).toBe(2);
		fs.mkdirSync(migrationLockPath(operatorDir));
		expect(runCli("import", "--operator-dir", operatorDir).status).toBe(3);
		expect(migrationExitCode(new TaskMigrationError("locked", "test"))).toBe(3);
		fs.rmSync(migrationLockPath(operatorDir), { recursive: true, force: true });
		fs.mkdirSync(path.join(operatorDir, "tasks"));
		fs.mkdirSync(path.join(operatorDir, "tasks.legacy"));
		expect(migrationExitCode(new TaskMigrationError("unstable", "test"))).toBe(4);
		fs.rmSync(path.join(operatorDir, "tasks.legacy"), { recursive: true, force: true });
		fs.writeFileSync(path.join(operatorDir, "tasks", "bad id.json"), "{}", "utf8");
		expect(migrationExitCode(new TaskMigrationError("invalid", "test"))).toBe(5);
		expect(runCli("--help").stdout).toContain("Exit codes:");
	});
});
