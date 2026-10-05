import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, updateJsonObjectAtomic, writeJsonObjectAtomic } from "./settings-file.js";
import { BrowserRuntime } from "./browser-runtime.js";
import type { BrowserCdpTransport, CdpFrame } from "./browser-cdp-transport.js";
import { BrowserRequestPolicy, hostVisibility, type BrowserRequestFacts, type BrowserRequestProjection } from "./browser-request-policy.js";
import { samePolicyIdentity, type BrowserEffect, type BrowserEffectKind, type BrowserPolicyHandler, type PolicyIdentity } from "./browser-effect-contract.js";
import type { CredentialTarget } from "./browser-credentials.js";
import { BROWSER_TEXT_EXPRESSION, projectBrowserText } from "./browser-observations.js";

export const MAX_OUTPUT = 50_000;
export const MAX_ITEMS = 100;
export const BROWSER_CONFIG_VERSION = 1;

export type ProfileMode = "isolated" | "real";
export type SessionMode = "owned" | "attached";
export type ExtensionMode = "enabled" | "disabled";
export type SessionAction = "discover" | "status" | "start" | "attach" | "restart" | "stop";
export type PageAction = "list" | "open" | "select" | "snapshot" | "screenshot" | "click" | "fill" | "close";

export interface BrowserProfileConfig {
	profileDirectory: string;
	userDataDir?: string;
	extensionsExpected?: boolean;
}

export interface BrowserProfilesConfig {
	version: 1;
	profiles: Record<string, BrowserProfileConfig>;
}

export interface DiscoveredProfile {
	userDataDir: string;
	profileDirectory: string;
	displayName: string;
}

export interface BrowserSessionState {
	version?: 1;
	sessionId: string;
	sessionMode?: SessionMode;
	launchMarker?: string;
	profileAlias?: string;
	profileMode: ProfileMode;
	cdpPort: number;
	pid: number;
	processStartTime: string | number;
	executablePath: string;
	userDataDir: string;
	profileDirectory: string;
	extensionMode: ExtensionMode;
	extensionsExpected?: boolean;
	targetId?: string;
	comparisonGeneration: number;
	comparisonInvalidatedReason?: string;
}

export interface BrowserTarget {
	id: string;
	url: string;
	title?: string;
	type?: string;
	webSocketDebuggerUrl?: string;
}

export interface BrowserCommandResult {
	code: number;
	stdout: string;
	stderr: string;
}

export class BrowserControlError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = "BrowserControlError";
		this.code = code;
	}
}



export function getBrowserConfigPath(): string {
	return path.join(getAgentDir(), "browser-profiles.json");
}

export function getBrowserStatePath(): string {
	return path.join(getAgentDir(), "browser", "session.json");
}

export function validateBrowserConfig(value: unknown): BrowserProfilesConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new BrowserControlError("invalid_config", "Browser profile configuration must be an object.");
	const input = value as Record<string, unknown>;
	if (input.version !== BROWSER_CONFIG_VERSION || !input.profiles || typeof input.profiles !== "object" || Array.isArray(input.profiles)) throw new BrowserControlError("invalid_config", "Browser profile configuration must have version 1 and profiles.");
	const profiles: Record<string, BrowserProfileConfig> = {};
	for (const [alias, raw] of Object.entries(input.profiles as Record<string, unknown>)) {
		if (!alias.trim() || /\s/.test(alias) || Object.keys(profiles).some((existing) => existing.toLowerCase() === alias.toLowerCase())) throw new BrowserControlError("invalid_config", "Invalid, duplicate, or case-colliding profile alias.");
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BrowserControlError("invalid_config", `Profile alias ${alias} is invalid.`);
		const entry = raw as Record<string, unknown>;
		if (typeof entry.profileDirectory !== "string" || !entry.profileDirectory.trim()) throw new BrowserControlError("invalid_config", `Profile alias ${alias} requires profileDirectory.`);
		if (entry.userDataDir !== undefined && (typeof entry.userDataDir !== "string" || !entry.userDataDir.trim())) throw new BrowserControlError("invalid_config", `Profile alias ${alias} has invalid userDataDir.`);
		if (entry.extensionsExpected !== undefined && typeof entry.extensionsExpected !== "boolean") throw new BrowserControlError("invalid_config", `Profile alias ${alias} has invalid extensionsExpected.`);
		if (Object.keys(entry).some((key) => !["profileDirectory", "userDataDir", "extensionsExpected"].includes(key))) throw new BrowserControlError("invalid_config", `Profile alias ${alias} has unsupported fields.`);
		profiles[alias] = {
			profileDirectory: entry.profileDirectory,
			...(entry.userDataDir === undefined ? {} : { userDataDir: entry.userDataDir as string }),
			...(entry.extensionsExpected === undefined ? {} : { extensionsExpected: entry.extensionsExpected as boolean }),
		};
	}
	return { version: 1, profiles };
}

export function readBrowserConfig(filePath = getBrowserConfigPath()): BrowserProfilesConfig {
	if (!fs.existsSync(filePath)) return { version: 1, profiles: {} };
	try {
		return validateBrowserConfig(JSON.parse(fs.readFileSync(filePath, "utf8")));
	} catch (error) {
		if (error instanceof BrowserControlError) throw error;
		throw new BrowserControlError("invalid_config", "Browser profile configuration is unreadable.");
	}
}

export async function writeBrowserConfig(update: Record<string, BrowserProfileConfig>, filePath = getBrowserConfigPath()): Promise<void> {
	const current = readBrowserConfig(filePath);
	const next = validateBrowserConfig({ version: 1, profiles: { ...current.profiles, ...update } });
	if (fs.existsSync(filePath)) await updateJsonObjectAtomic(filePath, () => next as unknown as Record<string, unknown>);
	else await writeJsonObjectAtomic(filePath, next as unknown as Record<string, unknown>);
	if (process.platform !== "win32") await fs.promises.chmod(filePath, 0o600);
}

