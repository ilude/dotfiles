import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { BrowserControlError } from "./browser-control.js";
import type { BrowserCdpTransport, CdpEvent, ManagedTargetSetup, CdpFrame } from "./browser-cdp-transport.js";
import { samePolicyIdentity, type BrowserEffect, type BrowserPolicyDecision, type BrowserPolicyHandler, type PolicyIdentity } from "./browser-effect-contract.js";

export type BrowserDestination = { url: string; origin: string; resource: string; host: string; visibility: "public" | "private" | "local"; filePath?: string };
const deny = (reason: string): BrowserPolicyDecision => ({ outcome: "deny", reason });
async function boundedWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void work.catch(() => {}); throw new Error("Browser request cancelled."); }
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("Browser request cancelled."));
    signal.addEventListener("abort", abort, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function refused(reason: string): never { throw new BrowserControlError("destination_refused", reason); }

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
    setup.signal.addEventListener("abort", () => { this.setups.delete(setup.target.targetId); this.warnings.delete(setup.target.targetId); this.interstitials.delete(setup.target.targetId); }, { once: true });
    await setup.command("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    if (setup.target.type === "page" || setup.target.type === "iframe") await setup.command("Security.enable");
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
    this.fileNavigations.delete(targetId);
    this.assertSafe(targetId);
    const identity = { ...this.options.identity() };
    await this.transport!.revalidate(signal);
    const bounded = this.signal(targetId, signal);
    const destination = parseBrowserDestination(raw, this.options.cdpPort);
    if (destination.filePath !== undefined) {
      this.project({ targetId, sessionId: this.setups.get(targetId)!.target.sessionId, sourceOrigin: destination.origin, destination, method: "GET", resourceType: "Document", hasBody: false, hasQuery: new URL(destination.url).search.length > 0, redirected: false, rawUrl: raw });
      if (!this.options.localFile || (await boundedWork(this.options.localFile(destination.filePath, bounded), bounded)).outcome !== "allow") refused("This local file read requires filesystem-policy authorization.");
      const roots = (await this.transport!.frameList(targetId, bounded)).filter(frame => !frame.parentFrameId && frame.targetId === targetId);
      if (roots.length !== 1) refused("Local file navigation requires the exact main frame.");
      this.fileNavigations.set(targetId, { identity, url: destination.url, nativePath: destination.filePath, frame: roots[0]!, signal: bounded });
    } else {
      const facts: BrowserRequestFacts = { targetId, sessionId: this.setups.get(targetId)!.target.sessionId, sourceOrigin: destination.origin, destination, method: "GET", resourceType: "Document", hasBody: false, hasQuery: new URL(destination.url).search.length > 0, redirected: false, rawUrl: raw };
      const projection = this.project(facts);
      await this.classify(destination, bounded);
      const decision = await this.decide(facts, bounded, projection);
      if (decision.outcome !== "allow") refused(decision.reason);
    }
    this.assertSafe(targetId);
    await this.transport!.revalidate(bounded);
    if (!samePolicyIdentity(identity, this.options.identity()) || bounded.aborted) refused("Browser navigation cancelled or task changed.");
    return destination;
  }

  private signal(targetId: string, caller?: AbortSignal): AbortSignal {
    return AbortSignal.any([this.lifetime.signal, this.setups.get(targetId)!.signal, AbortSignal.timeout(this.options.timeoutMs ?? 10_000), ...(caller ? [caller] : [])]);
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
  private async decide(facts: BrowserRequestFacts, signal: AbortSignal, projection: BrowserRequestProjection): Promise<BrowserPolicyDecision> {
    const effect: BrowserEffect = {
      id: `browser-request-${++this.sequence}`, identity: { ...this.options.identity() },
      kind: projection.kind, payload: projection.payload, taskScoped: projection.taskScoped, action: `${facts.method} ${facts.resourceType}${facts.redirected ? " redirect" : ""}`,
      target: { origin: facts.sourceOrigin, visibility: projection.targetVisibility ?? hostVisibility(new URL(facts.sourceOrigin).hostname), targetId: facts.targetId, ...(facts.frameId ? { frameId: facts.frameId } : {}) },
      destination: { origin: facts.destination.origin, resource: facts.destination.resource, visibility: projection.destinationVisibility ?? facts.destination.visibility },
      expectedEffect: facts.initialization ? "Initial Document navigation from opaque blank; target is the arriving destination, not a source observation. Body, headers and query omitted." : "Transfer to the intercepted destination; body, headers and query omitted.",
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
      if (state?.securityState === "insecure-broken" || state?.certificateSecurityState?.certificateNetworkError || state?.securityStateIssueIds?.includes("malicious-content") || ["badReputation", "lookalike"].includes(state?.safetyTipInfo?.safetyTipStatus ?? "")) this.warnings.add(targetId);
      else if (state) this.warnings.delete(targetId);
    }
    if (event.method !== "Fetch.requestPaused") return;
    const requestId = event.params.requestId;
    if (typeof requestId !== "string") throw new Error("Malformed intercepted browser request.");
    let allow = false;
    try {
      this.assertSafe(targetId);
      const signal = this.signal(targetId);
      await this.transport!.revalidate(signal);
      const request = event.params.request as { url?: unknown; method?: unknown; hasPostData?: boolean; postData?: unknown } | undefined;
      if (typeof request?.url !== "string" || typeof request.method !== "string") throw new Error();
      const destination = parseBrowserDestination(request.url, this.options.cdpPort);
      const frameId = typeof event.params.frameId === "string" && event.params.frameId ? event.params.frameId : undefined;
      const frame = frameId ? await this.transport!.frame(targetId, frameId, signal) : undefined;
      if (frameId && !frame) throw new Error();
      if (destination.filePath !== undefined) {
        const lease = this.fileNavigations.get(targetId);
        this.fileNavigations.delete(targetId);
        if (!lease || !samePolicyIdentity(lease.identity, this.options.identity()) || lease.url !== destination.url || lease.nativePath !== destination.filePath || lease.signal.aborted || lease.frame.frameId !== frameId || event.params.resourceType !== "Document" || request.method !== "GET" || event.params.redirectedRequestId !== undefined || !frame) throw new Error();
        await this.transport!.revalidateFrame(lease.frame, AbortSignal.any([signal, lease.signal]));
        this.assertSafe(targetId);
        allow = !signal.aborted && !lease.signal.aborted;
      } else {
      const sourceOrigin = frame ? (/^https?:/.test(frame.securityOrigin) ? frame.securityOrigin : frame.url) : setup.target.url;
      // Blank documents have an opaque origin, not their requested destination. T1 cannot represent
      // opaque origins; use the arriving document origin only for the initial Document request.
      const initialization = sourceOrigin === "about:blank" && event.params.resourceType === "Document";
      const origin = /^https?:/.test(sourceOrigin) ? parseBrowserDestination(sourceOrigin, this.options.cdpPort).origin : initialization ? destination.origin : undefined;
      if (!origin) throw new Error();
      const facts: BrowserRequestFacts = { targetId, sessionId: setup.target.sessionId, ...(frameId ? { frameId } : {}), ...(frame ? { frameLoaderId: frame.loaderId, executionContextId: frame.executionContextId } : {}), sourceOrigin: origin, destination, method: request.method, resourceType: String(event.params.resourceType ?? "Other"), hasBody: request.hasPostData === true || request.postData !== undefined, hasQuery: new URL(destination.url).search.length > 0, redirected: typeof event.params.redirectedRequestId === "string", initialization, rawUrl: request.url, ...(typeof request.postData === "string" ? { postData: request.postData } : {}) };
      const projection = this.project(facts);
      await this.classify(destination, signal);
      const decision = await this.decide(facts, signal, projection);
      this.assertSafe(targetId);
      if (frame) await this.transport!.revalidateFrame(frame, signal);
      else await this.transport!.revalidate(signal);
      allow = decision.outcome === "allow" && !signal.aborted;
      }
    } catch { allow = false; }
    await setup.command(allow ? "Fetch.continueRequest" : "Fetch.failRequest", { requestId, ...(allow ? {} : { errorReason: "BlockedByClient" }) });
  }
  dispose(): void { this.lifetime.abort(); this.unsubscribe?.(); this.setups.clear(); this.warnings.clear(); this.interstitials.clear(); this.fileNavigations.clear(); }
}
