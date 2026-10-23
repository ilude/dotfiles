import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { BrowserControlError } from "./browser-control.js";
import type { BrowserCdpTransport, CdpEvent, ManagedTargetSetup, CdpFrame } from "./browser-cdp-transport.js";
import { samePolicyIdentity, type BrowserEffect, type BrowserPolicyDecision, type BrowserPolicyHandler, type PolicyIdentity } from "./browser-effect-contract.js";

export type BrowserDestination = { url: string; origin: string; resource: string; host: string; visibility: "public" | "private" | "local"; filePath?: string };
const deny = (reason: string): BrowserPolicyDecision => ({ outcome: "deny", reason });
async function boundedWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void work.catch(() => {}); throw new BrowserControlError("cancelled", "Browser request cancelled."); }
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(new BrowserControlError("cancelled", "Browser request cancelled."));
    signal.addEventListener("abort", abort, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function refused(reason: string): never { throw new BrowserControlError("destination_refused", reason); }

export function hasNativeSecurityWarning(state: { securityState?: string; certificateSecurityState?: { certificateNetworkError?: string }; safetyTipInfo?: { safetyTipStatus?: string }; securityStateIssueIds?: string[] } | undefined, url: string, allowLocalhostTlsErrors: boolean): boolean {
  let hostname = "";
  try { hostname = new URL(url).hostname.toLowerCase().replace(/\\.$/, ""); } catch { /* Unknown URLs do not qualify for the exception. */ }
  const localhost = hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "::1";
  const ignoredLocalhostCertificate = allowLocalhostTlsErrors && localhost && Boolean(state?.certificateSecurityState?.certificateNetworkError);
  return (state?.securityState === "insecure-broken" && !ignoredLocalhostCertificate) || Boolean(state?.certificateSecurityState?.certificateNetworkError && !ignoredLocalhostCertificate) || Boolean(state?.securityStateIssueIds?.includes("malicious-content")) || ["badReputation", "lookalike"].includes(state?.safetyTipInfo?.safetyTipStatus ?? "");
}

/** WHATWG parsing handles IDNs, alternate IPv4 notation, escapes and authority delimiters. */
export function parseBrowserDestination(raw: string, cdpPort: number, allowBlank = false): BrowserDestination {
  let url: URL;
  try { url = new URL(raw); } catch { return refused("Use an absolute browser destination URL."); }
  if (url.username || url.password) return refused("Embedded URL credentials are not supported.");
  if (allowBlank && url.href === "about:blank") return { url: url.href, origin: "null", resource: "", host: "", visibility: "local" };
  if (url.protocol === "file:") {
    if (url.hostname && url.hostname !== "localhost") return refused("Remote file authorities require a separate filesystem operation.");
    let filePath: string;
    try { filePath = fileURLToPath(url); } catch { return refused("Invalid local file destination."); }
    return { url: url.href, origin: "file://", resource: url.pathname, host: "", visibility: "local", filePath };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return refused("Only HTTP/HTTPS or explicitly requested local files are supported; browser settings and executable schemes are unavailable.");
  const canonicalHost = url.hostname.replace(/\.+$/, "");
  if (!canonicalHost) return refused("The destination requires a nonempty hostname.");
  url.hostname = canonicalHost;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const visibility = hostVisibility(host);
  if ((visibility === "local" || host === "0.0.0.0" || host === "::") && Number(url.port || (url.protocol === "https:" ? 443 : 80)) === cdpPort) return refused("The browser control endpoint is not a page destination.");
  return { url: url.href, origin: url.origin, resource: url.pathname, host, visibility };
}

/** Address classification is not a browser connection/IP isolation guarantee. */
export function hostVisibility(host: string): BrowserDestination["visibility"] {
  host = host.toLowerCase().replace(/\.+$/, "").replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return "local";
  if (isIP(host) === 4) {
    const [a = 0, b = 0] = host.split(".").map(Number);
    if (a === 127) return "local";
    if (a === 0 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return "private";
    return "public";
  }
  if (isIP(host) === 6) {
    // Expand through the URL parser to normalize IPv4-mapped hexadecimal addresses.
    if (host === "::1") return "local";
    if (host.startsWith("::ffff:")) {
      const tail = host.slice(7);
      if (isIP(tail) === 4) return hostVisibility(tail);
      const words = tail.split(":").map(word => Number.parseInt(word, 16));
      if (words.length === 2) return hostVisibility(`${words[0]! >>> 8}.${words[0]! & 255}.${words[1]! >>> 8}.${words[1]! & 255}`);
    }
    if (host === "::" || /^(fc|fd|fe[89ab]|ff)/.test(host)) return "private";
    return "public";
  }
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return "private";
  return "public";
}

export interface BrowserRequestFacts {
  targetId: string; sessionId: string; frameId?: string; frameLoaderId?: string; executionContextId?: number; sourceOrigin: string;
  destination: BrowserDestination; method: string; resourceType: string;
  hasBody: boolean; hasQuery: boolean; redirected: boolean; initialization?: boolean;
  /** Local trusted-executor inspection only. Never copy into effects, diagnostics or tool results. */
  rawUrl: string;
  /** CDP may omit postData even when hasBody is true. Absence is not evidence of a clean payload. */
  postData?: string;
}
export type BrowserRequestProjection = Pick<BrowserEffect, "kind" | "payload" | "taskScoped"> & { targetVisibility?: BrowserEffect["target"]["visibility"]; destinationVisibility?: BrowserEffect["target"]["visibility"] };
export type BrowserRequestFailure = {
  phase: "navigation" | "intercepted";
  stage: "safety" | "identity" | "destination" | "frame" | "source" | "projection" | "classification" | "policy" | "postcheck" | "dispatch";
  code: string;
  cancellation: "none" | "policy-disposed" | "target-disconnected" | "caller-aborted" | "deadline";
};
// Never serialize exception messages, arbitrary error codes, or request/frame metadata.
const diagnosticCodes = new Set(["cancelled", "destination_refused", "cdp_disconnected", "cdp_timeout", "cdp_failed", "cdp_unsupported", "session_stale", "target_missing", "frame_missing", "frame_stale", "request_malformed", "opaque_source", "file_lease_invalid", "policy_denied"]);
export interface BrowserRequestPolicyOptions {
  cdpPort: number;
  identity: () => PolicyIdentity;
  policy: BrowserPolicyHandler;
  /** Trusted executor projection of current observations/represented fill or click. Never page assertions.
   * Inspect rawUrl/postData locally here; throw to stop a known secret request before our DNS
   * lookup or any origin/path metadata reaches policy. Errors are sanitized. destination.visibility
   * is syntactic at this point; DNS classification is applied before policy. Returned fields must be value-redacted.
   */
  effect?: (facts: BrowserRequestFacts) => BrowserRequestProjection;
  /** T4 filesystem enforcement. Only represented explicit file reads reach this callback. */
  localFile?: (path: string, signal: AbortSignal) => Promise<BrowserPolicyDecision>;
  resolveHost?: (host: string) => Promise<readonly string[]>;
  timeoutMs?: number;
  /** Fixed, value-free diagnostics only. The observer cannot authorize a request. */
  failure?: (failure: BrowserRequestFailure) => void;
  /** Operator-attached browsers retain normal page traffic; explicit navigation is still checked. */
  interceptRequests?: boolean;
  /** Explicit Chromium localhost-only certificate exception for owned isolated sessions. */
  allowLocalhostTlsErrors?: boolean;
}

/** Guards only managed targets. Fetch Request stage gates each observed redirect hop before sending.
 * No TLS preflight, certificate override, global tab interception, proxy, or security-setting mutation.
 * Fetch does not cover all browser network facilities (notably established sockets/WebRTC), prior/manual
 * traffic, or guarantee a popup's first real request is paused by auto-attach. DNS classification resolves
 * separately from Chromium and cannot prevent rebinding, connection reuse, or all subresource/IP races.
 * Detaching/disconnecting can release interception; it stops agent operations, not the operator's browser.
 * Local file reads need represented filesystem authorization: Fetch is not general file-access confinement.
 */
export class BrowserRequestPolicy {
  private transport?: BrowserCdpTransport;
  private unsubscribe?: () => void;
  private readonly setups = new Map<string, ManagedTargetSetup>();
  private readonly warnings = new Set<string>();
  private readonly interstitials = new Set<string>();
  private readonly lifetime = new AbortController();
  private sequence = 0;
  private readonly fileNavigations = new Map<string, { identity: PolicyIdentity; url: string; nativePath: string; frame: Readonly<CdpFrame>; signal: AbortSignal }>();
  private readonly documentNavigations = new Map<string, { identity: PolicyIdentity; url: string; visibility: BrowserDestination["visibility"]; projection: BrowserRequestProjection; frame: Readonly<CdpFrame>; signal: AbortSignal }>();
  private readonly options: BrowserRequestPolicyOptions;
  constructor(options: BrowserRequestPolicyOptions) { this.options = options; }

  bind(transport: BrowserCdpTransport): void {
    if (this.transport) throw new Error("Browser request policy already bound.");
    this.transport = transport;
    this.unsubscribe = transport.onEvent(event => this.event(event));
  }
  /** Pass this callback to runtime.connectTransport, then bind before manage/create. */
  register = async (setup: ManagedTargetSetup): Promise<void> => {
    this.setups.set(setup.target.targetId, setup);
    setup.signal.addEventListener("abort", () => { this.setups.delete(setup.target.targetId); this.warnings.delete(setup.target.targetId); this.interstitials.delete(setup.target.targetId); this.documentNavigations.delete(setup.target.targetId); }, { once: true });
    try { if (this.options.interceptRequests !== false) await setup.command("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] }); }
    catch (error) {
      // Chromium does not expose Fetch on dedicated worker sessions. Refusing them disconnected every
      // page that starts a worker; their requests remain outside managed interception (documented limit).
      if (!(setup.target.type === "worker" && (error as { code?: string }).code === "cdp_unsupported")) throw error;
    }
    // The Security domain reports the tab's visible security state and is available only on page
    // sessions. Chromium rejects Security.enable on out-of-process iframe sessions, which previously
    // failed registration and disconnected every page with a cross-site iframe.
    if (setup.target.type === "page") await setup.command("Security.enable");
  };

  assertSafe(targetId: string): void {
    if (this.lifetime.signal.aborted || !this.setups.has(targetId)) refused("Select and register the exact browser target first.");
    if (this.warnings.has(targetId) || this.interstitials.has(targetId)) refused("The browser reports a native security warning. Resolve it manually without bypassing TLS or Safe Browsing.");
    const target = this.transport?.managedTargets().find(item => item.targetId === targetId);
    if (!target) refused("The exact browser target is no longer managed.");
    parseBrowserDestination(target.url, this.options.cdpPort, true);
  }

  /** Call before Page.navigate. Blank is reserved to transport.create(), not ordinary navigation. */
  async authorizeNavigation(targetId: string, raw: string, signal?: AbortSignal): Promise<BrowserDestination> {
    let stage: BrowserRequestFailure["stage"] = "safety", activeSignal: AbortSignal | undefined;
    try {
    this.fileNavigations.delete(targetId);
    this.documentNavigations.delete(targetId);
    this.assertSafe(targetId);
    const identity = { ...this.options.identity() };
    const pending = this.actionSignal(targetId, signal);
    const initial = this.signal(targetId, pending);
    activeSignal = initial; stage = "identity";
    await boundedWork(this.transport!.revalidate(initial), initial);
    stage = "frame";
    const roots = (await boundedWork(this.transport!.frameList(targetId, initial), initial)).filter(frame => !frame.parentFrameId && frame.targetId === targetId);
    if (roots.length !== 1) refused("Navigation requires the exact main frame.");
    const frame = roots[0]!;
    stage = "destination";
    const destination = parseBrowserDestination(raw, this.options.cdpPort);
    stage = "projection";
    let navigationProjection: BrowserRequestProjection | undefined;
    if (destination.filePath !== undefined) {
      this.project({ targetId, sessionId: this.setups.get(targetId)!.target.sessionId, sourceOrigin: destination.origin, destination, method: "GET", resourceType: "Document", hasBody: false, hasQuery: new URL(destination.url).search.length > 0, redirected: false, rawUrl: raw });
      activeSignal = pending; stage = "policy";
      if (!this.options.localFile || (await boundedWork(this.options.localFile(destination.filePath, pending), pending)).outcome !== "allow") refused("This local file read requires filesystem-policy authorization.");
    } else {
      const facts: BrowserRequestFacts = { targetId, sessionId: this.setups.get(targetId)!.target.sessionId, sourceOrigin: destination.origin, destination, method: "GET", resourceType: "Document", hasBody: false, hasQuery: new URL(destination.url).search.length > 0, redirected: false, rawUrl: raw };
      const projection = this.project(facts);
      navigationProjection = structuredClone(projection);
      stage = "classification"; activeSignal = this.signal(targetId, pending);
      await this.classify(destination, activeSignal);
      if (pending.aborted || !samePolicyIdentity(identity, this.options.identity())) refused("Browser navigation cancelled or task changed.");
      stage = "policy"; activeSignal = pending;
      const decision = await this.decide(facts, pending, projection, identity, "Explicit navigation to the checked destination; subsequent page traffic is not intercepted in attached mode.");
      if (decision.outcome !== "allow") refused(decision.reason);
    }
    if (pending.aborted || !samePolicyIdentity(identity, this.options.identity())) refused("Browser navigation cancelled or task changed.");
    const bounded = this.signal(targetId, pending);
    stage = "postcheck"; activeSignal = bounded;
    await boundedWork(this.transport!.revalidateFrame(frame, bounded), bounded);
    this.assertSafe(targetId);
    if (!samePolicyIdentity(identity, this.options.identity()) || bounded.aborted) refused("Browser navigation cancelled or task changed.");
    if (destination.filePath !== undefined) this.fileNavigations.set(targetId, { identity, url: destination.url, nativePath: destination.filePath, frame, signal: bounded });
    else if (navigationProjection && this.options.interceptRequests !== false) this.documentNavigations.set(targetId, { identity, url: destination.url, visibility: destination.visibility, projection: navigationProjection, frame, signal: bounded });
    return destination;
    } catch (error) {
      this.reportFailure("navigation", stage, error, targetId, activeSignal, signal);
      throw error;
    }
  }

  private reportFailure(phase: BrowserRequestFailure["phase"], stage: BrowserRequestFailure["stage"], error: unknown, targetId: string, signal?: AbortSignal, caller?: AbortSignal): void {
    let code = error instanceof BrowserControlError && diagnosticCodes.has(error.code) ? error.code : "inspection_failed";
    if (code === "destination_refused" && (stage === "safety" || stage === "postcheck") && (this.warnings.has(targetId) || this.interstitials.has(targetId))) code = "native_warning";
    const cancellation: BrowserRequestFailure["cancellation"] = this.lifetime.signal.aborted ? "policy-disposed"
      : this.transport?.signal.aborted || this.setups.get(targetId)?.signal.aborted ? "target-disconnected"
      : caller?.aborted ? "caller-aborted" : signal?.aborted ? "deadline" : "none";
    try { this.options.failure?.({ phase, stage, code, cancellation }); } catch { /* Diagnostics cannot change enforcement. */ }
  }

  private actionSignal(targetId: string, caller?: AbortSignal): AbortSignal {
    return AbortSignal.any([this.lifetime.signal, this.setups.get(targetId)!.signal, ...(caller ? [caller] : [])]);
  }
  private signal(targetId: string, caller?: AbortSignal): AbortSignal {
    return AbortSignal.any([this.actionSignal(targetId, caller), AbortSignal.timeout(this.options.timeoutMs ?? 10_000)]);
  }
  private async classify(destination: BrowserDestination, signal: AbortSignal): Promise<BrowserDestination> {
    if (destination.filePath !== undefined || isIP(destination.host)) return destination;
    const addresses = await boundedWork((this.options.resolveHost ?? (async host => (await lookup(host, { all: true })).map(item => item.address)))(destination.host), signal);
    if (!addresses.length) refused("The destination hostname could not be classified.");
    // Public names resolving internally still need private authorization. The actual browser resolver is separate.
    if (addresses.some(address => hostVisibility(address) !== "public") && destination.visibility === "public") destination.visibility = "private";
    if (addresses.some(address => hostVisibility(address) === "local") && Number(new URL(destination.url).port || (new URL(destination.url).protocol === "https:" ? 443 : 80)) === this.options.cdpPort) refused("The browser control endpoint is not a page destination.");
    return destination;
  }
  private project(facts: BrowserRequestFacts): BrowserRequestProjection {
    // Local protected-value refusal precedes our DNS lookup as well as the policy handoff.
    // Chromium may already have resolved/preconnected before Fetch pauses; this is not DNS isolation.
    try {
      return this.options.effect?.(facts) ?? { kind: facts.method === "GET" || facts.method === "HEAD" ? "read" : "export", payload: facts.hasBody ? { kind: "redacted", sourceObservationIds: [], containsProtectedData: false } : { kind: "none" }, taskScoped: false };
    } catch { return refused("The local browser request inspection refused this transfer."); }
  }
  private async decide(facts: BrowserRequestFacts, signal: AbortSignal, projection: BrowserRequestProjection, identity = this.options.identity(), expectedEffect?: string): Promise<BrowserPolicyDecision> {
    const effect: BrowserEffect = {
      id: `browser-request-${++this.sequence}`, identity: { ...identity },
      kind: projection.kind, payload: projection.payload, taskScoped: projection.taskScoped, action: `${facts.method} ${facts.resourceType}${facts.redirected ? " redirect" : ""}`,
      target: { origin: facts.sourceOrigin, visibility: projection.targetVisibility ?? hostVisibility(new URL(facts.sourceOrigin).hostname), targetId: facts.targetId, ...(facts.frameId ? { frameId: facts.frameId } : {}) },
      destination: { origin: facts.destination.origin, resource: facts.destination.resource, visibility: projection.destinationVisibility ?? facts.destination.visibility },
      expectedEffect: expectedEffect ?? (facts.initialization ? "Initial Document navigation from opaque blank; target is the arriving destination, not a source observation. Body, headers and query omitted." : "Transfer to the intercepted destination; body, headers and query omitted."),
    };
    if (signal.aborted) return deny("Browser request cancelled.");
    // Bound a callback even if a reviewer or DNS dependency ignores cancellation.
    const decision = await boundedWork(this.options.policy(effect, signal), signal);
    const current = this.options.identity();
    return signal.aborted || current.sessionId !== effect.identity.sessionId || current.branchId !== effect.identity.branchId || current.generation !== effect.identity.generation ? deny("Browser request cancelled or task changed.") : decision;
  }
  private async event(event: CdpEvent): Promise<void> {
    const targetId = event.targetId;
    if (!targetId) return;
    const setup = this.setups.get(targetId);
    if (!setup || setup.target.sessionId !== event.sessionId) return;
    if (event.method === "Page.interstitialShown") this.interstitials.add(targetId);
    if (event.method === "Security.certificateError") this.warnings.add(targetId);
    if (event.method === "Page.interstitialHidden") this.interstitials.delete(targetId);
    if (event.method === "Security.visibleSecurityStateChanged") {
      const state = event.params.visibleSecurityState as { securityState?: string; certificateSecurityState?: { certificateNetworkError?: string }; safetyTipInfo?: { safetyTipStatus?: string }; securityStateIssueIds?: string[] } | undefined;
      // Chromium Security.enable emits the current visible state, including already-loaded
      // Safe Browsing findings (malicious-content) and certificate status. HTTP alone is not a warning.
      const currentUrl = this.transport?.managedTargets().find(item => item.targetId === targetId)?.url ?? "";
      if (hasNativeSecurityWarning(state, currentUrl, this.options.allowLocalhostTlsErrors === true)) this.warnings.add(targetId);
      else if (state) this.warnings.delete(targetId);
    }
    if (event.method !== "Fetch.requestPaused" || this.options.interceptRequests === false) return;
    const requestId = event.params.requestId;
    if (typeof requestId !== "string") throw new Error("Malformed intercepted browser request.");
    let allow = false, signal: AbortSignal | undefined, stage: BrowserRequestFailure["stage"] = "safety";
    try {
      this.assertSafe(targetId);
      signal = this.signal(targetId);
      stage = "identity";
      await this.transport!.revalidate(signal);
      const request = event.params.request as { url?: unknown; method?: unknown; hasPostData?: boolean; postData?: unknown } | undefined;
      if (typeof request?.url !== "string" || typeof request.method !== "string") throw new BrowserControlError("request_malformed", "Malformed intercepted browser request.");
      stage = "destination";
      const destination = parseBrowserDestination(request.url, this.options.cdpPort);
      // The first observed request consumes the pending dispatch, including a mismatch.
      // This is the already approved explicit navigation, not authority for later page traffic.
      const navigation = this.documentNavigations.get(targetId);
      this.documentNavigations.delete(targetId);
      const frameId = typeof event.params.frameId === "string" && event.params.frameId ? event.params.frameId : undefined;
      stage = "frame";
      const frame = frameId ? await this.transport!.frame(targetId, frameId, signal) : undefined;
      if (frameId && !frame) throw new BrowserControlError("frame_missing", "Intercepted request frame is unavailable.");
      if (destination.filePath !== undefined) {
        const lease = this.fileNavigations.get(targetId);
        this.fileNavigations.delete(targetId);
        if (!lease || !samePolicyIdentity(lease.identity, this.options.identity()) || lease.url !== destination.url || lease.nativePath !== destination.filePath || lease.signal.aborted || lease.frame.frameId !== frameId || event.params.resourceType !== "Document" || request.method !== "GET" || event.params.redirectedRequestId !== undefined || !frame) throw new BrowserControlError("file_lease_invalid", "No matching explicit file navigation lease.");
        await this.transport!.revalidateFrame(lease.frame, AbortSignal.any([signal, lease.signal]));
        this.assertSafe(targetId);
        allow = !signal.aborted && !lease.signal.aborted;
      } else {
      stage = "source";
      const sourceOrigin = frame ? (/^https?:/.test(frame.securityOrigin) ? frame.securityOrigin : frame.url) : setup.target.url;
      // Blank documents have an opaque origin, not their requested destination. T1 cannot represent
      // opaque origins; use the arriving document origin only for the initial Document request.
      const initialization = sourceOrigin === "about:blank" && event.params.resourceType === "Document";
      const origin = /^https?:/.test(sourceOrigin) ? parseBrowserDestination(sourceOrigin, this.options.cdpPort).origin : initialization ? destination.origin : undefined;
      if (!origin) throw new BrowserControlError("opaque_source", "Intercepted request has no supported source origin.");
      const facts: BrowserRequestFacts = { targetId, sessionId: setup.target.sessionId, ...(frameId ? { frameId } : {}), ...(frame ? { frameLoaderId: frame.loaderId, executionContextId: frame.executionContextId } : {}), sourceOrigin: origin, destination, method: request.method, resourceType: String(event.params.resourceType ?? "Other"), hasBody: request.hasPostData === true || request.postData !== undefined, hasQuery: new URL(destination.url).search.length > 0, redirected: typeof event.params.redirectedRequestId === "string", initialization, rawUrl: request.url, ...(typeof request.postData === "string" ? { postData: request.postData } : {}) };
      stage = "projection";
      const projection = this.project(facts);
      stage = "classification";
      await this.classify(destination, signal);
      stage = "policy";
      const approvedDispatch = navigation && !navigation.signal.aborted && samePolicyIdentity(navigation.identity, this.options.identity())
        && navigation.url === destination.url && navigation.visibility === destination.visibility && navigation.frame.frameId === frameId
        && facts.method === "GET" && facts.resourceType === "Document" && !facts.hasBody && !facts.redirected && frame
        && projection.kind === navigation.projection.kind && projection.taskScoped === navigation.projection.taskScoped
        && projection.targetVisibility === navigation.projection.targetVisibility && projection.destinationVisibility === navigation.projection.destinationVisibility
        && JSON.stringify(projection.payload) === JSON.stringify(navigation.projection.payload);
      if (approvedDispatch) {
        signal = AbortSignal.any([signal, navigation.signal]);
        await this.transport!.revalidateFrame(navigation.frame, signal);
      }
      const decision = approvedDispatch ? { outcome: "allow" as const, reason: "Dispatch of the same approved explicit navigation." } : await this.decide(facts, signal, projection);
      stage = "postcheck";
      this.assertSafe(targetId);
      if (frame) await this.transport!.revalidateFrame(frame, signal);
      else await this.transport!.revalidate(signal);
      allow = decision.outcome === "allow" && !signal.aborted && (!approvedDispatch || samePolicyIdentity(navigation.identity, this.options.identity()));
      if (!allow) this.reportFailure("intercepted", "policy", new BrowserControlError("policy_denied", "Request policy did not allow the transfer."), targetId, signal);
      }
    } catch (error) { allow = false; this.reportFailure("intercepted", stage, error, targetId, signal); }
    try {
      await setup.command(allow ? "Fetch.continueRequest" : "Fetch.failRequest", { requestId, ...(allow ? {} : { errorReason: "BlockedByClient" }) });
    } catch (error) { this.reportFailure("intercepted", "dispatch", error, targetId, signal); throw error; }
  }
  dispose(): void { this.lifetime.abort(); this.unsubscribe?.(); this.setups.clear(); this.warnings.clear(); this.interstitials.clear(); this.fileNavigations.clear(); this.documentNavigations.clear(); }
}
