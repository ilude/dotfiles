import type { Effect, Evidence, RuleMatch } from "./types.ts";

export const DIRECT_INPUT_LIMIT = 0;
/** Session-local generation only. Approval and creation state are never retained. */
export class Context {
  private generationValue = 0;
  constructor(_now: () => number = Date.now) {}
  get generation(): number { return this.generationValue; }
  recordDirectInput(_source?: unknown, _text?: unknown): void {}
  recordSuccess(_callId?: unknown, _effects?: unknown, _timestamp?: unknown, _created?: unknown): void {}
  recordDockerCreation(_callId?: unknown, _daemon?: unknown, _container?: unknown): void {}
  directInputs(_timestamp?: unknown): readonly [] { return []; }
  wasCreated(_path?: unknown, _timestamp?: unknown): boolean { return false; }
  wasDockerCreated(_daemon?: unknown, _container?: unknown, _timestamp?: unknown): boolean { return false; }
  buildEvidence(callId: string, operation: string, effects: Effect[], matches: RuleMatch[], uncertainties: string[]): Evidence {
    return { callId, operation, operator: [], untrusted: { effects, priorEffects: [], matches, uncertainties }, omissions: [] };
  }
  invalidate(): number { this.generationValue += 1; return this.generationValue; }
  sessionStart(): number { return this.invalidate(); }
  sessionTree(): number { return this.invalidate(); }
  sessionShutdown(): number { return this.invalidate(); }
}
