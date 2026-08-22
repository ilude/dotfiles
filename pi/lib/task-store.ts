import * as fs from "node:fs";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { ensureDirectory, getOperatorStateDir } from "./operator-state.ts";

export interface StoredTask {
	id: string;
	createdAt: string;
	blockedBy?: string[];
	[key: string]: unknown;
}

export type MigrationErrorCode =
	| "locked"
	| "unstable"
	| "invalid"
	| "not_authoritative"
	| "io";

export class TaskMigrationError extends Error {
	readonly code: MigrationErrorCode;
	constructor(code: MigrationErrorCode, message: string) {
		super(message);
		this.name = "TaskMigrationError";
		this.code = code;
	}
}

export function isTaskStoreUnavailable(error: unknown): boolean {
	if (!error || typeof error !== "object" || !("code" in error)) return false;
	const code = (error as { code?: unknown }).code;
	return code === "not_authoritative" || code === "locked";
}

const connections = new Map<string, DatabaseSync>();
const databaseDirectories = new WeakMap<DatabaseSync, string>();
const migrationTransactions = new WeakSet<DatabaseSync>();
const SCHEMA_VERSION = "1";

export function getTaskDatabasePath(operatorDir = getOperatorStateDir()): string {
	return path.join(operatorDir, "tasks.sqlite3");
}

export function migrationLockPath(operatorDir: string): string {
	return path.join(operatorDir, "tasks.migration.lock");
}

export function isMigrationLocked(operatorDir: string): boolean {
	return fs.existsSync(migrationLockPath(operatorDir));
}

function assertMigrationUnlocked(db: DatabaseSync): void {
	const operatorDir = databaseDirectories.get(db);
	if (operatorDir && isMigrationLocked(operatorDir) && !migrationTransactions.has(db))
		throw new TaskMigrationError("locked", "task store is quiesced for migration");
}

function configureDatabase(filename: string, operatorDir: string): DatabaseSync {
	for (const [openFilename, connection] of connections) {
		connection.close();
		connections.delete(openFilename);
	}
	const db = new DatabaseSync(filename);
	db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
	databaseDirectories.set(db, operatorDir);
	connections.set(filename, db);
	return db;
}

