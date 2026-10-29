import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getAgentDir as profileDir } from "@earendil-works/pi-coding-agent";

export const CUR_BUCKET = "ccb-bedrock-billing-058264305403";
export const CUR_KEY = "snapshots/mike.glenn/current.json";
export const CUR_REGION = "us-east-2";
export const CUR_FILE = "bedrock-cur-snapshot.json";
export interface CurSnapshot {
	schema_version: 1;
	source: "payer-cur2";
	billing_month: string;
	currency: "USD";
	generated_at: string;
	username: "mike.glenn";
	month_to_date: number;
}
export const curSnapshotPath = () => path.join(profileDir(), CUR_FILE);
export function curObjectUri(): string { return `s3://${CUR_BUCKET}/${CUR_KEY}`; }
export function curCopyArgs(profile?: string): string[] {
	return ["s3", "cp", curObjectUri(), "-", "--region", CUR_REGION, ...(profile ? ["--profile", profile] : [])];
}
export function parseCurSnapshot(value: unknown): CurSnapshot {
	if (!value || typeof value !== "object") throw new Error("Invalid personal CUR snapshot: expected an object");
	const snapshot = value as Partial<CurSnapshot>;
	if (snapshot.schema_version !== 1 || snapshot.source !== "payer-cur2" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(snapshot.billing_month ?? "") || snapshot.currency !== "USD" || !Number.isFinite(Date.parse(snapshot.generated_at ?? "")) || typeof snapshot.generated_at !== "string" || !/(?:Z|\+00:00)$/.test(snapshot.generated_at) || snapshot.username !== "mike.glenn" || typeof snapshot.month_to_date !== "number" || !Number.isFinite(snapshot.month_to_date) || snapshot.month_to_date < 0) {
		throw new Error("Invalid personal CUR snapshot: fields do not match schema version 1");
	}
	return snapshot as CurSnapshot;
}
export type CapturedCurSnapshot = CurSnapshot & { capturedAt?: string };
export async function readCurSnapshot(file = curSnapshotPath()): Promise<CapturedCurSnapshot | undefined> {
	try {
		const value = JSON.parse(await fs.readFile(file, "utf8"));
		const snapshot = parseCurSnapshot(value) as CapturedCurSnapshot;
		if (snapshot.capturedAt !== undefined && !Number.isFinite(Date.parse(snapshot.capturedAt))) throw new Error("Invalid local CUR capture time");
		return snapshot;
	}
	catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
export async function writeCurSnapshot(value: unknown, file = curSnapshotPath()): Promise<CapturedCurSnapshot> {
	const snapshot = parseCurSnapshot(value);
	await fs.mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
	try { await fs.writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); await fs.rename(temporary, file); }
	finally { await fs.rm(temporary, { force: true }); }
	return snapshot;
}
