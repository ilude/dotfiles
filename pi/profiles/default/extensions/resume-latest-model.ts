import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { compareModelVersions, modelFamilyVersion } from "../lib/model-family.ts";
import { PINNED_SOL_MODEL } from "../lib/model-selection.ts";

export function latestSameFamily<T extends { provider: string; id: string }>(saved: T, available: readonly T[]): T | undefined {
  const original = modelFamilyVersion(saved.id);
  if (!original) return undefined;
  // Sessions saved before the native OpenAI provider migration use openai-codex.
  // Resolve only that retired provider to its native replacement on resume.
  const candidateProvider = saved.provider === "openai-codex" ? "openai" : saved.provider;
  if (original.family === "sol") {
    const pinned = available.find(candidate => candidate.provider === candidateProvider &&
      (candidate.id === PINNED_SOL_MODEL || candidate.id === `openai.${PINNED_SOL_MODEL}`));
    return pinned?.id === saved.id && pinned.provider === saved.provider ? undefined : pinned;
  }
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
