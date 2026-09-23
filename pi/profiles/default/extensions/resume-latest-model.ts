import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const FAMILY = /(?:^|[-.])(astra|sol|terra|luna|fable|opus|sonnet|haiku)(?:[-.]|$)/;

function identity(id: string): { family: string; version: number[] } | undefined {
  const family = id.match(FAMILY)?.[1];
  if (!family) return undefined;
  const prefix = id.slice(0, id.indexOf(family));
  const versionText = family === "astra" || family === "sol" || family === "terra" || family === "luna"
    ? prefix.match(/gpt-(\d+(?:\.\d+)?)\-$/)?.[1]
    : id.slice(id.indexOf(family) + family.length).match(/^-(\d+(?:-\d+)*)/)?.[1]?.replaceAll("-", ".");
  if (!versionText) return undefined;
  return { family, version: versionText.split(".").map(Number) };
}

function compareVersion(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function latestSameFamily<T extends { provider: string; id: string }>(saved: T, available: readonly T[]): T | undefined {
  const original = identity(saved.id);
  if (!original) return undefined;
  return available.flatMap((candidate) => {
    if (candidate.provider !== saved.provider) return [];
    const parsed = identity(candidate.id);
    return parsed?.family === original.family && compareVersion(parsed.version, original.version) > 0
      ? [{ candidate, version: parsed.version }] : [];
  }).sort((left, right) => compareVersion(right.version, left.version))[0]?.candidate;
}

export default function resumeLatestModel(pi: ExtensionAPI): void {
  pi.on("session_start", async (event, ctx) => {
    if (event.reason !== "resume" && event.reason !== "startup") return;
    if (process.env.PI_SUBAGENT_AUTHORITY) return;
    if (event.reason === "startup" && !ctx.sessionManager.getBranch().some((entry) => entry.type === "message")) return;
    const saved = ctx.model;
    if (!saved || (saved.provider !== "openai-codex" && saved.provider !== "bedrock-mantle")) return;
    const candidate = latestSameFamily(saved, ctx.modelRegistry.getAll());
    if (!candidate) return;
    try {
      if (!await pi.setModel(candidate)) return;
      ctx.ui.notify(`Resumed on latest ${candidate.provider}/${candidate.id} (was ${saved.id}).`, "info");
    } catch (error) {
      ctx.ui.notify(`Could not update resumed model; keeping ${saved.provider}/${saved.id}: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
  });
}