function ensureSchema(db: DatabaseSync): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS task_store_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS task_dependencies (
			dependent_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
			prerequisite_id TEXT NOT NULL,
			position INTEGER NOT NULL,
			PRIMARY KEY (dependent_id, prerequisite_id)
		);
		CREATE INDEX IF NOT EXISTS task_dependencies_prerequisite ON task_dependencies(prerequisite_id);
	`);
	db.prepare("INSERT OR IGNORE INTO task_store_metadata(key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION);
}

function databaseAuthority(db: DatabaseSync): string | undefined {
	try {
		const row = db.prepare("SELECT value FROM task_store_metadata WHERE key = 'authority'").get() as { value: string } | undefined;
		return row?.value;
	} catch {
		return undefined;
	}
}

export function openTaskDatabase(operatorDir = getOperatorStateDir()): DatabaseSync {
	if (isMigrationLocked(operatorDir)) throw new TaskMigrationError("locked", "task store is quiesced for migration");
	const filename = getTaskDatabasePath(operatorDir);
	if (!fs.existsSync(filename)) throw new TaskMigrationError("not_authoritative", "SQLite task store is not initialized");
	const existing = connections.get(filename) ?? configureDatabase(filename, operatorDir);
	if (databaseAuthority(existing) !== "sqlite") {
		existing.close();
		connections.delete(filename);
		throw new TaskMigrationError("not_authoritative", "SQLite task store is not authoritative");
	}
	return existing;
}

export function openTaskDatabaseForMigration(operatorDir = getOperatorStateDir()): DatabaseSync {
	ensureDirectory(operatorDir);
	const filename = getTaskDatabasePath(operatorDir);
	const existing = connections.get(filename) ?? configureDatabase(filename, operatorDir);
	ensureSchema(existing);
	return existing;
}

export function initializeTaskStore(operatorDir: string): DatabaseSync {
	if (isMigrationLocked(operatorDir)) throw new TaskMigrationError("locked", "task store is quiesced for migration");
	const db = openTaskDatabaseForMigration(operatorDir);
	withTaskTransaction(db, () => setStoreMetadata("authority", "sqlite", db));
	return db;
}

export function closeTaskDatabase(operatorDir = getOperatorStateDir()): void {
	const filename = getTaskDatabasePath(operatorDir);
	const db = connections.get(filename);
	if (!db) return;
	db.close();
	connections.delete(filename);
}

export function closeAllTaskDatabases(): void {
	for (const [filename, db] of connections) {
		db.close();
		connections.delete(filename);
	}
}

export function taskStoreExists(operatorDir = getOperatorStateDir()): boolean {
	return fs.existsSync(getTaskDatabasePath(operatorDir));
}

export function withTaskTransaction<T>(
	db: DatabaseSync,
	operation: () => T,
	options: { allowMigrationLock?: boolean } = {},
): T {
	if (!options.allowMigrationLock) assertMigrationUnlocked(db);
	db.exec("BEGIN IMMEDIATE");
	if (options.allowMigrationLock) migrationTransactions.add(db);
	try {
		const result = operation();
		db.exec("COMMIT");
		return result;
	} catch (error) {
		try {
			db.exec("ROLLBACK");
		} catch {
			// Preserve the operation error.
		}
		throw error;
	} finally {
		if (options.allowMigrationLock) migrationTransactions.delete(db);
	}
}

export function withTaskReadTransaction<T>(db: DatabaseSync, operation: () => T): T {
	db.exec("BEGIN");
	try {
		const result = operation();
		db.exec("ROLLBACK");
		return result;
	} catch (error) {
		try {
			db.exec("ROLLBACK");
		} catch {
			// Preserve the operation error.
		}
		throw error;
	}
}

export function readStoredTasks(db = openTaskDatabase()): StoredTask[] {
	return db.prepare("SELECT payload FROM tasks ORDER BY created_at DESC, id ASC").all().map((row) =>
		JSON.parse(String((row as { payload: string }).payload)) as StoredTask,
	);
}

export function readStoredTask(id: string, db = openTaskDatabase()): StoredTask | null {
	const row = db.prepare("SELECT payload FROM tasks WHERE id = ?").get(id) as { payload: string } | undefined;
	return row ? (JSON.parse(row.payload) as StoredTask) : null;
}

export function writeStoredTask(record: StoredTask, db = openTaskDatabase()): void {
	assertMigrationUnlocked(db);
	const payload = { ...record };
	delete payload.blocks;
	db.prepare(
		"INSERT INTO tasks(id, created_at, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at, payload=excluded.payload",
	).run(record.id, record.createdAt, JSON.stringify(payload));
	db.prepare("DELETE FROM task_dependencies WHERE dependent_id = ?").run(record.id);
	const insert = db.prepare("INSERT INTO task_dependencies(dependent_id, prerequisite_id, position) VALUES (?, ?, ?)");
	for (const [position, prerequisite] of (record.blockedBy ?? []).entries()) insert.run(record.id, prerequisite, position);
}

export function deleteStoredTask(id: string, db = openTaskDatabase()): void {
	assertMigrationUnlocked(db);
	db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

export function getStoreMetadata(key: string, db = openTaskDatabase()): string | undefined {
	const row = db.prepare("SELECT value FROM task_store_metadata WHERE key = ?").get(key) as { value: string } | undefined;
	return row?.value;
}

export function setStoreMetadata(key: string, value: string, db = openTaskDatabase()): void {
	assertMigrationUnlocked(db);
	db.prepare("INSERT INTO task_store_metadata(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

export interface MigrationResult {
	imported: number;
	legacyPath?: string;
}

const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/;

function processIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

export function acquireMigrationLock(operatorDir: string): string {
	ensureDirectory(operatorDir);
	const lock = migrationLockPath(operatorDir);
	try {
		fs.mkdirSync(lock);
		fs.writeFileSync(path.join(lock, "owner"), `${process.pid}\n`, "utf8");
		return lock;
	} catch {
		let pid: number;
		try {
			const value = Number.parseInt(fs.readFileSync(path.join(lock, "owner"), "utf8"), 10);
			if (!Number.isInteger(value) || value <= 0) throw new Error("invalid owner");
			pid = value;
		} catch {
			throw new TaskMigrationError("locked", "migration is locked by another process");
		}
		if (processIsAlive(pid)) throw new TaskMigrationError("locked", "migration is locked by another process");
		const quarantine = `${lock}.stale-${pid}-${process.pid}`;
		try {
			fs.renameSync(lock, quarantine);
			fs.rmSync(quarantine, { recursive: true, force: true });
		} catch {
			throw new TaskMigrationError("locked", "migration lock changed concurrently");
		}
		try {
			fs.mkdirSync(lock);
			fs.writeFileSync(path.join(lock, "owner"), `${process.pid}\n`, "utf8");
			return lock;
		} catch {
			throw new TaskMigrationError("locked", "migration lock changed concurrently");
		}
	}
}
const releaseMigrationLock = (lock: string): void => {
	try {
		fs.rmSync(lock, { recursive: true, force: true });
	} catch {
		// The lock owner is exiting; a failed cleanup is reported by the next run.
	}
};

export function establishMigrationWriteBarrier(db: DatabaseSync): void {
	try {
		withTaskTransaction(db, () => undefined, { allowMigrationLock: true });
	} catch (error) {
		throw new TaskMigrationError("locked", `SQLite writers did not drain before migration: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function migrationFailure(error: unknown, fallback: MigrationErrorCode = "io"): TaskMigrationError {
	if (error instanceof TaskMigrationError) return error;
	return new TaskMigrationError(fallback, error instanceof Error ? error.message : String(error));
}

