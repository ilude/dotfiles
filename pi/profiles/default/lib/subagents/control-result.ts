import type { ChildRecord } from "./rpc.ts";

/** Per-call facts returned by a message or answer control operation. */
export interface DispatchMetadata {
  accepted: true;
  operation: "message" | "answer";
  /** The control reports dispatch acceptance, not assignment completion. */
  completion: "not-reported";
}

export type DispatchControlResult = ChildRecord & { dispatch: DispatchMetadata };

export function dispatchOperation(action: "message" | "answer", replyTo?: string): DispatchMetadata["operation"] {
  return action === "answer" || replyTo !== undefined ? "answer" : "message";
}

/**
 * Keep the existing child snapshot at the top level and attach metadata that
 * belongs only to this control call.
 */
export function withDispatchMetadata(record: ChildRecord, operation: DispatchMetadata["operation"]): DispatchControlResult {
  return {
    ...record,
    dispatch: { accepted: true, operation, completion: "not-reported" },
  };
}