export async function migrateBrowserConfig(sourcePath: string, destinationPath = getBrowserConfigPath()): Promise<void> {
	if (fs.existsSync(destinationPath)) throw new BrowserControlError("migration_destination_exists", "Default browser profile configuration already exists; refusing to overwrite it.");
	let source: unknown;
	try { source = JSON.parse(await fs.promises.readFile(sourcePath, "utf8")); }
	catch { throw new BrowserControlError("migration_source_invalid", "Legacy browser profile configuration is missing or unreadable."); }
	const validated = validateBrowserConfig(source);
	await writeJsonObjectAtomic(destinationPath, validated as unknown as Record<string, unknown>);
	if (process.platform !== "win32") await fs.promises.chmod(destinationPath, 0o600);
}

function homeDirectory(env: NodeJS.ProcessEnv): string {
	return env.HOME ?? env.USERPROFILE ?? os.homedir();
}

function expandHome(value: string, env: NodeJS.ProcessEnv): string {
	if (value === "~") return homeDirectory(env);
	if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) return path.join(homeDirectory(env), value.slice(2));
	return value;
}

export function braveUserDataRoots(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string[] {
	const roots: string[] = [];
	if (env.BRAVE_USER_DATA_DIR) roots.push(expandHome(env.BRAVE_USER_DATA_DIR, env));
	if (platform === "win32" && env.LOCALAPPDATA) roots.push(path.join(env.LOCALAPPDATA, "BraveSoftware", "Brave-Browser", "User Data"));
	else if (platform === "darwin") roots.push(path.join(homeDirectory(env), "Library", "Application Support", "BraveSoftware", "Brave-Browser"));
	else roots.push(path.join(homeDirectory(env), ".config", "BraveSoftware", "Brave-Browser"), path.join(homeDirectory(env), ".config", "brave-browser"));
	return [...new Set(roots.map((root) => path.resolve(root)))];
}

export function discoverBraveProfiles(roots = braveUserDataRoots()): DiscoveredProfile[] {
	const found: DiscoveredProfile[] = [];
	for (const root of roots) {
		const localState = path.join(root, "Local State");
		if (!fs.existsSync(localState)) continue;
		let cache: unknown;
		try {
			cache = (JSON.parse(fs.readFileSync(localState, "utf8")) as { profile?: { info_cache?: unknown } }).profile?.info_cache;
		} catch {
			throw new BrowserControlError("profile_metadata_invalid", `Brave profile metadata is unreadable at ${redactOutput(localState)}.`);
		}
		if (!cache || typeof cache !== "object" || Array.isArray(cache)) throw new BrowserControlError("profile_metadata_invalid", "Brave profile metadata does not contain profile.info_cache.");
		for (const [profileDirectory, value] of Object.entries(cache as Record<string, unknown>)) {
			if (!value || typeof value !== "object" || typeof (value as { name?: unknown }).name !== "string") throw new BrowserControlError("profile_metadata_invalid", "Brave profile metadata contains an invalid profile entry.");
			if (!fs.existsSync(path.join(root, profileDirectory))) throw new BrowserControlError("profile_metadata_stale", `Brave profile metadata references missing directory ${profileDirectory}.`);
			found.push({ userDataDir: path.resolve(root), profileDirectory, displayName: (value as { name: string }).name });
		}
	}
	const displayKeys = found.map((entry) => `${entry.userDataDir.toLowerCase()}\0${entry.displayName.toLowerCase()}`);
	if (new Set(displayKeys).size !== displayKeys.length) throw new BrowserControlError("profile_metadata_ambiguous", "Brave profile display names are ambiguous within one user-data root.");
	return found;
}

export function resolveConfiguredProfile(alias: string, config = readBrowserConfig(), discovered = discoverBraveProfiles()): DiscoveredProfile {
	const configured = config.profiles[alias];
	if (!configured) throw new BrowserControlError("profile_unknown", `Unknown profile alias ${alias}. Run browser_session discover and /browser-setup.`);
	const matches = discovered.filter((entry) => entry.profileDirectory === configured.profileDirectory && (!configured.userDataDir || path.resolve(configured.userDataDir) === entry.userDataDir));
	if (matches.length !== 1) throw new BrowserControlError("profile_unresolved", `Profile alias ${alias} does not resolve to one live Brave profile.`);
	return matches[0]!;
}

export function loadBrowserState(filePath = getBrowserStatePath()): BrowserSessionState | undefined {
	if (!fs.existsSync(filePath)) return undefined;
	try {
		const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<BrowserSessionState>;
		if (typeof raw.sessionId !== "string" || typeof raw.cdpPort !== "number" || typeof raw.pid !== "number" || raw.processStartTime === undefined || typeof raw.executablePath !== "string" || typeof raw.userDataDir !== "string" || typeof raw.profileDirectory !== "string") throw new Error("missing identity tuple");
		return {
			...raw,
			sessionMode: raw.sessionMode === "attached" ? "attached" : "owned",
			profileMode: raw.profileMode === "real" ? "real" : "isolated",
			extensionMode: raw.extensionMode === "disabled" ? "disabled" : "enabled",
			comparisonGeneration: typeof raw.comparisonGeneration === "number" ? raw.comparisonGeneration : 0,
		} as BrowserSessionState;
	} catch {
		throw new BrowserControlError("state_invalid", "Browser session state is corrupt or missing its ownership tuple.");
	}
}

export async function saveBrowserState(state: BrowserSessionState, filePath = getBrowserStatePath()): Promise<void> {
	await writeJsonObjectAtomic(filePath, state as unknown as Record<string, unknown>);
	if (process.platform !== "win32") await fs.promises.chmod(filePath, 0o600);
}

export function parseSessionStatus(output: string): { online?: boolean; ownershipVerified?: boolean; outcome?: string } {
	const values = new Map<string, string>();
	for (const line of output.split(/\r?\n/)) {
		const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line.trim());
		if (match) values.set(match[1]!, match[2]!);
	}
	return {
		online: values.get("cdpOnline") === "true",
		ownershipVerified: values.get("processTupleVerified") === "true",
		outcome: output.match(/close-(?:owned|attached):\s*([a-z_]+)/)?.[1],
	};
}