function legacySnapshot(tasksDir: string): StoredTask[] {
	if (!fs.existsSync(tasksDir)) return [];
	const entries = fs.readdirSync(tasksDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
	const records: StoredTask[] = [];
	const ids = new Set<string>();
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".json"))
			throw new TaskMigrationError("invalid", `unsupported legacy entry: ${entry.name}`);
		const filenameId = entry.name.slice(0, -5);
		if (!VALID_ID.test(filenameId)) throw new TaskMigrationError("invalid", `unsafe legacy task filename: ${entry.name}`);
		const file = path.join(tasksDir, entry.name);
		const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
			throw new TaskMigrationError("invalid", `unsupported task record: ${entry.name}`);
		const record = parsed as StoredTask;
		if (record.id !== filenameId || !VALID_ID.test(record.id) || ids.has(record.id))
			throw new TaskMigrationError("invalid", `duplicate or unsafe task id: ${entry.name}`);
		if (typeof record.createdAt !== "string") throw new TaskMigrationError("invalid", `unsupported task record: ${entry.name}`);
		if (record.parentId !== undefined && (typeof record.parentId !== "string" || !VALID_ID.test(record.parentId)))
			throw new TaskMigrationError("invalid", `unsafe parent task id: ${entry.name}`);
		if (record.blocks !== undefined && (!Array.isArray(record.blocks) || record.blocks.some((id) => typeof id !== "string" || !VALID_ID.test(id))))
			throw new TaskMigrationError("invalid", `unsafe reverse dependency id: ${entry.name}`);
		if (record.blockedBy !== undefined) {
			if (!Array.isArray(record.blockedBy) || record.blockedBy.some((id) => typeof id !== "string" || !VALID_ID.test(id)))
				throw new TaskMigrationError("invalid", `unsafe dependency id: ${entry.name}`);
			if (new Set(record.blockedBy).size !== record.blockedBy.length)
				throw new TaskMigrationError("invalid", `duplicate dependencies: ${entry.name}`);
		}
		ids.add(record.id);
		records.push({ ...record, ...(record.blockedBy === undefined ? {} : { blockedBy: [...record.blockedBy] }) });
	}
	return records;
}

function assertStable(tasksDir: string, snapshot: readonly StoredTask[]): void {
	if (JSON.stringify(legacySnapshot(tasksDir)) !== JSON.stringify(snapshot))
		throw new TaskMigrationError("unstable", "legacy task directory changed during migration");
}

function assertNoCycles(records: readonly StoredTask[]): void {
	const graph = new Map(records.map((record) => [record.id, record.blockedBy ?? []]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visited.has(id) || !graph.has(id)) return;
		if (visiting.has(id)) throw new TaskMigrationError("invalid", "dependency cycle rejected");
		visiting.add(id);
		for (const blocker of graph.get(id) ?? []) visit(blocker);
		visiting.delete(id);
		visited.add(id);
	};
	for (const id of graph.keys()) visit(id);
}

function renameForImport(tasksDir: string, legacyPath: string): void {
	if (!fs.existsSync(tasksDir)) return;
	if (fs.existsSync(legacyPath)) throw new TaskMigrationError("unstable", "legacy rollback directory already exists");
	fs.renameSync(tasksDir, legacyPath);
}

export interface ImportOptions {
	beforeCutover?: () => void;
}

