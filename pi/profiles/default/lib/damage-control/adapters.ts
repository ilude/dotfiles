import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { redactBrowserMetadata } from "../browser-effect-contract.ts";
import type { CustomToolName, CustomToolRequest, Effect, NativeTool, ToolRequest } from "./types.ts";

export type AdapterResult = { status: "adapted"; request: ToolRequest } | { status: "unsupported"; reason: string } | { status: "uncovered"; tool: string };
export type ToolAdapter = (callId: string, input: unknown, cwd: string) => AdapterResult;
const native = new Set<NativeTool>(["bash", "powershell", "read", "write", "edit", "grep", "find", "ls"]);
function text(value: unknown, name: string, empty = false): asserts value is string {
  if (typeof value !== "string" || (!empty && !value.trim()) || value.includes("\0")) throw new Error(`${name} must be a ${empty ? "" : "nonempty "}string without NUL`);
}
const customTools = new Set<CustomToolName>(["browser_session", "browser_page", "web_fetch", "web_search", "onclave_message"]);

function customProjection(tool: CustomToolName, input: Record<string, unknown>): Record<string, unknown> {
  const action = typeof input.action === "string" ? input.action.slice(0, 64) : undefined;
  const url = typeof input.url === "string" ? safeUrl(input.url) : undefined;
  const projected: Record<string, unknown> = {};
  if (action) projected.action = action;
  if (url) projected.url = url;
  // Query text and message bodies are deliberately represented by category,
  // never copied into local review evidence.
  if (tool === "web_search" && typeof input.query === "string") projected.query = "[search query redacted]";
  if (tool === "onclave_message") {
    if (typeof input.kind === "string") projected.kind = input.kind;
    if (typeof input.body === "string") projected.body = "[message body redacted]";
    if (Array.isArray(input.to)) {
      projected.to = input.to.filter((value): value is string => typeof value === "string").slice(0, 32).map(value => createHash("sha256").update(value).digest("hex").slice(0, 16));
      if (input.to.length > 32) projected.recipientsOmitted = true;
    }
  }
  if (typeof input.target_id === "string") projected.target_id = "[target]";
  if (typeof input.session_id === "string") projected.session_id = "[session]";
  if (typeof input.path === "string") projected.path = "[local path]";
  if (typeof input.output_path === "string") projected.output_path = input.output_path;
  if (typeof input.to === "string" && input.to) projected.recipient = createHash("sha256").update(input.to).digest("hex").slice(0, 16);
  return projected;
}
function safeUrl(value: string): string {
  try { const url = new URL(value); return url.protocol === "file:" ? url.href : redactBrowserMetadata(`${url.origin}${url.pathname}`); } catch { return "[invalid URL]"; }
}
function adaptCustom(tool: CustomToolName, callId: string, input: unknown, cwd: string): AdapterResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { status: "unsupported", reason: `Adapter required or invalid ${tool} input: expected object` };
  const data = input as Record<string, unknown>;
  const projected = customProjection(tool, data);
  if ((tool === "browser_page" || tool === "browser_session") && typeof data.url === "string") {
    try {
      const url = new URL(data.url);
      if (url.protocol === "file:") fileURLToPath(url);
    } catch { return { status: "unsupported", reason: "Invalid browser destination or local-file path" }; }
  }
  if (tool === "web_fetch") {
    if (typeof data.url !== "string") return { status: "unsupported", reason: "Adapter required or invalid web_fetch input: url required" };
    let url: URL;
    try { url = new URL(data.url); } catch { return { status: "unsupported", reason: "Adapter required or invalid web_fetch input: invalid URL" }; }
    if (!(["http:", "https:"].includes(url.protocol) && !url.username && !url.password)) return { status: "unsupported", reason: "Adapter required or invalid web_fetch input: HTTP(S) URL without embedded credentials required" };
  }
  if (tool === "web_search") {
    try { text(data.query, "query"); } catch { return { status: "unsupported", reason: "Adapter required or invalid web_search input: query required" }; }
  }
  if (tool === "onclave_message") {
    const kind = data.kind;
    if (kind !== undefined && !["request", "response", "note", "ask", "inform"].includes(String(kind))) return { status: "unsupported", reason: "Adapter required or invalid onclave_message input: invalid message kind" };
    if (typeof data.body !== "string" || data.body.length > 100_000 || data.body.includes("\0")) return { status: "unsupported", reason: "Adapter required or invalid onclave_message input: bounded body required" };
    if (data.to !== undefined && (!Array.isArray(data.to) || data.to.length < 1 || data.to.some(value => typeof value !== "string" || !value.trim() || value.includes("\0")))) return { status: "unsupported", reason: "Adapter required or invalid onclave_message input: bounded recipients required" };
  }
  if (tool === "browser_session" && (typeof data.action !== "string" || !["discover", "status", "start", "attach", "restart", "stop"].includes(data.action))) return { status: "unsupported", reason: "Adapter required or invalid browser_session input: unsupported action" };
  if (tool === "browser_page" && (typeof data.action !== "string" || !["list", "open", "select", "snapshot", "screenshot", "click", "fill", "close"].includes(data.action))) return { status: "unsupported", reason: "Adapter required or invalid browser_page input: unsupported action" };
  const request: CustomToolRequest = { tool, callId, cwd, input: projected, text: JSON.stringify(projected) };
  return { status: "adapted", request };
}

