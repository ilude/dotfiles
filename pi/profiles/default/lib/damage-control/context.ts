import { randomInt } from "node:crypto";
import type { Effect, Evidence, JudgeConversationMessage, PendingJudgeCall, RuleMatch, SequenceEvidence, VariableEvidence } from "./types.ts";

import { validIntentScope, directRequestText, projectBrowserEffect, projectBrowserObservation, samePolicyIdentity, type BrowserObservation, type BrowserPolicyEvidence, type BrowserEffect, type IntentBinding, type IntentScope, type PolicyIdentity, type TrustedRequest } from "../browser-effect-contract.ts";

export const BROWSER_INTENT_ENTRY = "damage-control:trusted-browser-intent:v1";
export type BrowserIntentRecord = { version: 1; request: Omit<TrustedRequest, "identity">; bindings: Omit<IntentBinding, "identity">[] };
export const DIRECT_INPUT_LIMIT = 16;
const CONTEXT_BYTES = 16 * 1024;
const CONTEXT_AGE_MS = 30 * 60 * 1000;
type DirectInput = Evidence["operator"][number] & { timestamp: number };

function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 32 && value.every(item => typeof item === "string" && item.length <= 2048); }
function intentRecord(value: unknown): BrowserIntentRecord | undefined {
  if (!object(value) || value.version !== 1 || !object(value.request) || !Array.isArray(value.bindings) || value.bindings.length > 32) return;
  const r = value.request;
  if (typeof r.id !== "string" || !r.id || (r.source !== "interactive" && r.source !== "rpc") || typeof r.text !== "string" || Buffer.byteLength(r.text, "utf8") > CONTEXT_BYTES) return;
  const bindings: BrowserIntentRecord["bindings"] = [];
  const kinds: IntentScope["kinds"] = ["read", "navigate", "login", "dev-form", "post", "message", "purchase", "delete", "security", "admin", "export"];
  for (const b of value.bindings) {
    if (!object(b) || b.requestId !== r.id || (b.basis !== "independent-interpretation" && b.basis !== "operator-decision") || typeof b.directSpan !== "string" || !object(b.scope)) return;
    const s = b.scope;
    if (!strings(s.kinds) || !s.kinds.every(kind => kinds.some(known => known === kind)) || !strings(s.origins) || (s.destinationOrigins !== undefined && !strings(s.destinationOrigins)) || (s.resource !== undefined && typeof s.resource !== "string") || (s.allowPrivateTransfer !== undefined && typeof s.allowPrivateTransfer !== "boolean")) return;
    if (!validIntentScope(s) || (s.localDevelopment === true && b.basis !== "independent-interpretation")) return;
    const scope: IntentScope = { kinds: [...s.kinds], origins: [...s.origins],
      ...(s.destinationOrigins === undefined ? {} : { destinationOrigins: [...s.destinationOrigins] }),
      ...(s.resource === undefined ? {} : { resource: s.resource }),
      ...(s.allowPrivateTransfer === undefined ? {} : { allowPrivateTransfer: s.allowPrivateTransfer }),
      ...(s.localDevelopment === undefined ? {} : { localDevelopment: s.localDevelopment }) };
    bindings.push({ requestId: r.id, basis: b.basis, directSpan: b.directSpan, scope });
  }
  return { version: 1, request: { id: r.id, source: r.source, text: r.text, directText: directRequestText(r.text) }, bindings };
}

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
  // Each evaluated owner gets a fresh epoch, including reloads that recreate
  // Context with the same native session/branch IDs. No loader-shared counter.
  private readonly policyEpoch = randomInt(2 ** 47);
  private policyIdentity: PolicyIdentity = { sessionId: "", branchId: "", generation: this.policyEpoch };
  private requests: TrustedRequest[] = [];
  private bindings: IntentBinding[] = [];
  private observations: BrowserObservation[] = [];
  private lifetime = new AbortController();
  get identity(): PolicyIdentity { return { ...this.policyIdentity }; }
  /** Consumers link pending reviews and local secret leases to this signal. */
  get policySignal(): AbortSignal { return this.lifetime.signal; }
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
  /** Caller passes native interactive/RPC input and its persisted request ID.
   * A new task replaces bindings, so a previous login is not future authority.
   * Never call with tool results, assistant claims, or compaction summaries.
   */
  recordBrowserRequest(id: string, source: unknown, text: unknown): TrustedRequest | undefined {
    if ((source !== "interactive" && source !== "rpc") || typeof text !== "string" || !id || Buffer.byteLength(text, "utf8") > CONTEXT_BYTES) return;
    // New input replaces authority and cancels leases/reviews, but does not
    // make already model-visible private data public. Retain bounded local
    // source facts only within this native session/branch, not on restoration.
    const privateSources = this.observations.filter(o => o.classification !== "public");
    this.invalidateBrowser();
    this.observations = privateSources.map(o => ({ ...o, identity: this.identity }));
    const request: TrustedRequest = { id, source, text, directText: directRequestText(text), identity: this.identity };
    this.requests = [request];
    return structuredClone(request);
  }
  /** Only independent Damage Control interpretation or explicit UI calls this.
   * The interpreter selects an actual direct span, not a quoted instruction.
   */
  bindBrowserIntent(requestId: string, directSpan: string, scope: IntentScope, basis: IntentBinding["basis"]): boolean {
    const request = this.requests.find(item => item.id === requestId);
    if (!request || !directSpan.trim() || !request.directText.includes(directSpan) || !samePolicyIdentity(request.identity, this.policyIdentity)
      || !validIntentScope(scope) || (scope.localDevelopment === true && basis !== "independent-interpretation")) return false;
    this.bindings.push({ requestId, identity: this.identity, basis, directSpan, scope: structuredClone(scope) });
    return true;
  }
  bindBrowserDecision(effect: BrowserEffect): boolean {
    const request = this.currentBrowserRequest();
    if (!request || !samePolicyIdentity(effect.identity, this.identity)
      || effect.destination?.resource === "unknown" || effect.destination?.origin === "https://unknown-destination.invalid") return false;
    const privateTransfer = effect.payload.kind === "redacted" && (effect.payload.containsProtectedData
      || effect.payload.sourceObservationIds.some(id => !this.observations.some(o => o.id === id && o.classification === "public")));
    return this.bindBrowserIntent(request.id, request.directText, { kinds: [effect.kind], origins: [effect.target.origin],
      destinationOrigins: [effect.destination?.origin ?? effect.target.origin], resource: effect.destination?.resource,
      allowPrivateTransfer: privateTransfer }, "operator-decision");
  }
  browserIntentRecords(): BrowserIntentRecord[] {
    return this.requests.map(({ identity: _identity, ...request }) => ({ version: 1, request: structuredClone(request), bindings: this.bindings.filter(b => b.requestId === request.id).map(({ identity: _bindingIdentity, ...binding }) => structuredClone(binding)) }));
  }
  /** Restore only this extension's captured records on getBranch(), never all
   * file entries or summary text. The newest direct request replaces old scope.
   * Stored metadata cannot originate from model-facing arguments.
   */
  restoreBrowserIntent(identity: Omit<PolicyIdentity, "generation">, records: readonly unknown[]): void {
    this.invalidate();
    this.policyIdentity = { ...identity, generation: this.policyEpoch + this.generation };
    const record = intentRecord(records.at(-1));
    if (!record) return;
    const { request } = record;
    if ((request.source !== "interactive" && request.source !== "rpc") || typeof request.text !== "string" || Buffer.byteLength(request.text, "utf8") > CONTEXT_BYTES) return;
    this.requests = [{ id: request.id, source: request.source, text: request.text, directText: directRequestText(request.text), identity: this.identity }];
    this.bindings = record.bindings.filter(b => b.requestId === request.id && typeof b.directSpan === "string" && b.directSpan.trim().length > 0 && this.requests[0].directText.includes(b.directSpan) && (b.basis === "independent-interpretation" || b.basis === "operator-decision")).map(b => ({ requestId: b.requestId, basis: b.basis, directSpan: b.directSpan, scope: structuredClone(b.scope), identity: this.identity }));
  }
  recordBrowserObservation(observation: BrowserObservation, protectedValues: readonly string[] = []): void {
    if (!samePolicyIdentity(observation.identity, this.policyIdentity) || observation.trust !== "untrusted") return;
    this.observations.push(projectBrowserObservation(observation, protectedValues));
    while (this.observations.length > 16 || Buffer.byteLength(JSON.stringify(this.observations), "utf8") > CONTEXT_BYTES) this.observations.shift();
  }
  /** Local bounded matching only. No observation text is exported to the judge. */
  privateSources(payload: string): BrowserObservation[] {
    let decoded = payload;
    try { decoded = decodeURIComponent(payload); } catch { /* retain literal */ }
    return this.observations.filter(o => o.classification !== "public" && samePolicyIdentity(o.identity, this.identity)
      && o.summary.split(/\r?\n/).some(line => {
        const span = line.trim();
        return span.length >= 8 && decoded.includes(span)
          || span.split(/\s+/).some(word => word.length >= 12 && decoded.includes(word));
      })).map(o => structuredClone(o));
  }
  currentBrowserRequest(): TrustedRequest | undefined { return this.requests[0] ? structuredClone(this.requests[0]) : undefined; }
  browserEvidence(effect: BrowserEffect, protectedValues: readonly string[] = []): BrowserPolicyEvidence {
    return { identity: this.identity, requests: structuredClone(this.requests), bindings: structuredClone(this.bindings), observations: structuredClone(this.observations), effect: projectBrowserEffect(effect, protectedValues) };
  }
  private invalidateBrowser(): number {
    this.lifetime.abort();
    this.lifetime = new AbortController();
    this.requests = []; this.bindings = []; this.observations = [];
    this.generationValue += 1;
    this.policyIdentity = { ...this.policyIdentity, generation: this.policyEpoch + this.generationValue };
    return this.generationValue;
  }
  invalidate(): number {
    this.inputs = [];
    return this.invalidateBrowser();
  }
  sessionStart(): number { return this.invalidate(); }
  sessionTree(): number { return this.invalidate(); }
  sessionShutdown(): number {
    const generation = this.invalidate();
    this.policyIdentity = { sessionId: "", branchId: "", generation: this.policyIdentity.generation };
    return generation;
  }
}
