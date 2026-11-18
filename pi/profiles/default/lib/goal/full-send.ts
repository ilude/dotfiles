import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { GoalAuthority, GoalState } from "./contract.ts";

export const FULL_SEND_ENTRY = "full-send-authorization";
export const FULL_SEND_QUERY = "full-send:authorization";
export interface FullSendArm {
  version: 1;
  sessionId: string;
  runId: string;
  armed: boolean;
}
export interface FullSendAuthorization {
  source: "/full-send";
  sessionId: string;
  runId: string;
  task: GoalAuthority;
}

/** Restore only the latest arm on this branch, never another session or run. */
export function restoreFullSend(branch: readonly unknown[], state: GoalState | undefined): FullSendArm | undefined {
  if (!state) return;
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (!entry || typeof entry !== "object" || !("type" in entry) || entry.type !== "custom" ||
        !("customType" in entry) || entry.customType !== FULL_SEND_ENTRY) continue;
    const data = "data" in entry ? entry.data : undefined;
    if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1 ||
        !("sessionId" in data) || data.sessionId !== state.sessionId ||
        !("runId" in data) || data.runId !== state.runId ||
        !("armed" in data) || typeof data.armed !== "boolean") return;
    return { version: 1, sessionId: state.sessionId, runId: state.runId, armed: data.armed };
  }
}

/** Pull current authority at decision time. No responder means no preapproval. */
export function fullSendAuthorization(events: ExtensionAPI["events"], sessionId: string): FullSendAuthorization | undefined {
  let authorization: FullSendAuthorization | undefined;
  events.emit(FULL_SEND_QUERY, { sessionId, respond: (value: FullSendAuthorization) => { authorization = value; } });
  return authorization;
}
