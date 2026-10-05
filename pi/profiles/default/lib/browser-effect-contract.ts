import type { EventBus } from "@earendil-works/pi-coding-agent";

/** Executor facts only. Never construct this projection by spreading tool arguments. */
/** branchId is the captured active-tree anchor on start/tree switch, not the
 * moving leaf ID after each message. Generation invalidates that anchor's work.
 */
export type PolicyIdentity = { sessionId: string; branchId: string; generation: number };
export type BrowserEffectKind = "read" | "navigate" | "login" | "dev-form" | "post" | "message" | "purchase" | "delete" | "security" | "admin" | "export";
export type ObservationClass = "public" | "private" | "credential";
export type BrowserObservation = {
  id: string;
  identity: PolicyIdentity;
  source: "browser" | "tool";
  trust: "untrusted";
  classification: ObservationClass;
  origin: string;
  targetId?: string;
  frameId?: string;
  /** Bounded, value-redacted summary, not a transcript or browser history. */
  summary: string;
  screening: "clean" | "flagged" | "unavailable" | "not-screened";
};
export type BrowserEffect = {
  id: string;
  identity: PolicyIdentity;
  kind: BrowserEffectKind;
  action: string;
  target: { origin: string; visibility: "public" | "private" | "local"; targetId?: string; frameId?: string; control?: string };
  destination?: { origin: string; resource?: string; visibility: "public" | "private" | "local" };
  payload: { kind: "none" } | { kind: "redacted"; sourceObservationIds: string[]; containsProtectedData: boolean } | { kind: "secret-ref"; reference: string; purpose: "login" };
  /** Redacted concrete expected effect. No resolved values, URL queries, or full bodies. */
  expectedEffect: string;
  taskScoped: boolean;
};
export type TrustedRequest = {
  id: string;
  identity: PolicyIdentity;
  source: "interactive" | "rpc";
  /** Original native request retained locally, never promoted from summaries. */
  text: string;
  directText: string;
};
export type IntentScope = {
  kinds: BrowserEffectKind[];
  origins: string[];
  destinationOrigins?: string[];
  /** Exact resource for consequential writes. Origin alone is not sink authorization. */
  resource?: string;
  allowPrivateTransfer?: boolean;
  /** Independent direct-task interpretation only. Guarded executor loopback
   * HTTP(S) facts may select the actual dev port, never login or transfer sinks. */
  localDevelopment?: true;
};
export type IntentBinding = {
  requestId: string;
  identity: PolicyIdentity;
  basis: "independent-interpretation" | "operator-decision";
  directSpan: string;
  scope: IntentScope;
};
export type BrowserPolicyDecision = { outcome: "allow" | "review" | "ask" | "deny"; reason: string };
export type BrowserPolicyEvidence = { identity: PolicyIdentity; requests: TrustedRequest[]; bindings: IntentBinding[]; observations: BrowserObservation[]; effect: BrowserEffect };
export type BrowserPolicyHandler = (effect: BrowserEffect, signal: AbortSignal) => Promise<BrowserPolicyDecision>;

export function samePolicyIdentity(a: PolicyIdentity, b: PolicyIdentity): boolean {
  return a.sessionId === b.sessionId && a.branchId === b.branchId && a.generation === b.generation;
}

/** Conservative data projection, not a perfect natural-language quotation parser.
 * The independent interpreter must still distinguish reported speech from requests.
 */