export function importLegacyTasks(operatorDir: string, options: ImportOptions = {}): MigrationResult {
	const lock = acquireMigrationLock(operatorDir);
	let renamed = false;
	const tasksDir = path.join(operatorDir, "tasks");
	const legacyPath = `${tasksDir}.legacy`;
	try {
		const db = openTaskDatabaseForMigration(operatorDir);
		establishMigrationWriteBarrier(db);
		if (getStoreMetadata("authority", db) === "sqlite") return { imported: readStoredTasks(db).length };
		if (fs.existsSync(tasksDir) && fs.existsSync(legacyPath))
			throw new TaskMigrationError("unstable", "legacy source and rollback directory both exist");
		const sourceDir = fs.existsSync(tasksDir) ? tasksDir : legacyPath;
		const records = legacySnapshot(sourceDir);
		assertNoCycles(records);
		assertStable(sourceDir, records);
		options.beforeCutover?.();
		assertStable(sourceDir, records);
		if (sourceDir === tasksDir) {
			renameForImport(tasksDir, legacyPath);
			renamed = true;
		}
		try {
			withTaskTransaction(db, () => {
				for (const record of records) writeStoredTask(record, db);
				setStoreMetadata("legacy_snapshot", JSON.stringify(records), db);
				setStoreMetadata("authority", "sqlite", db);
			}, { allowMigrationLock: true });
		} catch (error) {
			if (renamed && !fs.existsSync(tasksDir) && fs.existsSync(legacyPath)) fs.renameSync(legacyPath, tasksDir);
			throw error;
		}
		return { imported: records.length, legacyPath };
	} catch (error) {
		throw migrationFailure(error, "invalid");
	} finally {
		releaseMigrationLock(lock);
	}
}

function recoverExportRollback(operatorDir: string, target: string): void {
	if (fs.existsSync(target)) return;
	const rollback = fs.readdirSync(operatorDir).filter((name) => name.startsWith("tasks.rollback-")).sort().at(-1);
	if (rollback) fs.renameSync(path.join(operatorDir, rollback), target);
}

function writeLegacySnapshot(operatorDir: string, records: readonly StoredTask[]): string {
	const target = path.join(operatorDir, "tasks");
	recoverExportRollback(operatorDir, target);
	const staged = path.join(operatorDir, `.tasks-export-${process.pid}`);
	fs.rmSync(staged, { recursive: true, force: true });
	fs.mkdirSync(staged, { recursive: true });
	try {
		for (const record of records) {
			if (!VALID_ID.test(record.id) || typeof record.createdAt !== "string") throw new TaskMigrationError("invalid", `unrepresentable task record: ${record.id}`);
			if (record.parentId !== undefined && (typeof record.parentId !== "string" || !VALID_ID.test(record.parentId))) throw new TaskMigrationError("invalid", `unrepresentable parent task id: ${record.id}`);
			if (record.blockedBy !== undefined && (!Array.isArray(record.blockedBy) || record.blockedBy.some((id) => typeof id !== "string" || !VALID_ID.test(id)))) throw new TaskMigrationError("invalid", `unrepresentable dependency id: ${record.id}`);
			fs.writeFileSync(path.join(staged, `${record.id}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
		}
		const rollback = `${target}.rollback-${Date.now()}-${process.pid}`;
		let moved = false;
		try {
			if (fs.existsSync(target)) {
				fs.renameSync(target, rollback);
				moved = true;
			}
			fs.renameSync(staged, target);
		} catch (error) {
			if (moved && !fs.existsSync(target)) fs.renameSync(rollback, target);
			throw error;
		}
		return target;
	} catch (error) {
		if (!(error instanceof TaskMigrationError)) throw new TaskMigrationError("io", error instanceof Error ? error.message : String(error));
		throw error;
	}
}

export function exportLegacyTasks(operatorDir: string): MigrationResult {
	const lock = acquireMigrationLock(operatorDir);
	try {
		if (!fs.existsSync(getTaskDatabasePath(operatorDir))) throw new TaskMigrationError("not_authoritative", "SQLite task store is not initialized");
		const db = openTaskDatabaseForMigration(operatorDir);
		establishMigrationWriteBarrier(db);
		if (getStoreMetadata("authority", db) !== "sqlite") throw new TaskMigrationError("not_authoritative", "SQLite store is not authoritative");
		const records = withTaskReadTransaction(db, () => readStoredTasks(db));
		const legacyPath = writeLegacySnapshot(operatorDir, records);
		return { imported: records.length, legacyPath };
	} catch (error) {
		throw migrationFailure(error);
	} finally {
		releaseMigrationLock(lock);
	}
}
