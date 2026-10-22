import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const RELEASE_CHECK_INTERVAL = 4 * 60 * 60 * 1000;
const CACHE_FILE = "release-indicators.json";
const RELEASES = {
  pi: { api: "https://api.github.com/repos/earendil-works/pi/releases?per_page=100", notes: "https://github.com/earendil-works/pi/blob/main/CHANGELOG.md#" },
  herdr: { api: "https://api.github.com/repos/herdrdev/herdr/releases?per_page=100", notes: "https://github.com/herdrdev/herdr/releases/latest" },
} as const;
export type ReleaseState = { pi?: number; herdr?: number };
type Cache = { checkedAt: number; latest: { pi?: string[]; herdr?: string[] } };

function stable(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match || match[4]) return undefined;
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}
function compare(a: string, b: string): number {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}
async function fetchVersions(url: string, signal: AbortSignal): Promise<string[]> {
  const timeout = AbortSignal.timeout(10_000);
  const requestSignal = AbortSignal.any([signal, timeout]);
  const response = await fetch(url, { signal: requestSignal, headers: { accept: "application/vnd.github+json", "user-agent": "pi-release-footer" } });
  if (!response.ok) throw new Error(`release request failed: ${response.status}`);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error("invalid release response");
  return [...new Set(body.flatMap(item => {
    if (!item || typeof item !== "object" || (item as any).draft || (item as any).prerelease) return [];
    const version = stable((item as any).tag_name);
    return version ? [version] : [];
  }))].sort(compare);
}
async function readCache(): Promise<Cache | undefined> {
  try { const value = JSON.parse(await readFile(join(getAgentDir(), CACHE_FILE), "utf8"));
    if (typeof value.checkedAt === "number" && value.latest && typeof value.latest === "object") return value as Cache;
  } catch { /* first run or unavailable cache */ }
  return undefined;
}
export async function checkReleases(signal: AbortSignal): Promise<Cache["latest"]> {
  const cached = await cachedReleases();
  if (cached.fresh && cached.cache) return cached.cache.latest;
  const [pi, herdr] = await Promise.all([fetchVersions(RELEASES.pi.api, signal), fetchVersions(RELEASES.herdr.api, signal)]);
  const latest = { pi, herdr };
  try { await mkdir(getAgentDir(), { recursive: true }); await writeFile(join(getAgentDir(), CACHE_FILE), JSON.stringify({ checkedAt: Date.now(), latest } satisfies Cache)); } catch { /* use the successful in-memory result */ }
  return latest;
}
export async function cachedReleases(): Promise<{ cache?: Cache; fresh: boolean }> {
  const cache = await readCache();
  return { cache, fresh: !!cache && Date.now() - cache.checkedAt < RELEASE_CHECK_INTERVAL };
}
export function releaseLag(version: string, versions: string[] | undefined): number | undefined {
  // The running preview is still comparable to stable releases by its base version.
  const current = typeof version === "string" ? stable(version.replace(/-.*$/, "")) : undefined;
  if (!current || !versions) return undefined;
  return versions.filter(item => compare(item, current) > 0 || (item === current && /-/.test(version))).length;
}
export function releaseUrl(product: "pi" | "herdr", version: string, latestVersion = version): string {
  if (product === "herdr") return RELEASES.herdr.notes;
  return `https://github.com/earendil-works/pi/blob/v${latestVersion}/packages/coding-agent/CHANGELOG.md`;
}