export function redactOutput(value: string, max = MAX_OUTPUT): string {
	const home = path.dirname(getAgentDir());
	// Preserve CSS escapes and page text; normalize only the specific local path.
	const normalized = value.replaceAll(home, "<HOME>").replaceAll(home.replaceAll("\\", "/"), "<HOME>");
	const redacted = normalized;
	return redacted.length <= max ? redacted : `${redacted.slice(0, max)}\n[output truncated]`;
}

export function isSensitiveSurface(value: string): boolean {
	return /<iframe[^>]+(?:recaptcha|hcaptcha)[^>]*>/i.test(value);
}

export function isPasswordField(value: string): boolean {
	return /\btype\s*=\s*["']?password\b/i.test(value);
}

export function invalidateComparison(state: BrowserSessionState, reason: string): BrowserSessionState {
	return { ...state, targetId: undefined, comparisonGeneration: state.comparisonGeneration + 1, comparisonInvalidatedReason: reason };
}

export function restartAuthorization(state: BrowserSessionState): string {
	return [state.profileAlias ?? "isolated", state.sessionId, state.pid, state.processStartTime, state.executablePath, state.userDataDir, state.profileDirectory, state.cdpPort].join(":");
}

export class BrowserSessionProtocol extends BrowserRuntime {}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) throw new BrowserControlError("cdp_failed", `CDP returned HTTP ${response.status}.`);
	return await response.json() as T;
}

export async function listAllTargets(port: number): Promise<BrowserTarget[]> {
	return await fetchJson<BrowserTarget[]>(`http://127.0.0.1:${port}/json/list`);
}

export async function listTargets(port: number): Promise<BrowserTarget[]> {
	return (await listAllTargets(port)).filter((target) => target.type === "page").slice(0, MAX_ITEMS);
}

export async function getTarget(port: number, targetId: string): Promise<BrowserTarget> {
	const target = (await listTargets(port)).find((candidate) => candidate.id === targetId);
	if (!target) throw new BrowserControlError("target_mismatch", "CDP target is closed, replaced, or outside the current browser session.");
	return target;
}

export interface BrowserObservationHooks {
	/** Local-only values. Never publish these arguments on an event bus or transcript. */
	protect?(value: string, targetId: string, frameId: string, selector: string): void;
	text?(text: string, source: { targetId: string; frameId: string; origin: string }, protectedValues: readonly string[], signal?: AbortSignal): Promise<string>;
	beforeScreenshot?(transport: BrowserCdpTransport, targetId: string, protectedValues: readonly string[], signal?: AbortSignal): Promise<() => Promise<void>>;
	payload?(value: string): { sourceObservationIds: string[]; containsProtectedData: boolean };
	clear?(): void;
}
export interface BrowserPageOptions {
	runtime: BrowserRuntime;
	identity: () => PolicyIdentity;
	lease?: () => { identity: PolicyIdentity; signal: AbortSignal };
	policy: BrowserPolicyHandler;
	localFile?: (path: string, signal: AbortSignal) => Promise<import("./browser-effect-contract.js").BrowserPolicyDecision>;
	resolveCredential?: (reference: string, target: CredentialTarget, signal: AbortSignal) => Promise<string>;
	/** Operator-configured form origin snapshot paired with the local resolver, never tool arguments. */
	credentialOrigins?: (reference: string) => readonly string[];
	observations?: BrowserObservationHooks;
	resolveHost?: (host: string) => Promise<readonly string[]>;
}
export type BrowserFill = { value?: string; secret_ref?: string; frame_id?: string };
type ControlFacts = { tag: string; type: string; name: string; autocomplete: string; label: string; form: string; href: string; captcha: boolean; password: boolean; loginForm: boolean };

/** Fixed native setter remains independent of framework instance value trackers. */
export function browserFillExpression(selector: string, value: string, facts?: ControlFacts): string {
	return `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return { ok: false }; ${facts ? `if (element.tagName.toLowerCase() !== ${JSON.stringify(facts.tag)} || (element.getAttribute('type') || '').toLowerCase() !== ${JSON.stringify(facts.type)} || (element.getAttribute('name') || '') !== ${JSON.stringify(facts.name)} || (element.getAttribute('autocomplete') || '') !== ${JSON.stringify(facts.autocomplete)} || element.disabled || element.readOnly || (element.form ? element.form.action : '') !== ${JSON.stringify(facts.form)}) return { ok: false };` : ""} element.focus(); const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : undefined; const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set; if (!setter) return { ok: false }; setter.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true }; })()`;
}

