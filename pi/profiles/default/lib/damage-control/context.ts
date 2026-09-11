import type { Effect, Evidence, JudgeConversationMessage, PendingJudgeCall, RuleMatch, SequenceEvidence, VariableEvidence } from "./types.ts";

export const DIRECT_INPUT_LIMIT = 16;
const CONTEXT_BYTES = 16 * 1024;
const CONTEXT_AGE_MS = 30 * 60 * 1000;
type DirectInput = Evidence["operator"][number] & { timestamp: number };

/** Extract only visible user/assistant text from the supplied active branch. */
export function activeConversation(branch: readonly unknown[]): { messages: JudgeConversationMessage[]; omitted: boolean } {
  const messages: JudgeConversationMessage[] = [];
  for (const entry of branch) {
    if (typeof entry !== "object" || entry === null || (entry as { type?: unknown }).type !== "message") continue;
    const message = (entry as { message?: unknown }).message;
    if (typeof message !== "object" || message === null) continue;
    const role = (message as { role?: unknown }).role;
    if (role !== "user" && role !== "assistant") continue;
    const content = (message as { content?: unknown }).content;
    const text = typeof content === "string" ? content : Array.isArray(content)
      ? content.filter((part): part is { type: "text"; text: string } => typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string").map(part => part.text).join("\n")
      : "";
    if (text) messages.push({ role, text });
  }
  return { messages, omitted: false };
}

/** Relevant host observations, not a claim about a later shell/pane environment. */
export function processVariableEvidence(effects: readonly Effect[], environment: Readonly<Record<string, string | undefined>>): VariableEvidence[] {
  const names = new Set<string>();
  for (const effect of effects) for (const target of [...effect.sources, ...effect.targets, ...effect.destinations]) {
    if (target.resolution !== "unknown") continue;
    for (const match of target.expression.matchAll(/\$(?:\{)?(?:env:)?([A-Za-z_][A-Za-z0-9_]*)|%([A-Za-z_][A-Za-z0-9_]*)%/gi)) {
      if (names.size < 16) names.add(match[1] ?? match[2]);
    }
  }
  return [...names].flatMap(name => {
    const value = environment[name];
    if (value === undefined || value.length > 1024) return [];
    return [{ name, value: /password|passwd|pwd|secret|token|(?:api|access|private)_?key|credential|authorization/i.test(name) ? "[REDACTED]" : value,
      source: "process" as const, provenance: "Observed in the gate process only; shell startup, command prefixes, spawn hooks, and remote panes may override it. Not a resolved target or authorization." }];
  });
}

/** Bounded session-local evidence, never an approval cache or resource ownership ledger. */
export class Context {
  private generationValue = 0;
  private inputs: DirectInput[] = [];
  private readonly now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  get generation(): number { return this.generationValue; }
  // Retained for callers that bound queued input; omission is not review evidence.
  noteOmission(): void {}
  private prune(): void {
    const cutoff = this.now() - CONTEXT_AGE_MS;
    const trim = <T extends { timestamp: number }>(items: T[], limit: number) => {
      while (items.length && (items[0].timestamp < cutoff || items.length > limit || Buffer.byteLength(JSON.stringify(items), "utf8") > CONTEXT_BYTES)) {
        items.shift();
      }
    };
    trim(this.inputs, DIRECT_INPUT_LIMIT);

  }
  recordDirectInput(source: unknown, text: unknown): void {
    if ((source !== "interactive" && source !== "rpc") || typeof text !== "string") return;
    if (Buffer.byteLength(text, "utf8") > CONTEXT_BYTES) return;
    this.inputs.push({ source, text, timestamp: this.now() });
    this.prune();
  }
  recordSuccess(_callId?: unknown, _effects?: unknown, _timestamp?: unknown, _created?: unknown): void {}
  recordDockerCreation(_callId?: unknown, _daemon?: unknown, _container?: unknown): void {}
  directInputs(): Evidence["operator"] {
    this.prune();
    return this.inputs.map(({ source, text }) => ({ source, text }));
  }
  wasCreated(_path?: unknown, _timestamp?: unknown): boolean { return false; }
  wasDockerCreated(_daemon?: unknown, _container?: unknown, _timestamp?: unknown): boolean { return false; }
  buildEvidence(callId: string, operation: string, effects: Effect[], matches: RuleMatch[], uncertainties: string[], variables: VariableEvidence[] = [], sequence?: { priorEvents: SequenceEvidence[]; currentEvent: SequenceEvidence }, pendingCall?: PendingJudgeCall, branch?: readonly unknown[]): Evidence {
    const operator = this.directInputs();
    const conversation = branch === undefined ? undefined : activeConversation(branch);
    const omissions: string[] = [];
    return { callId, operation, operator, ...(conversation ? { conversation: conversation.messages } : {}), ...(pendingCall ? { pendingCall } : {}), untrusted: { effects, priorEffects: [], variables: variables.map(item => ({ ...item })), ...(sequence ? { sequence } : {}), matches, uncertainties }, omissions };
  }
  invalidate(): number {
    this.inputs = [];
    this.generationValue += 1;
    return this.generationValue;
  }
  sessionStart(): number { return this.invalidate(); }
  sessionTree(): number { return this.invalidate(); }
  sessionShutdown(): number { return this.invalidate(); }
}
