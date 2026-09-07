import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProfileId, ProfileRegistry } from "../../lib/log-analytics/profiles.js";

export async function analyticsFixture() {
	const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "pi-default-analytics-"));
	const registry: ProfileRegistry = { active: "default", roots: { default: path.join(scratch, "default"), legacy: path.join(scratch, "legacy") } };
	for (const root of Object.values(registry.roots)) await fs.mkdir(path.join(root, "sessions"), { recursive: true });
	async function session(profile: ProfileId, id: string, records: unknown[] = [], name = `${id}.jsonl`, cwd = "/project") {
		const file = path.join(registry.roots[profile], "sessions", name);
		await fs.mkdir(path.dirname(file), { recursive: true });
		await fs.writeFile(file, [JSON.stringify({ type: "session", version: 3, id, cwd, timestamp: "2020-01-01T00:00:00.000Z" }),
			...records.map(record => typeof record === "string" ? record : JSON.stringify(record))].join("\n") + "\n");
		return file;
	}
	return { scratch, registry, session, dispose: () => fs.rm(scratch, { recursive: true, force: true }) };
}
export const recentMessage = { type: "message", id: "recent", message: {
	role: "assistant", timestamp: Date.parse("2026-09-01T00:00:00Z"), provider: "test", model: "model", content: [{ type: "text", text: "needle" }],
	usage: { input: 12, output: 3, cacheRead: 5, cacheWrite: 2, cost: { total: 0.1 } },
} };
