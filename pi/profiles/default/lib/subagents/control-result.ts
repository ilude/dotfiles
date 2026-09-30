import type { ChildRecord } from "./rpc.ts";
import type { RpcResponse } from "@earendil-works/pi-coding-agent";

export type InputDisposition = Extract<RpcResponse, { command: "prompt"; success: true }> ["data"]["disposition"];

/** Only native RPC commands carry native input dispositions. */
export function nativeInputDisposition(data: unknown, command: "prompt" | "steer"): InputDisposition {
  const disposition = (data as { disposition?: unknown } | undefined)?.disposition;
  if (disposition === "handled" || disposition === "queued" || (command === "prompt" && disposition === "started")) return disposition;
  throw new Error(`Invalid RPC ${command} input disposition`);
}

/** Per-call facts returned by a message or answer control operation. */
export interface DispatchMetadata {
  accepted: true;
  operation: "assignment" | "message" | "answer";
  /** Omitted for visible application-transport acceptance. */
  disposition?: InputDisposition;
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
export function withDispatchMetadata(record: ChildRecord, operation: DispatchMetadata["operation"], disposition?: InputDisposition): DispatchControlResult {
  return {
    ...record,
    dispatch: { accepted: true, operation, completion: "not-reported", ...(disposition ? { disposition } : {}) },
  };
}
