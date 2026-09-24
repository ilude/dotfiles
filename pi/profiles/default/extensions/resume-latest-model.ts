import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { compareModelVersions, modelFamilyVersion } from "../lib/model-family.ts";
import { PINNED_SOL_MODEL } from "../lib/model-selection.ts";

export function latestSameFamily<T extends { provider: string; id: string }>(saved: T, available: readonly T[]): T | undefined {
  const original = modelFamilyVersion(saved.id);
  if (!original) return undefined;
  if (original.family === "sol") {
    const pinned = available.find(candidate => candidate.provider === saved.provider &&
      (candidate.id === PINNED_SOL_MODEL || candidate.id === `openai.${PINNED_SOL_MODEL}`));
    return pinned?.id === saved.id ? undefined : pinned;
  }
  return available.flatMap((candidate) => {
    if (candidate.provider !== saved.provider) return [];
    const parsed = modelFamilyVersion(candidate.id);
    return parsed?.family === original.family && compareModelVersions(parsed.version, original.version) > 0
      ? [{ candidate, version: parsed.version }] : [];
  }).sort((left, right) => compareModelVersions(right.version, left.version))[0]?.candidate;
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
