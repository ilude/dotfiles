import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const LOCK_STALE_MS = 30 * 60 * 1000;

type LockOwner = { pid: number; createdAt: number; token: string };

function alive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return pid === process.pid;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function owner(path: string): Promise<LockOwner | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const candidate = value as Record<string, unknown>;
      if (typeof candidate.pid === "number" && typeof candidate.createdAt === "number" && typeof candidate.token === "string") return candidate as unknown as LockOwner;
    }
  } catch { /* a lock without readable ownership is recoverable once stale */ }
  return undefined;
}

export type LockHandle = { release: () => Promise<void> };

export async function acquireLock(path: string, now = Date.now, staleMs = LOCK_STALE_MS): Promise<LockHandle | undefined> {
  await mkdir(dirname(path), { recursive: true });
  const token = `${process.pid}-${Math.random().toString(36).slice(2)}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(path);
      const data: LockOwner = { pid: process.pid, createdAt: now(), token };
      await writeFile(`${path}/owner.json`, `${JSON.stringify(data)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      return {
        release: async () => {
          const current = await owner(`${path}/owner.json`);
          if (current?.token === token) await rm(path, { recursive: true, force: true });
        },
      };
    } catch (error) {
      const exists = error instanceof Error && "code" in error && error.code === "EEXIST";
      if (!exists || attempt > 0) return undefined;
      try {
        const details = await stat(path);
        const current = await owner(`${path}/owner.json`);
        const createdAt = current?.createdAt ?? details.mtimeMs;
        if (now() - createdAt < staleMs || (current !== undefined && alive(current.pid))) return undefined;
        await rm(path, { recursive: true, force: true });
      } catch { return undefined; }
    }
  }
  return undefined;
}
