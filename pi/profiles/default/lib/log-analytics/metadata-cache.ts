import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Stats } from "node:fs";

export type FileMarker = {
	size: number;
	mtimeMs: number;
	ctimeMs: number;
	dev: number;
	ino: number;
};
export type CachedSessionMetadata = {
	path: string;
	marker: FileMarker;
	id: string;
	cwd: string | null;
	timestamp: string | null;
	headerBytes: number;
	eventRange?: { min: string | null; max: string | null; through: number };
};

type CacheDocument = { version: 1; entries: CachedSessionMetadata[] };
const CACHE_VERSION = 1 as const;
const MAX_ENTRIES = 4096;

export function metadataCachePath(root: string): string {
	return path.join(root, ".analytics-state", "metadata.json");
}
export function fileKeyForPath(file: string): string {
	return createHash("sha256").update(file).digest("hex");
}
export function fileMarker(stat: Stats): FileMarker {
	return { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, dev: stat.dev, ino: stat.ino };
}
function sameMarker(a: FileMarker, b: FileMarker): boolean {
	return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.dev === b.dev && a.ino === b.ino;
}
function validMarker(value: unknown): value is FileMarker {
	if (!value || typeof value !== "object") return false;
	const marker = value as Record<string, unknown>;
	return ["size", "mtimeMs", "ctimeMs", "dev", "ino"].every(key => typeof marker[key] === "number" && Number.isFinite(marker[key]));
}

/** Disposable metadata only. It is never consulted for file authority or transcript content. */
export class MetadataCache {
	private readonly root: string;
	private readonly entries: Map<string, CachedSessionMetadata>;
	private dirty = false;
	private constructor(root: string, entries: Map<string, CachedSessionMetadata>) { this.root = root; this.entries = entries; }

	static async open(root: string): Promise<MetadataCache> {
		const entries = new Map<string, CachedSessionMetadata>();
		try {
			const parsed = JSON.parse(await fs.readFile(metadataCachePath(root), "utf8")) as CacheDocument;
			if (parsed?.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) throw new Error("invalid metadata cache");
			for (const value of parsed.entries) {
				if (value && typeof value.path === "string" && typeof value.id === "string" && value.id.length <= 256 &&
					typeof value.headerBytes === "number" && Number.isSafeInteger(value.headerBytes) && value.headerBytes > 0 && validMarker(value.marker)) {
					entries.set(fileKeyForPath(value.path), value);
				}
			}
		} catch { /* A cache is disposable. Authoritative discovery is the fallback. */ }
		return new MetadataCache(root, entries);
	}

	get(file: string, marker: FileMarker): CachedSessionMetadata | undefined {
		const value = this.entries.get(fileKeyForPath(file));
		return value && value.path === file && sameMarker(value.marker, marker) ? value : undefined;
	}
	set(value: CachedSessionMetadata): void {
		this.entries.set(fileKeyForPath(value.path), value);
		this.dirty = true;
	}
	updateRange(file: string, marker: FileMarker, range: { min: string | null; max: string | null; through: number }): void {
		const value = this.get(file, marker);
		if (!value || range.through < 0 || range.through > marker.size) return;
		this.set({ ...value, eventRange: { ...range } });
	}

	async flush(): Promise<void> {
		if (!this.dirty) return;
		const values = [...this.entries.values()].sort((a, b) => a.path.localeCompare(b.path)).slice(-MAX_ENTRIES);
		const target = metadataCachePath(this.root);
		const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
		try {
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.writeFile(temporary, JSON.stringify({ version: CACHE_VERSION, entries: values }), { encoding: "utf8", mode: 0o600 });
			try { await fs.rename(temporary, target); }
			catch { await fs.rm(target, { force: true }); await fs.rename(temporary, target); }
			this.dirty = false;
		} catch {
			await fs.rm(temporary, { force: true }).catch(() => undefined);
			// Cache availability must not make authoritative analytics fail.
		}
	}
}