export function adapt(tool: string, callId: string, input: unknown, cwd: string): AdapterResult {
  if (customTools.has(tool as CustomToolName)) {
    try { text(callId, "call ID"); text(cwd, "cwd"); return adaptCustom(tool as CustomToolName, callId, input, cwd); }
    catch (error) { return { status: "unsupported", reason: `Adapter required or invalid ${tool} input: ${error instanceof Error ? error.message : "validation failed"}` }; }
  }
  if (!native.has(tool as NativeTool)) return { status: "uncovered", tool };
  try {
    text(callId, "call ID"); text(cwd, "cwd");
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
    const data = input as Record<string, unknown>;
    for (const name of ["timeout", "offset", "limit", "context"]) {
      if (data[name] !== undefined && (typeof data[name] !== "number" || !Number.isFinite(data[name]) || (data[name] as number) < 0)) throw new Error(`invalid ${name}`);
    }
    for (const name of ["ignoreCase", "literal"]) if (data[name] !== undefined && typeof data[name] !== "boolean") throw new Error(`invalid ${name}`);
    if (tool === "bash" || tool === "powershell") text(data.command, "command");
    else if (["read", "write", "edit"].includes(tool)) text(data.path, "path");
    else if (data.path !== undefined) text(data.path, "path");
    if (tool === "grep" || tool === "find") text(data.pattern, "pattern", true);
    if (data.glob !== undefined) text(data.glob, "glob");
    if (tool === "write") text(data.content, "content", true);
    if (tool === "edit") {
      if (!Array.isArray(data.edits) || !data.edits.length) throw new Error("edits must contain replacements");
      for (const item of data.edits) {
        if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key => key !== "oldText" && key !== "newText")) throw new Error("invalid replacement schema");
        text(item.oldText, "oldText", true); text(item.newText, "newText", true);
      }
    }
    // The checks above cover the complete native discriminant and fields; copy
    // input so subsequent caller mutations cannot silently change this analysis.
    const validated = structuredClone(data);
    const request = { tool, callId, cwd, input: validated, text: typeof data.command === "string" ? data.command : JSON.stringify(data), ...((tool === "bash" || tool === "powershell") ? { language: tool } : {}) } as ToolRequest;
    return { status: "adapted", request };
  } catch (error) {
    return { status: "unsupported", reason: `Adapter required or invalid ${tool} input: ${error instanceof Error ? error.message : "validation failed"}` };
  }
}