/** Bounded executor URL-route evidence, not a claim to identify every private account UI. */
function requestResourceEffect(resource: string): BrowserEffectKind | undefined {
	let route = resource.toLowerCase(); try { route = decodeURIComponent(route); } catch { /* retain raw parser path */ }
	if (/(?:^|\/)(?:delete|destroy|erase|remove-account)(?:[\/_-]|$)/.test(route)) return "delete";
	if (/(?:^|\/)(?:admin)(?:[\/_-]|$)/.test(route)) return "admin";
	if (/(?:^|\/)(?:security|settings|password|permissions|two-factor|2fa)(?:[\/_-]|$)/.test(route)) return "security";
	if (/(?:^|\/)(?:purchase|checkout|payment|buy)(?:[\/_-]|$)/.test(route)) return "purchase";
	if (/(?:^|\/)(?:messages?|direct|dm)(?:[\/_-]|$)/.test(route)) return "message";
	if (/(?:^|\/)(?:comments?|reply|posts?|publish|tweet)(?:[\/_-]|$)/.test(route)) return "post";
	return undefined;
}
function canonicalPageOrigin(origin: string): string { if (origin === "null" || origin === "file://") return origin; const url = new URL(origin); url.hostname = url.hostname.replace(/\.+$/, ""); return url.origin; }
function frameOrigin(frame: Readonly<CdpFrame>): string { return frame.url.startsWith("file:") ? "file://" : canonicalPageOrigin(frame.securityOrigin); }
function originVisibility(origin: string): "public" | "private" | "local" { return origin === "null" || origin === "file://" ? "private" : hostVisibility(new URL(origin).hostname); }
function actualCaptchaFrame(raw: string): boolean {
	try { const url = new URL(raw); return ((url.hostname === "www.google.com" || url.hostname === "www.recaptcha.net") && url.pathname.startsWith("/recaptcha/")) || (url.hostname === "hcaptcha.com" || url.hostname.endsWith(".hcaptcha.com")); } catch { return false; }
}
export function browserAccountRoute(raw: string): boolean {
	try { const url = new URL(raw); const route = decodeURIComponent(url.pathname).toLowerCase(); return /^\/(?:inbox|messages?|direct|account|accounts|settings|security|admin|billing|wallet|mail)(?:\/|$)/.test(route) || /^\/message\/inbox(?:\/|$)/.test(route); }
	catch { return false; }
}

