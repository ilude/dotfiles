import { createHash } from "node:crypto";

export function normalizeCommitPaths(paths: string[]): string[] {
	return [...new Set(paths.map((path) => path.replace(/\\/g, "/")))].sort();
}

export function createConfirmationToken(repoRoot: string, paths: string[], purpose: "stage" | "create"): string {
	const normalized = normalizeCommitPaths(paths);
	return createHash("sha256")
		.update(["pi-commit", purpose, repoRoot.replace(/\\/g, "/"), ...normalized].join("\0"))
		.digest("hex");
}

export function timingSafeTokenEqual(a: string | undefined, b: string): boolean {
	return typeof a === "string" && a.length === b.length && a === b;
}