export function fileEffects(request: ToolRequest): Effect[] {
  if (request.tool === "browser_session" || request.tool === "browser_page" || request.tool === "web_fetch" || request.tool === "web_search" || request.tool === "onclave_message") return customEffects(request);
  if (request.tool === "bash" || request.tool === "powershell") throw new Error("Shell requests require complete shell analysis");
  const raw = "path" in request.input && typeof request.input.path === "string" ? request.input.path : ".";
  const operation = request.tool === "read" || request.tool === "grep" ? "read" : request.tool === "find" || request.tool === "ls" ? "metadata" : request.tool === "write" && request.input.content.length === 0 ? "truncate" : "write";
  return [{ id: `${request.callId}:file`, kind: "filesystem", operation, sources: operation === "read" ? [{ resolution: "static", path: raw }] : [], targets: [{ resolution: "static", path: raw }], destinations: [], context: { cwd: request.cwd }, range: { start: 0, end: request.text.length }, resolution: "static" }];
}

function customEffects(request: Extract<ToolRequest, { tool: CustomToolName }>): Effect[] {
  const { tool, input } = request;
  const action = typeof input.action === "string" ? input.action : "send";
  if (tool === "browser_page" && action === "screenshot" && typeof input.output_path === "string") {
    return [{ id: `${request.callId}:screenshot-file`, kind: "filesystem", operation: "write", sources: [], targets: [{ resolution: "static", path: input.output_path }], destinations: [], context: { cwd: request.cwd }, range: { start: 0, end: request.text.length }, resolution: "static" }];
  }
  if (tool === "browser_page" && action === "open" && typeof input.url === "string" && input.url.startsWith("file:")) {
    let path = "[invalid local-file path]";
    try { path = fileURLToPath(new URL(input.url)); } catch { /* malformed URL remains unresolved evidence */ }
    return [{ id: `${request.callId}:file-handoff`, kind: "filesystem", operation: "read", sources: [{ resolution: "static", path }], targets: [], destinations: [], context: { cwd: request.cwd }, range: { start: 0, end: request.text.length }, resolution: "static" }];
  }
  const recipients = tool === "onclave_message" && Array.isArray(input.to) ? input.to.filter((value): value is string => typeof value === "string") : [];
  const destination = (tool === "web_fetch" || tool === "browser_page" || tool === "browser_session") && typeof input.url === "string" ? safeUrl(input.url) : tool === "web_search" ? "https://search-provider.invalid/" : tool === "onclave_message" && recipients.length && !input.recipientsOmitted ? `onclave://peer/${recipients.join(",")}` : undefined;
  const isRead = tool === "browser_page" && ["list", "snapshot", "screenshot"].includes(action);
  const common = { id: `${request.callId}:${tool}`, kind: "network" as const, operation: isRead ? "read" as const : "upload" as const, sources: isRead ? [] : [{ resolution: "unknown" as const, expression: "bounded prior observations or task payload", reason: "Payload not treated as trusted or fully taint-tracked" }], targets: [], destinations: destination ? [{ resolution: "static" as const, path: destination }] : [{ resolution: "unknown" as const, expression: "recipient or page destination", reason: "Destination resolved by owning tool at execution" }], context: { cwd: request.cwd }, range: { start: 0, end: request.text.length } };
  return isRead ? [{ ...common, resolution: "static" }] : [{ ...common, resolution: "unknown", reason: "Outbound transfer candidate requires contextual review" }];
}

// Once protected-path reads have been rejected, the gate may use the ordinary
// target's local contents to distinguish a complete edit truncation from deletion
// of one fragment. These contents are never reviewer evidence.
export function editTruncates(original: string, edits: { oldText: string; newText: string }[]): boolean {
  const normalize = (s: string) => s.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const source = normalize(original);
  const ranges = edits.map(edit => {
    const old = normalize(edit.oldText);
    const start = source.indexOf(old);
    if (!old || start < 0 || source.indexOf(old, start + 1) >= 0) throw new Error("Edit target cannot be resolved uniquely; use exact replacements");
    return { start, end: start + old.length, replacement: normalize(edit.newText) };
  }).sort((a, b) => a.start - b.start);
  let end = 0;
  let length = source.length;
  for (const range of ranges) {
    if (range.start < end) throw new Error("Overlapping edits require a rewrite");
    end = range.end;
    length += range.replacement.length - (range.end - range.start);
  }
  return length === 0;
}
