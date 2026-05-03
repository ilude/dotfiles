import { createHash, timingSafeEqual } from "node:crypto";

export function normalizeCommitPaths(paths: string[]): string[] {
	return [...new Set(paths.map((path) => path.replace(/\\/g, "/")))].sort();
}

export function createConfirmationToken(repoRoot: string, paths: string[], purpose: "stage" | "create"): string {
	const normalized = normalizeCommitPaths(paths);
	return createHash("sha256")
		.update(["pi-commit", purpose, repoRoot.replace(/\\/g, "/"), ...normalized].join("\0"))
		.digest("hex");
}

export function timingSafeTokenEqual(a: unknown, b: unknown): boolean {
	if (typeof a !== "string" || typeof b !== "string") return false;
	if (a.length !== b.length) return false;
	const ab = Buffer.from(a, "hex");
	const bb = Buffer.from(b, "hex");
	if (ab.length !== bb.length || ab.length === 0) return false;
	return timingSafeEqual(ab, bb);
}
