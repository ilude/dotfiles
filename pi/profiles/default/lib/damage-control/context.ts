import type { Effect, Evidence, RuleMatch, ToolRequest } from "./types.ts";

export const DIRECT_INPUT_LIMIT = 16;
const CONTEXT_BYTES = 16 * 1024;
const TOOL_RESULT_LIMIT = 8;
const CONTEXT_AGE_MS = 30 * 60 * 1000;
type DirectInput = Evidence["operator"][number] & { timestamp: number };
type Observation = NonNullable<Evidence["untrusted"]["observations"]>[number];

/** Bounded session-local evidence, never an approval cache or resource ownership ledger. */
export class Context {
  private generationValue = 0;
  private inputs: DirectInput[] = [];
  private observations: Observation[] = [];
  private omitted = false;
  private readonly now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  get generation(): number { return this.generationValue; }
  noteOmission(): void { this.omitted = true; }
  private prune(): void {
    const cutoff = this.now() - CONTEXT_AGE_MS;
    const trim = <T extends { timestamp: number }>(items: T[], limit: number) => {
      while (items.length && (items[0].timestamp < cutoff || items.length > limit || Buffer.byteLength(JSON.stringify(items), "utf8") > CONTEXT_BYTES)) {
        items.shift(); this.omitted = true;
      }
    };
    trim(this.inputs, DIRECT_INPUT_LIMIT);
    trim(this.observations, TOOL_RESULT_LIMIT);
  }
  recordDirectInput(source: unknown, text: unknown): void {
    if ((source !== "interactive" && source !== "rpc") || typeof text !== "string") return;
    if (Buffer.byteLength(text, "utf8") > CONTEXT_BYTES) { this.noteOmission(); return; }
    this.inputs.push({ source, text, timestamp: this.now() });
    this.prune();
  }
  recordToolResult(request: ToolRequest, output: string): void {
    const observation = { callId: request.callId, tool: request.tool, operation: request.text, cwd: request.cwd, output, timestamp: this.now() };
    if (Buffer.byteLength(JSON.stringify(observation), "utf8") > CONTEXT_BYTES) { this.noteOmission(); return; }
    this.observations.push(observation);
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
  buildEvidence(callId: string, operation: string, effects: Effect[], matches: RuleMatch[], uncertainties: string[]): Evidence {
    const operator = this.directInputs();
    return { callId, operation, operator, untrusted: { effects, priorEffects: [], observations: this.observations.map(item => ({ ...item })), matches, uncertainties }, omissions: this.omitted ? ["Some session context expired or was omitted by bounds; do not infer missing intent or environment facts"] : [] };
  }
  invalidate(): number {
    this.inputs = []; this.observations = []; this.omitted = false;
    this.generationValue += 1;
    return this.generationValue;
  }
  sessionStart(): number { return this.invalidate(); }
  sessionTree(): number { return this.invalidate(); }
  sessionShutdown(): number { return this.invalidate(); }
}
