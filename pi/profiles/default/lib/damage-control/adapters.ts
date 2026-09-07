import type { Effect, NativeTool, ToolRequest } from "./types.ts";

export type AdapterResult = { status: "adapted"; request: ToolRequest } | { status: "unsupported"; reason: string } | { status: "uncovered"; tool: string };
export type ToolAdapter = (callId: string, input: unknown, cwd: string) => AdapterResult;
const native = new Set<NativeTool>(["bash", "powershell", "read", "write", "edit", "grep", "find", "ls"]);
function text(value: unknown, name: string, empty = false): asserts value is string {
  if (typeof value !== "string" || (!empty && !value.trim()) || value.includes("\0")) throw new Error(`${name} must be a ${empty ? "" : "nonempty "}string without NUL`);
}
export function adapt(tool: string, callId: string, input: unknown, cwd: string): AdapterResult {
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
  if (request.tool === "bash" || request.tool === "powershell") throw new Error("Shell requests require complete shell analysis");
  const raw = "path" in request.input ? request.input.path ?? "." : ".";
  const operation = request.tool === "read" || request.tool === "grep" ? "read" : request.tool === "find" || request.tool === "ls" ? "metadata" : request.tool === "write" && request.input.content.length === 0 ? "truncate" : "write";
  return [{ id: `${request.callId}:file`, kind: "filesystem", operation, sources: operation === "read" ? [{ resolution: "static", path: raw }] : [], targets: [{ resolution: "static", path: raw }], destinations: [], context: { cwd: request.cwd }, range: { start: 0, end: request.text.length }, resolution: "static" }];
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