export class BrowserPageProtocol {
	private transport?: BrowserCdpTransport;
	private guard?: BrowserRequestPolicy;
	private sessionId?: string;
	private identity?: PolicyIdentity;
	private connecting?: Promise<BrowserCdpTransport>;
	private sequence = 0;
	private protectedValues = new Set<string>();
	private protectedControls = new Map<string, Set<string>>();
	private transfers: Array<{ targetId: string; frameId: string; origins: readonly string[]; sourceOrigin: string; selector: string; loaderId?: string; executionContextId?: number; value: string; kind: BrowserEffectKind; protected: boolean; sourceObservationIds: string[]; containsProtectedData: boolean; reference?: string }> = [];
	private lifetime = new AbortController();
	private privateFrames = new Set<string>();
	private ownerAbort?: { signal: AbortSignal; handler: () => void };
	private readonly options?: BrowserPageOptions;
	constructor(options?: BrowserPageOptions) { this.options = options; }
	setObservationHooks(hooks: BrowserObservationHooks): void { if (this.options) this.options.observations = hooks; }
	private settings(): BrowserPageOptions { if (!this.options) throw new BrowserControlError("policy_unavailable", "Browser policy is unavailable."); return this.options; }
	private async connection(state: BrowserSessionState, signal?: AbortSignal): Promise<BrowserCdpTransport> {
		const options = this.settings(), identity = options.identity();
		if (this.sessionId !== state.sessionId || (this.identity && !samePolicyIdentity(this.identity, identity))) this.dispose();
		this.sessionId = state.sessionId; this.identity = { ...identity };
		if (!this.transport) {
			if (!this.connecting) this.connecting = (async () => {
				const lease = options.lease?.();
				if (lease && (lease.signal.aborted || !samePolicyIdentity(identity, lease.identity))) throw new BrowserControlError("cancelled", "Browser policy lease expired.");
				const captured = this.lifetime;
				if (lease) {
					const handler = () => { if (this.lifetime === captured) this.dispose(); };
					this.ownerAbort = { signal: lease.signal, handler }; lease.signal.addEventListener("abort", handler, { once: true });
				}
				const guard = new BrowserRequestPolicy({ cdpPort: state.cdpPort, identity: options.identity, policy: options.policy, localFile: options.localFile, resolveHost: options.resolveHost, effect: facts => this.requestEffect(facts) });
				this.guard = guard;
				const lifetime = this.lifetime;
				const transport = await options.runtime.connectTransport(state, { register: guard.register, signal: lifetime.signal });
				if (lifetime.signal.aborted || !samePolicyIdentity(identity, options.identity())) { transport.dispose(); throw new BrowserControlError("cancelled", "Browser task changed during connection."); }
				guard.bind(transport); this.transport = transport; return transport;
			})();
			try { await this.connecting; } catch (error) { this.dispose(); throw error; } finally { this.connecting = undefined; }
		}
		await this.transport!.revalidate(signal);
		return this.transport!;
	}
	private requestEffect(facts: BrowserRequestFacts): BrowserRequestProjection {
		// No active login flag: every request uses its actual destination and local payload facts.
		const raw = facts.rawUrl;
		const decode = (value: string) => { try { return decodeURIComponent(value.replaceAll('+', ' ')); } catch { return value; } };
		const urlSecret = [...this.protectedValues].some(value => raw.includes(value) || decode(raw).includes(value));
		if (urlSecret) throw new BrowserControlError("credential_export", "Protected control values cannot be sent in browser URLs.");
		const body = facts.postData;
		const matching = body === undefined ? [] : this.transfers.filter(item => item.value && (body.includes(item.value) || decode(body).includes(item.value)));
		if (matching.length) {
			const consequential = facts.method === "GET" || facts.method === "HEAD" ? undefined : requestResourceEffect(facts.destination.resource);
			const exact = (item: typeof matching[number]) => item.targetId === facts.targetId && item.frameId === facts.frameId && item.origins.includes(facts.destination.origin) && facts.sourceOrigin === item.sourceOrigin && item.loaderId === facts.frameLoaderId && item.executionContextId === facts.executionContextId && !consequential;
			if (matching.some(item => item.protected && !exact(item))) throw new BrowserControlError("credential_export", "Protected values cannot be sent outside their bound field/frame operation or to a consequential endpoint.");
			const item = matching.find(item => item.reference && exact(item)) ?? matching.find(exact);
			if (item) {
				let remainder = body!;
				for (const represented of matching.filter(exact)) remainder = remainder.split(represented.value).join('[represented control value]').split(encodeURIComponent(represented.value)).join('[represented control value]');
				const observed = this.options?.observations?.payload?.(remainder) ?? { sourceObservationIds: [], containsProtectedData: false };
				const source = { sourceObservationIds: [...new Set([...item.sourceObservationIds, ...observed.sourceObservationIds])], containsProtectedData: item.containsProtectedData || observed.containsProtectedData };
				if (item.reference && source.sourceObservationIds.length) throw new BrowserControlError("credential_export", "A bound credential submission cannot carry unrelated private observations.");
				return { kind: item.kind, payload: item.reference ? { kind: "secret-ref", reference: item.reference, purpose: "login" } : { kind: "redacted", sourceObservationIds: source.sourceObservationIds, containsProtectedData: source.sourceObservationIds.length > 0 || (source.containsProtectedData && !item.protected) }, taskScoped: false };
			}
		}
		const consequential = facts.method === "GET" || facts.method === "HEAD" ? undefined : requestResourceEffect(facts.destination.resource);
		const protectedData = body !== undefined && [...this.protectedValues].some(value => body.includes(value) || decode(body).includes(value));
		if (protectedData) throw new BrowserControlError("credential_export", "Protected control values cannot be exported by an unrelated request.");
		const unknown = facts.hasBody && body === undefined;
		const sources = this.options?.observations?.payload?.(`${raw}\n${body ?? ''}`) ?? { sourceObservationIds: [], containsProtectedData: false };
		return { kind: consequential ?? (sources.containsProtectedData || sources.sourceObservationIds.length ? "export" : facts.method === "GET" || facts.method === "HEAD" ? "read" : "export"), payload: unknown || facts.hasBody || sources.containsProtectedData || sources.sourceObservationIds.length ? { kind: "redacted", sourceObservationIds: sources.sourceObservationIds, containsProtectedData: unknown || sources.containsProtectedData } : { kind: "none" }, taskScoped: false, ...(browserAccountRoute(facts.rawUrl) ? { targetVisibility: "private" as const, destinationVisibility: "private" as const } : {}) };
	}
	async list(state: BrowserSessionState, signal?: AbortSignal): Promise<BrowserTarget[]> {
		const transport = await this.connection(state, signal);
		const bounded = AbortSignal.any([transport.signal, AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]);
		const targets = (await fetchJson<BrowserTarget[]>(`http://127.0.0.1:${state.cdpPort}/json/list`, { signal: bounded })).filter(target => target.type === "page").slice(0, MAX_ITEMS);
		await transport.revalidate(bounded);
		return targets.map(target => ({ ...target, url: this.filter(target.url) }));
	}
	private async target(state: BrowserSessionState, targetId: string, signal?: AbortSignal): Promise<BrowserCdpTransport> {
		const transport = await this.connection(state, signal);
		await transport.manage(targetId, signal); this.guard!.assertSafe(targetId);
		return transport;
	}
	async open(state: BrowserSessionState, url: string, signal?: AbortSignal): Promise<BrowserTarget> {
		const transport = await this.connection(state, signal);
		const target = await transport.create(signal);
		const destination = await this.guard!.authorizeNavigation(target.targetId, url, signal);
		await transport.command(target.targetId, "Page.navigate", { url: destination.url }, { signal });
		return { id: target.targetId, url: destination.url, type: "page" };
	}
	async select(state: BrowserSessionState, targetId: string, signal?: AbortSignal): Promise<void> {
		const transport = await this.target(state, targetId, signal);
		const frame = await this.frame(transport, targetId, undefined, signal);
		if (/^https?:/.test(frame.securityOrigin)) await this.observePrivacy(transport, frame, signal);
		if (/^https?:/.test(frame.securityOrigin)) await this.authorize(targetId, frame, "read", { kind: "none" }, "Select exact page account/read context", undefined, signal);
		await transport.command(targetId, "Page.bringToFront", {}, { signal });
	}
	private async frame(transport: BrowserCdpTransport, targetId: string, frameId?: string, signal?: AbortSignal): Promise<Readonly<CdpFrame>> {
		if (frameId) return await transport.frame(targetId, frameId, signal);
		const frames = (await transport.frameList(targetId, signal)).filter(frame => frame.targetId === targetId && !frame.parentFrameId);
		if (frames.length !== 1) throw new BrowserControlError("frame_required", "Specify the exact frame_id for this control.");
		return frames[0]!;
	}
	private async evaluate<T>(transport: BrowserCdpTransport, frame: Readonly<CdpFrame>, expression: string, signal?: AbortSignal): Promise<T> {
		await transport.revalidateFrame(frame, signal); this.guard!.assertSafe(frame.targetId);
		if (frame.executionContextId === undefined) throw new BrowserControlError("frame_unavailable", "The exact frame has no current execution context.");
		const response = await transport.command<{ result?: { value?: T }; exceptionDetails?: unknown }>(frame.targetId, "Runtime.evaluate", { expression, contextId: frame.executionContextId, returnByValue: true }, { signal });
		if (response.exceptionDetails || response.result?.value === undefined) throw new BrowserControlError("control_failed", "Browser control inspection or execution failed.");
		return response.result.value;
	}
	private filter(text: string): string { return projectBrowserText(text, [...this.protectedValues]); }
	async frames(state: BrowserSessionState, targetId: string, signal?: AbortSignal): Promise<Array<{ id: string; targetId: string; origin: string }>> {
		const transport = await this.target(state, targetId, signal);
		const ids = [...new Set((await transport.frameList(targetId, signal)).map(frame => frame.frameId))].slice(0, MAX_ITEMS);
		const frames = await Promise.all(ids.map(id => transport.frame(targetId, id, signal)));
		return frames.map(frame => ({ id: frame.frameId, targetId: frame.targetId, origin: this.filter(frameOrigin(frame)) }));
	}
	async snapshot(state: BrowserSessionState, targetId: string, signal?: AbortSignal, frameId?: string): Promise<string> {
		const transport = await this.target(state, targetId, signal), frame = await this.frame(transport, targetId, frameId, signal);
		await this.observePrivacy(transport, frame, signal);
		await this.authorize(targetId, frame, "read", { kind: "none" }, "Observe rendered page labels without control values", undefined, signal);
		const text = await this.evaluate<string>(transport, frame, BROWSER_TEXT_EXPRESSION, signal);
		const filtered = this.filter(text);
		return this.settings().observations?.text ? await this.settings().observations!.text!(filtered, { targetId, frameId: frame.frameId, origin: frameOrigin(frame) }, [...this.protectedValues], signal) : filtered;
	}
	async screenshot(state: BrowserSessionState, targetId: string, outputPath: string, signal?: AbortSignal): Promise<{ origin: string; classification: "public" | "private" }> {
		const transport = await this.target(state, targetId, signal);
		const root = await this.frame(transport, targetId, undefined, signal);
		await this.observePrivacy(transport, root, signal);
		await this.authorize(targetId, root, "read", { kind: "none" }, "Capture actual page observation with sensitive controls masked", undefined, signal);
		const frameIds = [...new Set((await transport.frameList(targetId, signal)).map(frame => frame.frameId))];
		const frames = await Promise.all(frameIds.map(frameId => transport.frame(targetId, frameId, signal)));
		for (const frame of frames) {
			if (frame.frameId === root.frameId) continue;
			await this.observePrivacy(transport, frame, signal);
			await this.authorize(targetId, frame, "read", { kind: "none" }, "Capture exact embedded frame observation", undefined, signal);
		}
		const restore: Array<() => Promise<void>> = [];
		try {
			const hook = this.settings().observations?.beforeScreenshot;
			if (hook) restore.push(await hook(transport, targetId, [...this.protectedValues], signal));
			else for (const frame of frames) {
				const selectors = [...(this.protectedControls.get(frame.frameId) ?? [])];
				await this.evaluate(transport, frame, `(() => { const controls = new Set([...document.querySelectorAll('input,textarea,select')]); for (const selector of ${JSON.stringify(selectors)}) { const element = document.querySelector(selector); if (element) controls.add(element); } for (const element of controls) { if (element.hasAttribute('data-pi-browser-mask')) continue; element.setAttribute('data-pi-browser-mask', element.style.getPropertyValue('visibility')); element.style.setProperty('visibility', 'hidden', 'important'); } return true; })()`, signal);
				restore.push(async () => { await this.evaluate(transport, frame, `(() => { for (const element of document.querySelectorAll('[data-pi-browser-mask]')) { const value = element.getAttribute('data-pi-browser-mask'); if (value) element.style.setProperty('visibility', value); else element.style.removeProperty('visibility'); element.removeAttribute('data-pi-browser-mask'); } return true; })()`); });
			}
			this.guard!.assertSafe(targetId); await transport.revalidate(signal);
			const response = await transport.command<{ data?: string }>(targetId, "Page.captureScreenshot", { format: "png" }, { signal });
			if (!response.data) throw new BrowserControlError("screenshot_failed", "CDP returned no screenshot data.");
			await fs.promises.mkdir(path.dirname(outputPath), { recursive: true }); await fs.promises.writeFile(outputPath, Buffer.from(response.data, "base64"));
			return { origin: frameOrigin(root), classification: this.observationClass({ targetId: root.targetId, frameId: root.frameId, origin: frameOrigin(root) }) };
		} finally { let failed = false; for (const cleanup of restore.reverse()) { try { await cleanup(); } catch { failed = true; } } if (failed) throw new BrowserControlError("screenshot_restore_failed", "Sensitive-control masking could not be restored; inspect the page manually."); }
	}
	observationClass(source: { targetId: string; frameId: string; origin: string }): "public" | "private" { return this.privateFrames.has(JSON.stringify([source.targetId, source.frameId])) || originVisibility(source.origin) !== "public" ? "private" : "public"; }
	private async observePrivacy(transport: BrowserCdpTransport, frame: Readonly<CdpFrame>, signal?: AbortSignal): Promise<void> {
		const privateControl = await this.evaluate<boolean>(transport, frame, `(() => !!document.querySelector('input[autocomplete="one-time-code"]'))()`, signal);
		const key = JSON.stringify([frame.targetId, frame.frameId]);
		if (browserAccountRoute(frame.url) || privateControl === true) this.privateFrames.add(key); else this.privateFrames.delete(key);
	}
	private async inspect(transport: BrowserCdpTransport, frame: Readonly<CdpFrame>, selector: string, signal?: AbortSignal): Promise<ControlFacts> {
		const facts = await this.evaluate<ControlFacts | null>(transport, frame, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null; const captcha = !!element.closest('.g-recaptcha,.h-captcha') || (element.tagName === 'IFRAME' && (() => { try { const url = new URL(element.src); return ((url.hostname === 'www.google.com' || url.hostname === 'www.recaptcha.net') && url.pathname.startsWith('/recaptcha/')) || url.hostname === 'hcaptcha.com' || url.hostname.endsWith('.hcaptcha.com'); } catch { return false; } })()); return { tag: element.tagName.toLowerCase(), type: (element.getAttribute('type') || '').toLowerCase(), name: (element.getAttribute('name') || '').slice(0, 100), autocomplete: (element.getAttribute('autocomplete') || '').slice(0,100), label: (element.getAttribute('aria-label') || element.textContent || '').slice(0,200), form: element.form ? element.form.action : '', href: element.href || '', captcha, loginForm: !!element.form?.querySelector('input[type="password"],input[autocomplete="current-password"]'), password: element.getAttribute('type') === 'password' || element.getAttribute('autocomplete') === 'current-password' || element.getAttribute('autocomplete') === 'new-password' }; })()`, signal);
		if (!facts) throw new BrowserControlError("selector_missing", "Selector did not match an element.");
		if (facts.captcha || actualCaptchaFrame(frame.url)) throw new BrowserControlError("manual_captcha", "Complete the actual CAPTCHA manually; other page controls remain available.");
		return facts;
	}
	private classify(facts: ControlFacts, frame: Readonly<CdpFrame>, fill: boolean): BrowserEffectKind {
		const context = `${facts.label} ${facts.name} ${facts.form ? new URL(facts.form).pathname : ''} ${facts.href ? new URL(facts.href).pathname : ''}`;
		if (/delete|remove account|erase|destroy/i.test(context)) return "delete";
		if (/security|two.factor|2fa|change.password|reset.password|new-password|permissions/i.test(context + facts.autocomplete)) return "security";
		if (/purchase|checkout|buy|pay now/i.test(context)) return "purchase";
		if (/message|send.dm/i.test(context)) return "message";
		if (/post|publish|comment|reply|submit.article/i.test(context)) return "post";
		if (fill && originVisibility(frameOrigin(frame)) === "local") return "dev-form";
		if (facts.password || facts.loginForm || /^(username|current-password|one-time-code)$/.test(facts.autocomplete) || /log.?in|sign.?in/i.test(context)) return "login";
		if (!fill && !facts.form && /^(accept(?: all)?|allow(?: all)?|agree|continue|reject(?: all)?|close|dismiss)(?: cookies)?$/i.test(facts.label.trim())) return "read";
		if (originVisibility(frameOrigin(frame)) === "local") return "dev-form";
		return fill ? "export" : facts.href ? "navigate" : "export";
	}
	private async authorize(targetId: string, frame: Readonly<CdpFrame>, kind: BrowserEffectKind, payload: BrowserEffect["payload"], expectedEffect: string, facts?: ControlFacts, signal?: AbortSignal): Promise<void> {
		const options = this.settings(), identity = { ...options.identity() };
		if (kind === "read" && frame.url.startsWith("file:")) {
			const bounded = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]);
			if (!options.localFile || (await options.localFile(fileURLToPath(new URL(frame.url)), bounded)).outcome !== "allow" || bounded.aborted || !samePolicyIdentity(identity, options.identity())) throw new BrowserControlError("action_refused", "Local file observation requires current filesystem-policy authorization.");
			await this.transport!.revalidateFrame(frame, bounded); this.guard!.assertSafe(targetId); return;
		}
		const destination = new URL(facts?.form || facts?.href || frame.url);
		if (destination.username || destination.password || !["http:", "https:", "file:"].includes(destination.protocol)) throw new BrowserControlError("destination_refused", "Control destinations require HTTP/HTTPS or an explicitly authorized local file, without embedded credentials.");
		destination.hostname = destination.hostname.replace(/\.+$/, "");
		if ([frameOrigin(frame), destination.origin, targetId, frame.frameId].some(value => this.filter(value) !== value)) throw new BrowserControlError("protected_metadata", "Protected data cannot enter browser policy metadata.");
		const effect: BrowserEffect = { id: `browser-control-${++this.sequence}`, identity, kind, action: facts ? "control" : "observe", target: { targetId, frameId: frame.frameId, origin: frameOrigin(frame), visibility: this.privateFrames.has(JSON.stringify([frame.targetId, frame.frameId])) ? "private" : originVisibility(frameOrigin(frame)), ...(facts ? { control: this.filter(`${facts.tag} ${facts.type} ${facts.name} ${facts.label}`).slice(0, 300) } : {}) }, destination: { origin: destination.origin, resource: this.filter(destination.pathname), visibility: hostVisibility(destination.hostname) }, payload, expectedEffect, taskScoped: false };
		const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
		const decision = await options.policy(effect, bounded);
		if (decision.outcome !== "allow") throw new BrowserControlError("action_refused", decision.reason);
		if (bounded.aborted || !samePolicyIdentity(identity, options.identity())) throw new BrowserControlError("cancelled", "Browser task changed.");
		await this.transport!.revalidateFrame(frame, bounded); this.guard!.assertSafe(targetId);
	}
	async click(state: BrowserSessionState, targetId: string, selector: string, signal?: AbortSignal, frameId?: string): Promise<void> {
		const transport = await this.target(state, targetId, signal), frame = await this.frame(transport, targetId, frameId, signal), facts = await this.inspect(transport, frame, selector, signal);
		await this.authorize(targetId, frame, this.classify(facts, frame, false), { kind: "none" }, "Click actual control; resulting transfers are independently guarded", facts, signal);
		const navigation = facts.href ? await this.guard!.authorizeNavigation(targetId, facts.href, signal) : undefined;
		const current = await this.inspect(transport, frame, selector, signal);
		if (JSON.stringify(current) !== JSON.stringify(facts)) throw new BrowserControlError("control_changed", "Control changed during authorization; inspect it again.");
		const result = await this.evaluate<{ ok: boolean }>(transport, frame, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return { ok: false }; ${navigation ? `element.href = ${JSON.stringify(navigation.url)};` : ""} element.click(); return { ok: true }; })()`, signal);
		if (!result.ok) throw new BrowserControlError("selector_missing", "Selector no longer matches.");
	}
	async fill(state: BrowserSessionState, targetId: string, selector: string, input: string | BrowserFill, signal?: AbortSignal): Promise<void> {
		const fill = typeof input === "string" ? { value: input } : input;
		if ((fill.value === undefined) === (fill.secret_ref === undefined)) throw new BrowserControlError("value_required", "Fill requires exactly one of value or secret_ref.");
		const transport = await this.target(state, targetId, signal), frame = await this.frame(transport, targetId, fill.frame_id, signal), facts = await this.inspect(transport, frame, selector, signal);
		if (!["input", "textarea"].includes(facts.tag) || ["file", "hidden", "checkbox", "radio", "submit", "button"].includes(facts.type)) throw new BrowserControlError("control_invalid", "Fill requires an actual editable input or textarea.");
		const sources = fill.value === undefined ? { sourceObservationIds: [], containsProtectedData: false } : this.settings().observations?.payload?.(fill.value) ?? { sourceObservationIds: [], containsProtectedData: false };
		const payload: BrowserEffect["payload"] = fill.secret_ref !== undefined ? { kind: "secret-ref", reference: fill.secret_ref, purpose: "login" } : { kind: "redacted", sourceObservationIds: sources.sourceObservationIds, containsProtectedData: sources.containsProtectedData || [...this.protectedValues].some(value => fill.value!.includes(value)) };
		const observedKind = this.classify(facts, frame, true);
		const kind = fill.secret_ref !== undefined && observedKind === "dev-form" && (facts.password || facts.loginForm || facts.autocomplete === "username") ? "login" : observedKind;
		await this.authorize(targetId, frame, kind, payload, "Fill actual field; input/change handlers can immediately transmit", facts, signal);
		// Reinspect exact field/form immediately before local resolution, then again before setter.
		if (JSON.stringify(await this.inspect(transport, frame, selector, signal)) !== JSON.stringify(facts)) throw new BrowserControlError("control_changed", "Control changed during authorization.");
		let value = fill.value;
		if (fill.secret_ref !== undefined) {
			if (kind !== "login" || !this.settings().resolveCredential) throw new BrowserControlError("credential_unavailable", "Credential references require a bound login field.");
			const root = await this.frame(transport, targetId, undefined, signal);
			try { value = await this.settings().resolveCredential!(fill.secret_ref, { origin: root.securityOrigin, frameOrigin: frame.securityOrigin, field: facts.password ? "password" : facts.autocomplete === "username" ? "username" : facts.name || facts.autocomplete || facts.type, ...(facts.form ? { formOrigin: new URL(facts.form).origin } : {}) }, AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : []), AbortSignal.timeout(20_000)])); }
			catch { throw new BrowserControlError("credential_unavailable", "Bound browser credential is unavailable or the destination is not authorized."); }
		}
		const destination = new URL(facts.form || frame.url);
		const origins = fill.secret_ref ? this.settings().credentialOrigins?.(fill.secret_ref) ?? [canonicalPageOrigin(destination.origin)] : [canonicalPageOrigin(destination.origin)];
		this.transfers = this.transfers.filter(item => item.targetId !== frame.targetId || item.frameId !== frame.frameId || item.selector !== selector);
		this.transfers.push({ targetId: frame.targetId, frameId: frame.frameId, origins: [...origins], sourceOrigin: frameOrigin(frame), selector, loaderId: frame.loaderId, executionContextId: frame.executionContextId, value: value!, kind, protected: facts.password || fill.secret_ref !== undefined, sourceObservationIds: sources.sourceObservationIds, containsProtectedData: sources.containsProtectedData, ...(fill.secret_ref ? { reference: fill.secret_ref } : {}) });
		if (facts.password || fill.secret_ref !== undefined) {
			this.protectedValues.add(value!); const controls = this.protectedControls.get(frame.frameId) ?? new Set<string>(); controls.add(selector); this.protectedControls.set(frame.frameId, controls);
			this.settings().observations?.protect?.(value!, targetId, frame.frameId, selector);
		}
		await this.authorize(targetId, frame, kind, payload, "Immediate fill-time input/change transfer boundary", facts, signal);
		if (JSON.stringify(await this.inspect(transport, frame, selector, signal)) !== JSON.stringify(facts)) throw new BrowserControlError("control_changed", "Control changed before fill.");
		const result = await this.evaluate<{ ok: boolean }>(transport, frame, browserFillExpression(selector, value!, facts), signal);
		value = undefined;
		if (!result.ok) throw new BrowserControlError("control_changed", "Exact editable control changed before filling.");
	}
	async close(state: BrowserSessionState, targetId: string, signal?: AbortSignal): Promise<void> {
		const transport = await this.target(state, targetId, signal);
		await transport.command(targetId, "Target.closeTarget", { targetId }, { signal });
	}
	dispose(): void { if (this.ownerAbort) this.ownerAbort.signal.removeEventListener("abort", this.ownerAbort.handler); this.ownerAbort = undefined; this.lifetime.abort(); this.lifetime = new AbortController(); this.guard?.dispose(); this.options?.runtime.disposeTransport(); this.transport = undefined; this.guard = undefined; this.connecting = undefined; this.sessionId = undefined; this.identity = undefined; this.protectedValues.clear(); this.protectedControls.clear(); this.transfers = []; this.privateFrames.clear(); this.options?.observations?.clear?.(); }
}
