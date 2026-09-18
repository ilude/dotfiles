import {
  compact,
  getAgentDir,
  SettingsManager,
  type ExtensionAPI,
  type SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";

export const HANDOFF_INSTRUCTIONS = `Produce one current checkpoint from the previous summary and the chronological messages, including any partial turn. Reconcile them rather than appending conflicting summaries.
Preserve the requested outcome, current scope and authorization, settled decisions, completion evidence, and canonical plan path when present. Distinguish user-approved requirements from proposals and unresolved hypotheses. Replace superseded intent with the latest explicit correction; do not preserve an obsolete restriction or approval as current.
Include the response owed, pending questions and operator decisions, completed checks and their results, blockers, and the exact next action when applicable. Task artifacts supplement the current request rather than replacing it. Keep relevant attempt limits and stop conditions if supplied, without inventing them.
Recent messages beyond this checkpoint remain available to the executor and newer corrections there take precedence. Do not infer their contents, reconstruct missing history, or treat compaction as completion. Keep the checkpoint concise.`;

export function unifiedPreparation(event: SessionBeforeCompactEvent): SessionBeforeCompactEvent["preparation"] {
  const preparation = event.preparation;
  const fileOps = {
    read: new Set(preparation.fileOps.read),
    written: new Set(preparation.fileOps.written),
    edited: new Set(preparation.fileOps.edited),
  };
  // Native preparation skips metadata from extension-generated summaries.
  // Carry the last checkpoint's file lists forward without replaying old messages.
  const previous = [...event.branchEntries].reverse().find(entry => entry.type === "compaction");
  if (previous?.type === "compaction" && previous.fromHook) {
    const details: unknown = previous.details;
    if (details && typeof details === "object") {
      if ("readFiles" in details && Array.isArray(details.readFiles)) {
        for (const path of details.readFiles) if (typeof path === "string") fileOps.read.add(path);
      }
      if ("modifiedFiles" in details && Array.isArray(details.modifiedFiles)) {
        for (const path of details.modifiedFiles) if (typeof path === "string") fileOps.edited.add(path);
      }
    }
  }
  return {
    ...preparation,
    messagesToSummarize: [...preparation.messagesToSummarize, ...preparation.turnPrefixMessages],
    turnPrefixMessages: [],
    isSplitTurn: false,
    fileOps,
  };
}

export function registerCompaction(pi: ExtensionAPI, summarize: typeof compact = compact): void {
  pi.on("session_before_compact", async (event, ctx) => {
    try {
      if (!ctx.model) throw new Error("No model selected for compaction");
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
      if (!auth.ok) throw new Error(auth.error);
      const model = auth.baseUrl ? { ...ctx.model, baseUrl: auth.baseUrl } : ctx.model;
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(auth.headers ?? {})) {
        if (value !== null) headers[name] = value;
      }
      const settings = SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
      const instructions = event.customInstructions
        ? `${HANDOFF_INSTRUCTIONS}\n\nUser compaction focus:\n${event.customInstructions}`
        : HANDOFF_INSTRUCTIONS;
      const result = await summarize(
        unifiedPreparation(event), model, auth.apiKey, headers, instructions,
        event.signal, pi.getThinkingLevel(), undefined, auth.env, settings.getRetrySettings(),
      );
      if (event.signal.aborted) return { cancel: true };
      if (!result.summary.trim()) throw new Error("Compaction returned an empty summary");
      return { compaction: result };
    } catch (error) {
      // Hook exceptions otherwise fall through to native split-turn generation.
      if (!event.signal.aborted) {
        ctx.ui.notify(`Compaction failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
      return { cancel: true };
    }
  });
}

export default function compaction(pi: ExtensionAPI): void {
  registerCompaction(pi);
}
