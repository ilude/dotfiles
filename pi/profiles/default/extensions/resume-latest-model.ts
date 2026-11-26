import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { compareModelVersions, modelFamilyVersion } from "../lib/model-family.ts";

export function latestSameFamily<T extends { provider: string; id: string }>(saved: T, available: readonly T[]): T | undefined {
  const original = modelFamilyVersion(saved.id);
  if (!original) return undefined;
  // Keep the saved subscription route when it still advertises this family.
  // Retain the old Codex-to-native migration for families removed from Codex.
  const candidateProvider = saved.provider === "openai-codex" &&
    !available.some(candidate => candidate.provider === saved.provider && modelFamilyVersion(candidate.id)?.family === original.family)
    ? "openai" : saved.provider;
  return available.flatMap((candidate) => {
    if (candidate.provider !== candidateProvider) return [];
    const parsed = modelFamilyVersion(candidate.id);
    if (parsed?.family !== original.family) return [];
    const comparison = compareModelVersions(parsed.version, original.version);
    return comparison > 0 || (comparison === 0 && candidate.provider !== saved.provider)
      ? [{ candidate, version: parsed.version }] : [];
  }).sort((left, right) => compareModelVersions(right.version, left.version))[0]?.candidate;
}

export default function resumeLatestModel(pi: ExtensionAPI): void {
  pi.on("session_start", async (event, ctx) => {
    if (event.reason !== "resume" && event.reason !== "startup") return;
    if (process.env.PI_SUBAGENT_AUTHORITY) return;
    if (event.reason === "startup" && !ctx.sessionManager.getBranch().some((entry) => entry.type === "message")) return;
    const saved = ctx.model;
    if (!saved || (saved.provider !== "openai" && saved.provider !== "openai-codex" && saved.provider !== "bedrock-mantle")) return;
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
