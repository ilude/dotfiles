import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const SUBAGENT_LINEAGE_ENTRY = "subagent-lineage";

export interface SubagentLineage {
  version: 1;
  sessionId: string;
  role: string;
  parentSessionId: string;
  rootSessionId: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Persist the authenticated child session's lineage marker at most once. */
type LineageSessionManager = {
  getSessionId(): string;
  getEntries(): ReadonlyArray<{ type: string; customType?: string; data?: unknown }>;
};

export function writeSubagentLineage(
  pi: Pick<ExtensionAPI, "appendEntry">,
  ctx: { sessionManager: LineageSessionManager },
  role: string,
  parentSessionId: string,
  rootSessionId: string,
): boolean {
  const sessionId = ctx.sessionManager.getSessionId();
  const alreadyRecorded = ctx.sessionManager.getEntries().some(
    (entry) => entry.type === "custom"
      && entry.customType === SUBAGENT_LINEAGE_ENTRY
      && isObject(entry.data)
      && entry.data.sessionId === sessionId,
  );
  if (alreadyRecorded) return false;

  const data: SubagentLineage = {
    version: 1,
    sessionId,
    role,
    parentSessionId,
    rootSessionId,
  };
  pi.appendEntry(SUBAGENT_LINEAGE_ENTRY, data);
  return true;
}