export function directRequestText(text: string): string {
  return text.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, "")
    .replace(/<([\w:-]+)\b[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/^\s*>.*$/gm, "")
    .replace(/`[^`]*`|"[^"\n]*"|“[^”]*”|'[^'\n]*'/g, "")
    .trim();
}

/** Strict syntactic validation, not natural-language intent verification. */
export function validIntentScope(value: unknown): value is IntentScope {
  if (typeof value !== "object" || value === null) return false;
  const s = value as IntentScope;
  const kinds: BrowserEffectKind[] = ["read", "navigate", "login", "dev-form", "post", "message", "purchase", "delete", "security", "admin", "export"];
  const origins = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 32 && v.every(o => {
    if (typeof o !== "string") return false;
    try { const u = new URL(o); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password && u.origin === o; } catch { return false; }
  });
  if (!Array.isArray(s.kinds) || !s.kinds.length || s.kinds.length > 32 || !s.kinds.every(k => kinds.includes(k))
    || !origins(s.origins) || (s.destinationOrigins !== undefined && !origins(s.destinationOrigins))
    || (s.resource !== undefined && (typeof s.resource !== "string" || s.resource.length > 2048))
    || (s.allowPrivateTransfer !== undefined && typeof s.allowPrivateTransfer !== "boolean")
    || (s.localDevelopment !== undefined && s.localDevelopment !== true)) return false;
  return s.localDevelopment === true
    ? s.origins.length === 0 && s.destinationOrigins === undefined && s.resource === undefined
      && s.allowPrivateTransfer !== true && s.kinds.every(k => ["read", "navigate", "dev-form"].includes(k))
    : s.origins.length > 0;
}

/** Only parser-normalized origins, not private DNS, wildcard hosts or raw URLs.
 * The browser executor rejects its actual CDP endpoint before policy submission. */
function loopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return ["http:", "https:"].includes(u.protocol) && u.origin === origin && !u.username && !u.password
      && (u.hostname === "localhost" || u.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(u.hostname));
  } catch { return false; }
}

/** Exact scope matching. Interpretation happens once, outside the acting model. */
export function effectCandidate(evidence: BrowserPolicyEvidence): BrowserPolicyDecision {
  const { identity, effect } = evidence;
  if (!identity.sessionId || !identity.branchId || !samePolicyIdentity(identity, effect.identity)) return { outcome: "deny", reason: "Session or branch changed; inspect the action again." };
  const privateTransfer = effect.payload.kind === "redacted" && (effect.payload.containsProtectedData || effect.payload.sourceObservationIds.some(id => !evidence.observations.some(o => o.id === id && samePolicyIdentity(identity, o.identity) && o.classification === "public")));
  if (effect.payload.kind === "secret-ref" && effect.kind !== "login") return { outcome: "deny", reason: "Credential references are only available for bound login fills." };
  const authorized = evidence.bindings.some(binding => {
    const scope = binding.scope;
    if (!validIntentScope(scope)) return false;
    const localDevelopment = scope.localDevelopment === true && binding.basis === "independent-interpretation"
      && effect.payload.kind !== "secret-ref" && !privateTransfer
      && loopbackOrigin(effect.target.origin) && (!effect.destination || loopbackOrigin(effect.destination.origin));
    return samePolicyIdentity(identity, binding.identity)
      && evidence.requests.some(request => request.id === binding.requestId && samePolicyIdentity(identity, request.identity) && binding.directSpan.trim().length > 0 && request.directText.includes(binding.directSpan))
      && scope.kinds.includes(effect.kind) && (localDevelopment || scope.origins.includes(effect.target.origin))
      && (localDevelopment || !effect.destination || (scope.destinationOrigins ?? scope.origins).includes(effect.destination.origin))
      && (scope.resource === undefined ? ["read", "navigate", "login", "dev-form"].includes(effect.kind) : scope.resource === effect.destination?.resource)
      && (!privateTransfer || scope.allowPrivateTransfer === true);
  });
  if (authorized) return { outcome: "allow", reason: "The direct request or operator decision authorizes this scoped action." };
  const dependencySource = effect.target.visibility === "public" || evidence.bindings.some(binding => {
    const scope = binding.scope;
    return validIntentScope(scope) && samePolicyIdentity(identity, binding.identity)
      && evidence.requests.some(request => request.id === binding.requestId && samePolicyIdentity(identity, request.identity)
        && binding.directSpan.trim().length > 0 && request.directText.includes(binding.directSpan))
      && (scope.localDevelopment === true && binding.basis === "independent-interpretation" && loopbackOrigin(effect.target.origin)
        || scope.resource === undefined && scope.origins.includes(effect.target.origin) && scope.kinds.some(kind => ["read", "login", "dev-form"].includes(kind)));
  });
  if (!privateTransfer && effect.payload.kind !== "secret-ref" && effect.kind === "read"
    && effect.destination?.visibility === "public" && dependencySource
    && /^(?:GET|HEAD) (?:Script|Stylesheet|Image|Font|Media|Document)(?: redirect)?$/.test(effect.action)) {
    return { outcome: "allow", reason: "Public browser dependency or navigation without protected source data." };
  }
  if (!privateTransfer && effect.payload.kind !== "secret-ref" && effect.target.visibility !== "private" && effect.destination?.visibility !== "private"
    && (effect.target.visibility === "public" || effect.taskScoped)
    && (effect.destination?.visibility !== "local" || effect.taskScoped)
    && (effect.kind === "read" || (effect.kind === "navigate" && effect.taskScoped))) {
    return { outcome: "allow", reason: "Routine public reading or task-scoped navigation." };
  }
  return { outcome: "review", reason: privateTransfer ? "Check the private observation transfer against the requested recipient and purpose." : "Check this account, destination, or consequential action against direct operator intent." };
}

/** Redaction for local executor metadata. Call before storing an observation or
 * exporting effect evidence. This does not retroactively erase native inputs.
 */
export function redactBrowserMetadata(text: string, protectedValues: readonly string[] = []): string {
  let result = text;
  for (const value of protectedValues) if (value) result = result.split(value).join("[REDACTED]");
  return result.replace(/https?:\/\/[^\s<>"']+/g, value => {
    try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return "[REDACTED URL]"; }
  }).slice(0, 2048);
}

/** Opaque/file provenance is not public origin authority. Files retain their native
 * path in the separately checked filesystem boundary, never a fabricated HTTP origin. */
function evidenceOrigin(origin: string): string {
  if (origin === "null" || origin === "file://") return origin;
  return new URL(origin).origin;
}

export function projectBrowserObservation(input: BrowserObservation, protectedValues: readonly string[] = []): BrowserObservation {
  return {
    id: input.id, identity: { sessionId: input.identity.sessionId, branchId: input.identity.branchId, generation: input.identity.generation },
    source: input.source, trust: "untrusted", classification: input.classification,
    origin: evidenceOrigin(input.origin),
    ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
    ...(input.frameId === undefined ? {} : { frameId: input.frameId }),
    summary: redactBrowserMetadata(input.summary, protectedValues), screening: input.screening,
  };
}

export function projectBrowserEffect(input: BrowserEffect, protectedValues: readonly string[] = []): BrowserEffect {
  const clean = (text: string) => redactBrowserMetadata(text, protectedValues);
  const payload: BrowserEffect["payload"] = input.payload.kind === "none" ? { kind: "none" }
    : input.payload.kind === "secret-ref" ? { kind: "secret-ref", reference: input.payload.reference, purpose: "login" }
    : { kind: "redacted", sourceObservationIds: input.payload.sourceObservationIds.slice(0, 16), containsProtectedData: input.payload.containsProtectedData };
  return {
    id: input.id, identity: { sessionId: input.identity.sessionId, branchId: input.identity.branchId, generation: input.identity.generation },
    kind: input.kind, action: clean(input.action), taskScoped: input.taskScoped,
    target: { origin: evidenceOrigin(input.target.origin), visibility: input.target.visibility,
      ...(input.target.targetId === undefined ? {} : { targetId: input.target.targetId }),
      ...(input.target.frameId === undefined ? {} : { frameId: input.target.frameId }),
      ...(input.target.control === undefined ? {} : { control: clean(input.target.control) }) },
    ...(input.destination === undefined ? {} : { destination: { origin: evidenceOrigin(input.destination.origin), visibility: input.destination.visibility,
      ...(input.destination.resource === undefined ? {} : { resource: clean(input.destination.resource) }) } }),
    payload, expectedEffect: clean(input.expectedEffect),
  };
}

export const BROWSER_POLICY_CHANNEL = "damage-control:browser-effect:v1";
const LOCAL_FILE_CHANNEL = `${BROWSER_POLICY_CHANNEL}:local-file`;
export type BrowserLocalFileRequest = { identity: PolicyIdentity; nativePath: string };
type LocalFileEnvelope = BrowserLocalFileRequest & { signal: AbortSignal; accept: (result: Promise<BrowserPolicyDecision>) => void };

/** Trusted executor boundary for one exact native file read. This authorizes only;
 * it never reads contents. No model arguments or approval claims cross this API.
 */
export async function requestBrowserLocalFilePolicy(bus: EventBus, identity: PolicyIdentity, nativePath: string, signal: AbortSignal): Promise<BrowserPolicyDecision> {
  if (signal.aborted) return { outcome: "deny", reason: "Local file action canceled." };
  const answers: Promise<BrowserPolicyDecision>[] = [];
  bus.emit(LOCAL_FILE_CHANNEL, { identity: { ...identity }, nativePath, signal, accept: answer => answers.push(answer) } satisfies LocalFileEnvelope);
  if (answers.length !== 1) {
    for (const answer of answers) void answer.catch(() => {});
    return { outcome: "ask", reason: "Filesystem policy owner is unavailable or ambiguous." };
  }
  return waitForPolicy(answers[0], signal);
}
type PolicyEnvelope = { effect: BrowserEffect; signal: AbortSignal; accept: (result: Promise<BrowserPolicyDecision>) => void };
const IDENTITY_CHANNEL = `${BROWSER_POLICY_CHANNEL}:identity`;
const OBSERVATION_CHANNEL = `${BROWSER_POLICY_CHANNEL}:observation`;
type IdentityEnvelope = { accept: (identity: PolicyIdentity, signal?: AbortSignal) => void };

/** Trusted local lifetime only. Raw values and pending work must not outlive
 * the sole current owner generation, including delivered queued input. */
export function browserPolicyLease(bus: EventBus): { identity: PolicyIdentity; signal: AbortSignal } | undefined {
  const leases: Array<{ identity: PolicyIdentity; signal: AbortSignal }> = [];
  let owners = 0;
  bus.emit(IDENTITY_CHANNEL, { accept: (identity: PolicyIdentity, signal?: AbortSignal) => {
    owners++;
    if (signal instanceof AbortSignal && !signal.aborted) leases.push({ identity: { ...identity }, signal });
  } } satisfies IdentityEnvelope);
  return owners === 1 && leases.length === 1 ? leases[0] : undefined;
}

export function browserPolicyIdentity(bus: EventBus): PolicyIdentity | undefined {
  const identities: PolicyIdentity[] = [];
  bus.emit(IDENTITY_CHANNEL, { accept: (identity: PolicyIdentity) => identities.push({ ...identity }) } satisfies IdentityEnvelope);
  return identities.length === 1 ? identities[0] : undefined;
}
export function publishBrowserObservation(bus: EventBus, observation: BrowserObservation): void {
  bus.emit(OBSERVATION_CHANNEL, projectBrowserObservation(observation));
}
function isPolicyEnvelope(value: unknown): value is PolicyEnvelope {
  if (typeof value !== "object" || value === null || !("accept" in value) || typeof value.accept !== "function" || !("signal" in value) || !(value.signal instanceof AbortSignal) || !("effect" in value)) return false;
  const e = value.effect;
  return typeof e === "object" && e !== null && "identity" in e && "kind" in e && "target" in e && "payload" in e;
}

/** One owner per runtime bus. No imported mutable singleton. Bind on session start,
 * unsubscribe on shutdown; Context invalidation aborts its session-owned work.
 * The bus is a trusted extension boundary, not a model-callable authority API.
 * Consumers send effects/observations only; the owner builds trusted evidence.
 */
export function bindBrowserPolicy(bus: EventBus, handler: BrowserPolicyHandler, owner: { identity: () => PolicyIdentity; signal: () => AbortSignal; observe: (observation: BrowserObservation) => void; localFile?: (request: BrowserLocalFileRequest, signal: AbortSignal) => Promise<BrowserPolicyDecision> }): () => void {
  const stopIdentity = bus.on(IDENTITY_CHANNEL, (data: unknown) => {
    if (typeof data === "object" && data !== null && "accept" in data && typeof data.accept === "function") data.accept(owner.identity(), owner.signal());
  });
  const stopObservation = bus.on(OBSERVATION_CHANNEL, (data: unknown) => {
    if (isObservation(data)) owner.observe(projectBrowserObservation(data));
  });
  const stopPolicy = bus.on(BROWSER_POLICY_CHANNEL, (data: unknown) => {
    // Payloads originate from requestBrowserPolicy in another trusted extension,
    // not JSON or model arguments. Reject unrelated event-bus messages.
    if (!isPolicyEnvelope(data)) return;
    const signal = AbortSignal.any([data.signal, owner.signal()]);
    data.accept(waitForPolicy(Promise.resolve().then(() => {
      if (!samePolicyIdentity(data.effect.identity, owner.identity())) return { outcome: "deny", reason: "Session or branch changed; inspect this action again." } satisfies BrowserPolicyDecision;
      return handler(data.effect, signal);
    }).then(result => samePolicyIdentity(data.effect.identity, owner.identity()) ? result : { outcome: "deny", reason: "Session or branch changed; inspect this action again." }), signal));
  });
  const stopLocalFile = bus.on(LOCAL_FILE_CHANNEL, (data: unknown) => {
    if (typeof data !== "object" || data === null || !("accept" in data) || typeof data.accept !== "function" || !("signal" in data) || !(data.signal instanceof AbortSignal) || !("nativePath" in data) || typeof data.nativePath !== "string" || !("identity" in data) || typeof data.identity !== "object" || data.identity === null) return;
    const request = data as LocalFileEnvelope;
    const signal = AbortSignal.any([request.signal, owner.signal()]);
    const current = () => !signal.aborted && samePolicyIdentity(request.identity, owner.identity());
    data.accept(waitForPolicy(Promise.resolve().then(() => {
      if (!current()) return { outcome: "deny", reason: "Local file context expired." } satisfies BrowserPolicyDecision;
      return owner.localFile?.({ identity: { ...request.identity }, nativePath: request.nativePath }, signal) ?? { outcome: "deny", reason: "Filesystem policy is unavailable." } satisfies BrowserPolicyDecision;
    }).then((result): BrowserPolicyDecision => current() ? result : { outcome: "deny", reason: "Local file context expired." }), signal));
  });
  return () => { stopIdentity(); stopObservation(); stopPolicy(); stopLocalFile(); };
}
function isObservation(value: unknown): value is BrowserObservation {
  return typeof value === "object" && value !== null && "trust" in value && value.trust === "untrusted" && "identity" in value && "origin" in value && typeof value.origin === "string" && "summary" in value && typeof value.summary === "string";
}

/** Pi's event bus does not await listeners. Acceptance must happen synchronously.
 * Missing/duplicate owners and errors stop only this action, not ordinary browsing.
 */
export async function requestBrowserPolicy(bus: EventBus, effect: BrowserEffect, signal: AbortSignal): Promise<BrowserPolicyDecision> {
  if (signal.aborted) return { outcome: "deny", reason: "Action canceled; inspect it again in the current session." };
  const answers: Promise<BrowserPolicyDecision>[] = [];
  bus.emit(BROWSER_POLICY_CHANNEL, { effect: projectBrowserEffect(effect), signal, accept: (answer: Promise<BrowserPolicyDecision>) => answers.push(answer) } satisfies PolicyEnvelope);
  if (answers.length !== 1) {
    for (const answer of answers) void answer.catch(() => {});
    return { outcome: "ask", reason: "Browser policy owner is unavailable or ambiguous; retry after runtime setup." };
  }
  return waitForPolicy(answers[0], signal);
}
function waitForPolicy(answer: Promise<BrowserPolicyDecision>, signal: AbortSignal): Promise<BrowserPolicyDecision> {
  return new Promise(resolve => {
    const canceled = () => finish({ outcome: "deny", reason: "Action invalidated; inspect it again in the current session." });
    const finish = (result: BrowserPolicyDecision) => { signal.removeEventListener("abort", canceled); resolve(result); };
    signal.addEventListener("abort", canceled, { once: true });
    if (signal.aborted) canceled();
    void answer.then(result => finish(signal.aborted ? { outcome: "deny", reason: "Action invalidated; inspect it again in the current session." } : result), () => finish({ outcome: "ask", reason: "Policy review failed; ask about this specific action." }));
  });
}
