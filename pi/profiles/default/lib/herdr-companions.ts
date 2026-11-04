import { dirname } from "node:path";
import { admitCommand } from "./herdr-command.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { LayoutPlacement, LayoutPlacementRequest } from "./subagents/layout.ts";

export const HERDR_COMPANION_REQUEST = "default:herdr:companion";
export type CompanionRequest =
  | { action: "place"; id: string; cwd: string; title: string; commandFile?: string }
  | { action: "close" | "release"; pane: string };
export interface CompanionResponse { placement?: LayoutPlacement; handled: boolean }

export function parseCompanionRequest(value: unknown): CompanionRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid companion request");
  const request = value as Record<string, unknown>;
  if (request.action === "place") {
    if (typeof request.id !== "string" || !request.id.startsWith("companion:") || typeof request.cwd !== "string" || !request.cwd || typeof request.title !== "string" || !request.title
      || (request.commandFile !== undefined && (typeof request.commandFile !== "string" || !request.commandFile))) throw new Error("Invalid companion placement");
    return { action: "place", id: request.id, cwd: request.cwd, title: request.title, ...(typeof request.commandFile === "string" ? {commandFile:request.commandFile} : {}) };
  }
  if ((request.action === "close" || request.action === "release") && typeof request.pane === "string" && request.pane) return { action: request.action, pane: request.pane };
  throw new Error("Invalid companion request");
}
export interface CompanionEvent {
  origin: string;
  callerPane: string;
  request: CompanionRequest;
  accept(value: Promise<CompanionResponse>): void;
}

/** The subagent extension owns the one live inventory, across loader instances. */
export function requestCompanion(pi: Pick<ExtensionAPI, "events">, origin: string, callerPane: string, request: CompanionRequest): Promise<CompanionResponse> {
  let response: Promise<CompanionResponse> | undefined;
  const event: CompanionEvent = { origin, callerPane, request, accept(value) { response = value; } };
  pi.events?.emit(HERDR_COMPANION_REQUEST, event);
  if (!response && request.action !== "place") return Promise.resolve({ handled: false });
  if (!response) throw new Error("Shared Herdr layout owner unavailable; no companion operation submitted");
  return response;
}

export function companionPlacement(request: Extract<CompanionRequest, {action:"place"}>, callerPane: string, parentId?: string): LayoutPlacementRequest {
  if (!request.id.startsWith("companion:") || !request.cwd || !request.title) throw new Error("Invalid companion placement");
  const commandFile = request.commandFile;
  return {
    childId: request.id, callerPane, parentId, role: "companion", cwd: request.cwd, title: request.title,
    ...(commandFile ? { plugin: "local.pi", entrypoint: "pi", env: [`PI_HERDR_COMMAND_FILE=${commandFile}`], admitted: (terminalId: string) => admitCommand(dirname(commandFile), terminalId) } : {}),
  };
}
