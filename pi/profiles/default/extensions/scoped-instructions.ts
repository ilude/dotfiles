import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
  ToolCallEvent,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import {
  discoverScopedInstructions,
  extractScopedInstructionTargets,
  formatScopedInstructions,
  readCurrentInstruction,
  type InstructionSource,
} from "../lib/scoped-instructions.ts";

const MAX_WARNINGS_PER_SESSION = 8;
const INJECTION_PREFIX = "\n\n<scoped-project-instructions>\n";
const INJECTION_SUFFIX = "</scoped-project-instructions>";
const SOURCE_MARKER = /<!-- pi-scoped-instruction:([^\r\n]+?) -->/g;

type RuntimeState = {
  sessionId: string;
  trusted: boolean;
  delivered: Set<string>;
  pending: Map<string, InstructionSource[]>;
  parents: Map<string, string>;
  warnings: Set<string>;
};

function sourceIdsFromActiveContext(entries: readonly SessionEntry[]): Set<string> {
  const delivered = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message.role !== "toolResult") continue;
    for (const block of entry.message.content) {
      if (block.type !== "text" || !block.text.startsWith(INJECTION_PREFIX) || !block.text.endsWith(INJECTION_SUFFIX)) continue;
      const body = block.text.slice(INJECTION_PREFIX.length, -INJECTION_SUFFIX.length);
      for (const match of body.matchAll(SOURCE_MARKER)) {
        const sourceId = match[1];
        if (sourceId) delivered.add(sourceId);
      }
    }
  }
  return delivered;
}

export default function scopedInstructions(pi: ExtensionAPI): void {
  let state: RuntimeState | undefined;

  const isTrusted = (ctx: ExtensionContext): boolean => {
    try { return ctx.isProjectTrusted(); }
    catch { return false; }
  };

  const notifyWarnings = (ctx: ExtensionContext, current: RuntimeState, warnings: readonly string[]): void => {
    for (const warning of warnings) {
      if (current.warnings.has(warning) || current.warnings.size >= MAX_WARNINGS_PER_SESSION) continue;
      current.warnings.add(warning);
      try { ctx.ui.notify(warning, "warning"); } catch { /* Warnings must not change tool behavior. */ }
    }
  };

  const createState = (ctx: ExtensionContext): RuntimeState => ({
    sessionId: ctx.sessionManager.getSessionId(),
    trusted: true,
    delivered: new Set(),
    pending: new Map(),
    parents: new Map(),
    warnings: new Set(),
  });

  const rebuildDelivered = (ctx: ExtensionContext, current: RuntimeState): void => {
    try {
      current.delivered = sourceIdsFromActiveContext(ctx.sessionManager.buildContextEntries());
    } catch {
      notifyWarnings(ctx, current, ["Could not rebuild scoped instruction delivery state; tool calls will proceed."]);
    }
  };

  const initializeSession = (ctx: ExtensionContext): void => {
    state = undefined;
    if (!isTrusted(ctx)) return;
    try {
      state = createState(ctx);
      rebuildDelivered(ctx, state);
    } catch {
      state = undefined;
    }
  };

  const syncActiveContext = (ctx: ExtensionContext, clearPending: boolean): RuntimeState | undefined => {
    if (!isTrusted(ctx)) {
      state?.pending.clear();
      state = undefined;
      return undefined;
    }
    try {
      const sessionId = ctx.sessionManager.getSessionId();
      if (!state || !state.trusted || state.sessionId !== sessionId) {
        state = createState(ctx);
        rebuildDelivered(ctx, state);
      } else {
        if (clearPending) {
          state.pending.clear();
          state.parents.clear();
        }
        rebuildDelivered(ctx, state);
      }
      return state;
    } catch {
      return undefined;
    }
  };

  pi.on("session_start", (_event, ctx) => initializeSession(ctx));
  pi.on("session_tree", (_event, ctx) => { syncActiveContext(ctx, true); });
  pi.on("session_compact", (_event, ctx) => { syncActiveContext(ctx, false); });
  pi.on("session_shutdown", () => { state = undefined; });

  pi.on("tool_call", (event: ToolCallEvent, ctx) => {
    const current = syncActiveContext(ctx, false);
    if (!current) return;
    try {
      if (event.parentToolCallId) current.parents.set(event.toolCallId, event.parentToolCallId);
      const targets = extractScopedInstructionTargets(event.toolName, event.input, ctx.cwd);
      if (!targets.length) return;
      const discovery = discoverScopedInstructions(ctx.cwd, targets);
      notifyWarnings(ctx, current, discovery.warnings);
      const reserved = new Set([...current.pending.values()].flatMap(sources => sources.map(source => source.id)));
      const candidates = discovery.sources.filter(source => {
        if (current.delivered.has(source.id) || reserved.has(source.id)) return false;
        reserved.add(source.id);
        return true;
      });
      if (candidates.length) current.pending.set(event.toolCallId, candidates);
    } catch {
      notifyWarnings(ctx, current, ["Could not discover scoped instructions; the tool call will proceed."]);
    }
  });

  pi.on("tool_result", (event: ToolResultEvent, ctx) => {
    const current = syncActiveContext(ctx, false);
    if (!current) return;
    const reserved = current.pending.get(event.toolCallId) ?? [];
    current.pending.delete(event.toolCallId);
    const parentToolCallId = event.parentToolCallId ?? current.parents.get(event.toolCallId);
    current.parents.delete(event.toolCallId);
    if (!reserved.length) return;

    const warnings: string[] = [];
    const sources: InstructionSource[] = [];
    for (const candidate of reserved) {
      const source = readCurrentInstruction(candidate, warnings);
      if (!source) continue;
      if (!source.body.trim()) {
        warnings.push(`Empty instruction file: ${source.label}`);
        continue;
      }
      sources.push(source);
    }
    notifyWarnings(ctx, current, warnings);
    if (!sources.length) return;

    if (parentToolCallId) {
      const parentSources = current.pending.get(parentToolCallId) ?? [];
      const known = new Set(parentSources.map(source => source.id));
      current.pending.set(parentToolCallId, [...parentSources, ...sources.filter(source => !known.has(source.id))]);
      return;
    }

    const text = formatScopedInstructions(sources);
    if (!text) return;
    for (const source of sources) current.delivered.add(source.id);
    return {
      content: [...event.content, { type: "text", text }],
      ...(event.structuredContent === undefined ? {} : { structuredContent: event.structuredContent }),
    };
  });
}
