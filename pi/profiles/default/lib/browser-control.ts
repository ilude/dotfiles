import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAgentDir, updateJsonObjectAtomic, writeJsonObjectAtomic } from "./settings-file.js";
import { BrowserRuntime } from "./browser-runtime.js";
import type { BrowserCdpTransport, CdpFrame } from "./browser-cdp-transport.js";
import type { CredentialTarget } from "./browser-credentials.js";
import { BROWSER_CONTROL_STATE, browserTextExpression, projectBrowserText } from "./browser-observations.js";
import { pressBrowserKey, pasteBrowserText, uploadBrowserFiles } from "./browser-input.js";

export const MAX_OUTPUT = 50_000;
export const MAX_ITEMS = 100;
export const BROWSER_CONFIG_VERSION = 1;

export type ProfileMode = "isolated" | "real";
export type SessionMode = "owned" | "attached";
export type ExtensionMode = "enabled" | "disabled";
export type SessionAction = "discover" | "status" | "start" | "attach" | "restart" | "stop";
export type PageAction = "list" | "open" | "select" | "snapshot" | "scroll" | "screenshot" | "click" | "fill" | "press" | "paste" | "upload" | "close";

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
	allowLocalhostTlsErrors?: boolean;
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
	protect?(value: string, targetId: string, frameId: string, selector: string): void;
	text?(text: string, source: { targetId: string; frameId: string; origin: string }, protectedValues: readonly string[], signal?: AbortSignal): Promise<string>;
	beforeScreenshot?(transport: BrowserCdpTransport, targetId: string, protectedValues: readonly string[], signal?: AbortSignal): Promise<() => Promise<void>>;
	payload?(value: string): { sourceObservationIds: string[]; containsProtectedData: boolean };
	clear?(): void;
}
export interface BrowserPageOptions {
	runtime: BrowserRuntime;
	resolveCredential?: (reference: string, target: CredentialTarget, signal: AbortSignal) => Promise<string>;
}
/** Wait for caller/owner cancellation without imposing an automated-operation deadline. */
async function actionWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	return await new Promise<T>((resolve, reject) => {
		const abort = () => reject(new BrowserControlError("cancelled", "Browser action cancelled or context expired."));
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();
		void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
	});
}
export type BrowserFill = { value?: string; secret_ref?: string; frame_id?: string };
type ControlFacts = { tag: string; type: string; name: string; autocomplete: string; label: string; form: string; href: string; captcha: boolean; password: boolean; loginForm: boolean; disabled: boolean; visible: boolean; readOnly: boolean; contentEditable: boolean };
type ControlResult = { ok: boolean; error?: string; visible?: boolean };
export type BrowserActionResult = { visible: boolean };
export type BrowserScroll = { scroll_mode?: "by" | "into_view"; selector?: string; delta_x?: number; delta_y?: number; frame_id?: string };
export type BrowserScrollPosition = { x: number; y: number };
export type BrowserScrollMovement = {
	document: boolean; before: BrowserScrollPosition; after: BrowserScrollPosition; delta: BrowserScrollPosition;
	min: BrowserScrollPosition; max: BrowserScrollPosition;
	boundary: { left: boolean; right: boolean; top: boolean; bottom: boolean };
};
export type BrowserScrollResult = { moved: boolean; movements: BrowserScrollMovement[]; inView?: boolean; ancestorsTruncated: boolean };

function validateScroll(input: BrowserScroll): void {
	const mode = input.scroll_mode ?? "by";
	if (!["by", "into_view"].includes(mode) || (input.selector !== undefined && (typeof input.selector !== "string" || !input.selector.trim() || input.selector.length > 2000))) throw new BrowserControlError("scroll_invalid", "Scroll requires mode by or into_view and a non-empty selector of at most 2000 characters when supplied.");
	if (mode === "into_view") {
		if (!input.selector || input.delta_x !== undefined || input.delta_y !== undefined) throw new BrowserControlError("scroll_invalid", "into_view requires selector and no deltas; each ancestor movement is bounded to 2000 pixels per axis.");
	} else if ([input.delta_x ?? 0, input.delta_y ?? 0].some(value => !Number.isInteger(value) || Math.abs(value) > 2000) || !(input.delta_x || input.delta_y)) throw new BrowserControlError("scroll_invalid", "by requires at least one nonzero integer delta_x/delta_y, each between -2000 and 2000 pixels.");
}

/** Fixed scroll implementation. Never traverses out of the selected frame document. */
export function browserScrollExpression(input: BrowserScroll): string {
	validateScroll(input);
	return `(() => {
		const mode = ${JSON.stringify(input.scroll_mode ?? "by")};
		const selector = ${JSON.stringify(input.selector ?? null)};
		let element;
		if (selector !== null) {
			let matches; try { matches = document.querySelectorAll(selector); } catch { return { error: 'selector_invalid' }; }
			if (matches.length !== 1) return { error: matches.length ? 'selector_ambiguous' : 'selector_missing' };
			element = matches[0];
		}
		const root = document.scrollingElement;
		if (!root) return { error: 'scroll_unavailable' };
		const movements = [];
		const clamp = value => Math.max(-2000, Math.min(2000, value));
		if (mode === 'by' && element && typeof element.scrollTo !== 'function') return { error: 'scroll_unavailable' };
		const move = (container, dx, dy) => {
			const before = { x: container.scrollLeft, y: container.scrollTop };
			container.scrollTo({ left: before.x + clamp(dx), top: before.y + clamp(dy), behavior: 'instant' });
			const after = { x: container.scrollLeft, y: container.scrollTop };
			const width = Math.max(0, container.scrollWidth - container.clientWidth), height = Math.max(0, container.scrollHeight - container.clientHeight);
			const rtl = getComputedStyle(container).direction === 'rtl';
			const min = { x: rtl ? -width : 0, y: 0 }, max = { x: rtl ? 0 : width, y: height };
			movements.push({ document: container === root, before, after, delta: { x: after.x - before.x, y: after.y - before.y }, min, max,
				boundary: { left: after.x <= min.x + 1, right: after.x >= max.x - 1, top: after.y <= 1, bottom: after.y >= max.y - 1 } });
		};
		let ancestorsTruncated = false, inView;
		if (mode === 'by') move(element || root, ${input.delta_x ?? 0}, ${input.delta_y ?? 0});
		else {
			const containers = []; let inspected = 0;
			for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
				if (++inspected > 256) { ancestorsTruncated = true; break; }
				const style = getComputedStyle(parent);
				if ((parent.scrollHeight > parent.clientHeight && /auto|scroll|hidden|overlay/.test(style.overflowY)) || (parent.scrollWidth > parent.clientWidth && /auto|scroll|hidden|overlay/.test(style.overflowX))) containers.push(parent);
				if (containers.length === 16) { ancestorsTruncated = true; break; }
			}
			if (!ancestorsTruncated) containers.push(root);
			const viewport = container => container === root ? { left: 0, top: 0, right: root.clientWidth, bottom: root.clientHeight } : (() => { const rect = container.getBoundingClientRect(); const left = rect.left + container.clientLeft, top = rect.top + container.clientTop; return { left, top, right: left + container.clientWidth, bottom: top + container.clientHeight }; })();
			const distance = (start, end, low, high) => start < low ? start - low : end > high ? Math.min(end - high, start - low) : 0;
			for (const container of containers) {
				const rect = element.getBoundingClientRect(), view = viewport(container);
				move(container, distance(rect.left, rect.right, view.left, view.right), distance(rect.top, rect.bottom, view.top, view.bottom));
			}
			const rect = element.getBoundingClientRect();
			inView = !ancestorsTruncated && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && containers.every(container => { const view = viewport(container); return rect.right > view.left && rect.left < view.right && rect.bottom > view.top && rect.top < view.bottom; });
		}
		return { moved: movements.some(item => item.delta.x !== 0 || item.delta.y !== 0), movements, ...(inView === undefined ? {} : { inView }), ancestorsTruncated };
	})()`;
}

function sameControlFacts(left: ControlFacts, right: ControlFacts): boolean {
	// Rendering can change during a human decision. Report the execution-time fact
	// rather than turning a visibility change into a new blanket refusal.
	return JSON.stringify({ ...left, visible: undefined }) === JSON.stringify({ ...right, visible: undefined });
}

/** All action resolutions use the same document-wide, exact-frame uniqueness semantics. */
function uniqueControlExpression(selector: string): string {
	return `let matches; try { matches = document.querySelectorAll(${JSON.stringify(selector)}); } catch { return { ok: false, error: 'selector_invalid' }; } if (matches.length !== 1) return { ok: false, error: matches.length ? 'selector_ambiguous' : 'selector_missing' }; const element = matches[0]; const state = ${BROWSER_CONTROL_STATE}(element); if (state.disabled) return { ok: false, error: 'control_disabled' };`;
}

/** Fixed native setter remains independent of framework instance value trackers. */
export function browserFillExpression(selector: string, value: string, facts?: ControlFacts): string {
	return `(() => { ${uniqueControlExpression(selector)} if (element.readOnly) return { ok: false, error: 'control_readonly' }; ${facts ? `if (element.tagName.toLowerCase() !== ${JSON.stringify(facts.tag)} || (element.getAttribute('type') || '').toLowerCase() !== ${JSON.stringify(facts.type)} || (element.getAttribute('name') || '') !== ${JSON.stringify(facts.name)} || (element.getAttribute('autocomplete') || '') !== ${JSON.stringify(facts.autocomplete)} || (element.form ? element.form.action : '') !== ${JSON.stringify(facts.form)}) return { ok: false, error: 'control_changed' };` : ""} element.focus(); const contentEditable = element.isContentEditable || ['', 'true', 'plaintext-only'].includes(element.getAttribute('contenteditable')); if (contentEditable) element.textContent = ${JSON.stringify(value)}; else { const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : undefined; const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set; if (!setter) return { ok: false, error: 'control_invalid' }; setter.call(element, ${JSON.stringify(value)}); } element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} })); element.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true, visible: state.visible }; })()`;
}

/** Bounded executor URL-route evidence, not a claim to identify every private account UI. */
function canonicalPageOrigin(origin: string): string { if (origin === "null" || origin === "file://") return origin; const url = new URL(origin); url.hostname = url.hostname.replace(/\.+$/, ""); return url.origin; }
function frameOrigin(frame: Readonly<CdpFrame>): string {
	if (frame.url.startsWith("file:")) return "file://";
	// Chromium can serialize opaque blank-frame origins as "://" or an empty string.
	// Keep them opaque, never infer a trusted origin from the frame URL or parent.
	if (frame.securityOrigin === "://" || frame.securityOrigin === "") return "null";
	return canonicalPageOrigin(frame.securityOrigin);
}
function originVisibility(origin: string): "public" | "private" | "local" { if (origin === "null" || origin === "file://") return "private"; const host = new URL(origin).hostname; return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(host) ? "local" : "public"; }
function actualCaptchaFrame(raw: string): boolean {
	try { const url = new URL(raw); return ((url.hostname === "www.google.com" || url.hostname === "www.recaptcha.net") && url.pathname.startsWith("/recaptcha/")) || (url.hostname === "hcaptcha.com" || url.hostname.endsWith(".hcaptcha.com")); } catch { return false; }
}
export class BrowserPageProtocol {
	private transport?: BrowserCdpTransport;
	private sessionId?: string;
	private connecting?: Promise<BrowserCdpTransport>;
	private protectedValues = new Set<string>();
	private warningTargets = new Set<string>();
	private lifetime = new AbortController();
	private readonly options?: BrowserPageOptions;
	constructor(options?: BrowserPageOptions) { this.options = options; }
	private async connection(state: BrowserSessionState, signal?: AbortSignal, timeoutMs?: number): Promise<BrowserCdpTransport> {
		if (this.sessionId !== state.sessionId) this.dispose();
		this.sessionId = state.sessionId;
		if (this.transport?.signal.aborted) this.dispose();
		if (!this.transport) {
			if (!this.connecting) this.connecting = this.options!.runtime.connectTransport(state, { register: async setup => {
				if (setup.target.type === "page") { await setup.command("Page.enable"); await setup.command("Security.enable"); }
			}, signal: this.lifetime.signal, timeoutMs });
			try { this.transport = await this.connecting; this.transport.onEvent(event => this.observeNativeWarning(this.transport!, event)); } catch (error) { this.dispose(); throw error; } finally { this.connecting = undefined; }
		}
		await this.transport!.revalidate(signal);
		return timeoutMs === undefined ? this.transport! : this.transport!.withCommandTimeout(timeoutMs);
	}
	async list(state: BrowserSessionState, signal?: AbortSignal, timeoutMs?: number): Promise<BrowserTarget[]> {
		const transport = await this.connection(state, signal, timeoutMs);
		const bounded = AbortSignal.any([transport.signal, AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]);
		const targets = (await fetchJson<BrowserTarget[]>(`http://127.0.0.1:${state.cdpPort}/json/list`, { signal: bounded })).filter(target => target.type === "page").slice(0, MAX_ITEMS);
		await transport.revalidate(bounded);
		return targets.map(target => ({ ...target, url: this.filter(target.url) }));
	}
	private async target(state: BrowserSessionState, targetId: string, signal?: AbortSignal, timeoutMs?: number): Promise<BrowserCdpTransport> {
		const transport = await this.connection(state, signal, timeoutMs);
		await transport.manage(targetId, signal);
		this.assertNativeSafe(targetId);
		return transport;
	}
	private observeNativeWarning(transport: BrowserCdpTransport, event: { method: string; params: Record<string, unknown>; sessionId?: string }): void {
		const target = transport.managedTargets().find(item => item.sessionId === event.sessionId);
		if (!target) return;
		if (event.method === "Page.interstitialShown" || event.method === "Security.certificateError") this.warningTargets.add(target.targetId);
		if (event.method === "Page.interstitialHidden") this.warningTargets.delete(target.targetId);
		if (event.method === "Security.visibleSecurityStateChanged") {
			const state = event.params.visibleSecurityState as { securityState?: string; certificateSecurityState?: { certificateNetworkError?: string }; safetyTipInfo?: { safetyTipStatus?: string }; securityStateIssueIds?: string[] } | undefined;
			const url = transport.managedTargets().find(item => item.targetId === target.targetId)?.url ?? "";
			let host = ""; try { host = new URL(url).hostname.toLowerCase().replace(/\\.$/, ""); } catch { /* unknown URL */ }
			const localhost = host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1" || host === "[::1]";
			const localTlsException = this.transport?.state.allowLocalhostTlsErrors === true && localhost && Boolean(state?.certificateSecurityState?.certificateNetworkError);
			const warned = (state?.securityState === "insecure-broken" || Boolean(state?.certificateSecurityState?.certificateNetworkError)) && !localTlsException
				|| Boolean(state?.securityStateIssueIds?.includes("malicious-content")) || ["badReputation", "lookalike"].includes(state?.safetyTipInfo?.safetyTipStatus ?? "");
			if (warned) this.warningTargets.add(target.targetId);
		}
	}
	private assertNativeSafe(targetId: string): void {
		if (this.warningTargets.has(targetId)) throw new BrowserControlError("native_warning", "The browser reports a native security warning. Resolve it manually without bypassing TLS or Safe Browsing.");
	}
	async open(state: BrowserSessionState, url: string, signal?: AbortSignal, timeoutMs?: number): Promise<BrowserTarget> {
		const transport = await this.connection(state, signal, timeoutMs);
		signal = this.actionSignal(transport, signal);
		const target = await transport.create(signal);
		this.assertNativeSafe(target.targetId);
		await transport.command(target.targetId, "Page.navigate", { url }, { signal });
		return { id: target.targetId, url, type: "page" };
	}
	async select(state: BrowserSessionState, targetId: string, signal?: AbortSignal, timeoutMs?: number): Promise<void> {
		const transport = await this.target(state, targetId, signal, timeoutMs);
		await transport.command(targetId, "Page.bringToFront", {}, { signal });
	}
	private async frame(transport: BrowserCdpTransport, targetId: string, frameId?: string, signal?: AbortSignal): Promise<Readonly<CdpFrame>> {
		if (frameId) return await transport.frame(targetId, frameId, signal);
		const frames = (await transport.frameList(targetId, signal)).filter(frame => frame.targetId === targetId && !frame.parentFrameId);
		if (frames.length !== 1) throw new BrowserControlError("frame_required", "Specify the exact frame_id for this control.");
		return frames[0]!;
	}
	private async evaluate<T>(transport: BrowserCdpTransport, frame: Readonly<CdpFrame>, expression: string, signal?: AbortSignal): Promise<T> {
		await transport.revalidateFrame(frame, signal); this.assertNativeSafe(frame.targetId);
		if (frame.executionContextId === undefined) throw new BrowserControlError("frame_unavailable", "The exact frame has no current execution context.");
		const response = await transport.command<{ result?: { value?: T }; exceptionDetails?: unknown }>(frame.targetId, "Runtime.evaluate", { expression, contextId: frame.executionContextId, returnByValue: true }, { signal });
		if (response.exceptionDetails || response.result?.value === undefined) throw new BrowserControlError("control_failed", "Browser control inspection or execution failed.");
		return response.result.value;
	}
	private filter(text: string): string { return projectBrowserText(text, [...this.protectedValues]); }
	async frames(state: BrowserSessionState, targetId: string, signal?: AbortSignal, timeoutMs?: number): Promise<Array<{ id: string; targetId: string; origin: string }>> {
		const transport = await this.target(state, targetId, signal, timeoutMs);
		const ids = [...new Set((await transport.frameList(targetId, signal)).map(frame => frame.frameId))].slice(0, MAX_ITEMS);
		const frames = await Promise.all(ids.map(id => transport.frame(targetId, id, signal)));
		return frames.map(frame => ({ id: frame.frameId, targetId: frame.targetId, origin: this.filter(frameOrigin(frame)) }));
	}
	async snapshot(state: BrowserSessionState, targetId: string, signal?: AbortSignal, frameId?: string, selector?: string, timeoutMs?: number): Promise<string> {
		const transport = await this.target(state, targetId, signal, timeoutMs), frame = await this.frame(transport, targetId, frameId, signal);
		const text = await this.evaluate<string | { error: string }>(transport, frame, browserTextExpression(selector), signal);
		await transport.revalidateFrame(frame, signal);
		if (typeof text !== "string") this.controlFailure(text.error, frame, targetId);
		const filtered = this.filter(text);
		return filtered;
	}
	async scroll(state: BrowserSessionState, targetId: string, input: BrowserScroll, signal?: AbortSignal, timeoutMs?: number): Promise<BrowserScrollResult> {
		validateScroll(input);
		const transport = await this.target(state, targetId, signal, timeoutMs), frame = await this.frame(transport, targetId, input.frame_id, signal);
		signal = this.actionSignal(transport, signal);
		const result = await this.evaluate<BrowserScrollResult | { error: string }>(transport, frame, browserScrollExpression(input), signal);
		if ("error" in result) this.controlFailure(result.error, frame, targetId);
		return result;
	}
	async screenshot(state: BrowserSessionState, targetId: string, outputPath: string, signal?: AbortSignal, timeoutMs?: number): Promise<{ origin: string; classification: "public" | "private" }> {
		const transport = await this.target(state, targetId, signal, timeoutMs);
		const root = await this.frame(transport, targetId, undefined, signal);
		await transport.revalidate(signal); this.assertNativeSafe(targetId);
		const response = await transport.command<{ data?: string }>(targetId, "Page.captureScreenshot", { format: "png" }, { signal });
		if (!response.data) throw new BrowserControlError("screenshot_failed", "CDP returned no screenshot data.");
		await fs.promises.mkdir(path.dirname(outputPath), { recursive: true }); await fs.promises.writeFile(outputPath, Buffer.from(response.data, "base64"));
		return { origin: frameOrigin(root), classification: originVisibility(frameOrigin(root)) === "public" ? "public" : "private" };
	}
	observationClass(source: { origin: string; targetId?: string; frameId?: string }): "public" | "private" { return originVisibility(source.origin) === "public" ? "public" : "private"; }
	private controlFailure(error: string | undefined, frame: Readonly<CdpFrame>, targetId: string): never {
		const messages: Record<string, string> = { selector_invalid: "Invalid CSS selector.", selector_missing: "Selector did not match an element.", selector_ambiguous: "Selector matches multiple elements; use one uniquely verified selector.", control_disabled: "Control is disabled; choose an enabled control after observing current state.", control_readonly: "Control is read-only.", control_invalid: "Control is not editable.", control_changed: "Control changed before execution.", scroll_unavailable: "The exact frame has no scrolling document." };
		const code = error && Object.hasOwn(messages, error) ? error : "control_changed";
		throw new BrowserControlError(code, `${messages[code]} Snapshot target_id=${JSON.stringify(this.filter(targetId))} frame_id=${JSON.stringify(this.filter(frame.frameId))} again; for a missing/ambiguous subtree root, omit selector first. Do not guess or automatically retry the action.`);
	}
	private async inspect(transport: BrowserCdpTransport, frame: Readonly<CdpFrame>, targetId: string, selector: string, signal?: AbortSignal): Promise<ControlFacts> {
		const facts = await this.evaluate<ControlFacts | ControlResult>(transport, frame, `(() => { ${uniqueControlExpression(selector)} const captcha = !!element.closest('.g-recaptcha,.h-captcha') || (element.tagName === 'IFRAME' && (() => { try { const url = new URL(element.src); return ((url.hostname === 'www.google.com' || url.hostname === 'www.recaptcha.net') && url.pathname.startsWith('/recaptcha/')) || url.hostname === 'hcaptcha.com' || url.hostname.endsWith('.hcaptcha.com'); } catch { return false; } })()); return { tag: element.tagName.toLowerCase(), type: (element.getAttribute('type') || '').toLowerCase(), name: (element.getAttribute('name') || '').slice(0, 100), autocomplete: (element.getAttribute('autocomplete') || '').slice(0,100), label: (element.getAttribute('aria-label') || Array.from(element.labels || []).map(label => label.textContent || '').join(' ') || (['INPUT','TEXTAREA','SELECT'].includes(element.tagName) ? '' : element.textContent) || '').slice(0,200), form: element.form ? element.form.action : '', href: element.href || '', ...state, readOnly: !!element.readOnly, contentEditable: !!element.isContentEditable || ['', 'true', 'plaintext-only'].includes(element.getAttribute('contenteditable')), captcha, loginForm: !!element.form?.querySelector('input[type="password"],input[autocomplete="current-password"]'), password: element.getAttribute('type') === 'password' || element.getAttribute('autocomplete') === 'current-password' || element.getAttribute('autocomplete') === 'new-password' }; })()`, signal);
		if ("ok" in facts) this.controlFailure(facts.error, frame, targetId);
		if (facts.captcha || actualCaptchaFrame(frame.url)) throw new BrowserControlError("manual_captcha", "Complete the actual CAPTCHA manually; other page controls remain available.");
		return facts;
	}
	private actionSignal(transport: BrowserCdpTransport, signal?: AbortSignal): AbortSignal {
		return AbortSignal.any([this.lifetime.signal, transport.signal, ...(signal ? [signal] : [])]);
	}
	async click(state: BrowserSessionState, targetId: string, selector: string, signal?: AbortSignal, frameId?: string, timeoutMs?: number): Promise<BrowserActionResult> {
		const transport = await this.target(state, targetId, signal, timeoutMs), frame = await this.frame(transport, targetId, frameId, signal), facts = await this.inspect(transport, frame, targetId, selector, signal);
		signal = this.actionSignal(transport, signal);
		const navigation = facts.href ? new URL(facts.href).href : undefined;
		const current = await this.inspect(transport, frame, targetId, selector, signal);
		if (!sameControlFacts(current, facts)) this.controlFailure("control_changed", frame, targetId);
		const result = await this.evaluate<ControlResult>(transport, frame, `(() => { ${uniqueControlExpression(selector)} ${navigation ? `element.href = ${JSON.stringify(navigation)};` : ""} element.click(); return { ok: true, visible: state.visible }; })()`, signal);
		if (!result.ok) this.controlFailure(result.error, frame, targetId);
		return { visible: result.visible === true };
	}
	async fill(state: BrowserSessionState, targetId: string, selector: string, input: string | BrowserFill, signal?: AbortSignal, timeoutMs?: number): Promise<BrowserActionResult> {
		const fill = typeof input === "string" ? { value: input } : input;
		if ((fill.value === undefined) === (fill.secret_ref === undefined)) throw new BrowserControlError("value_required", "Fill requires exactly one of value or secret_ref.");
		const transport = await this.target(state, targetId, signal, timeoutMs), frame = await this.frame(transport, targetId, fill.frame_id, signal), facts = await this.inspect(transport, frame, targetId, selector, signal);
		signal = this.actionSignal(transport, signal);
		if (facts.readOnly) this.controlFailure("control_readonly", frame, targetId);
		if ((!facts.contentEditable && !["input", "textarea"].includes(facts.tag)) || ["file", "hidden", "checkbox", "radio", "submit", "button"].includes(facts.type)) throw new BrowserControlError("control_invalid", "Fill requires an editable input, textarea, or contenteditable element.");
		// Reinspect exact field/form immediately before local resolution, then again before setter.
		if (!sameControlFacts(await this.inspect(transport, frame, targetId, selector, signal), facts)) this.controlFailure("control_changed", frame, targetId);
		let value = fill.value;
		if (fill.secret_ref !== undefined) {
			if (!this.options?.resolveCredential) throw new BrowserControlError("credential_unavailable", "Credential references require a configured credential binding.");
			const root = await this.frame(transport, targetId, undefined, signal);
			try {
				const bounded = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
				value = await actionWork(this.options.resolveCredential(fill.secret_ref, { origin: root.securityOrigin, frameOrigin: frame.securityOrigin, field: facts.password ? "password" : facts.autocomplete === "username" ? "username" : facts.name || facts.autocomplete || facts.type, ...(facts.form ? { formOrigin: new URL(facts.form).origin } : {}) }, bounded), bounded);
				// A child login frame does not establish that its top-level credential origin survived resolution.
				await actionWork(transport.revalidateFrame(root, bounded), bounded);
			} catch { throw new BrowserControlError("credential_unavailable", "Bound browser credential is unavailable or the destination is not authorized."); }
		}
		await transport.revalidateFrame(frame, signal);
		if (!sameControlFacts(await this.inspect(transport, frame, targetId, selector, signal), facts)) this.controlFailure("control_changed", frame, targetId);
		if (facts.password || fill.secret_ref !== undefined) this.protectedValues.add(value!);
		const result = await this.evaluate<ControlResult>(transport, frame, browserFillExpression(selector, value!, facts), signal);
		value = undefined;
		if (!result.ok) this.controlFailure(result.error, frame, targetId);
		return { visible: result.visible === true };
	}
	private async inputFrame(transport: BrowserCdpTransport, targetId: string, frameId?: string, selector?: string, signal?: AbortSignal): Promise<Readonly<CdpFrame>> {
		const frame = await this.frame(transport, targetId, frameId, signal);
		if (actualCaptchaFrame(frame.url)) throw new BrowserControlError("manual_captcha", "Complete the actual CAPTCHA manually; other page controls remain available.");
		if (selector !== undefined) await this.inspect(transport, frame, targetId, selector, signal);
		return frame;
	}
	async press(state: BrowserSessionState, targetId: string, key: string, signal?: AbortSignal, frameId?: string, selector?: string, timeoutMs?: number): Promise<void> {
		const transport = await this.target(state, targetId, signal, timeoutMs), frame = await this.inputFrame(transport, targetId, frameId, selector, signal);
		await pressBrowserKey(transport, targetId, frame, key, selector, this.actionSignal(transport, signal));
	}
	async paste(state: BrowserSessionState, targetId: string, value: string, signal?: AbortSignal, frameId?: string, selector?: string, timeoutMs?: number): Promise<void> {
		const transport = await this.target(state, targetId, signal, timeoutMs), frame = await this.inputFrame(transport, targetId, frameId, selector, signal);
		await pasteBrowserText(transport, targetId, frame, value, selector, this.actionSignal(transport, signal));
	}
	async upload(state: BrowserSessionState, targetId: string, selector: string, files: string[], signal?: AbortSignal, frameId?: string, timeoutMs?: number): Promise<void> {
		const transport = await this.target(state, targetId, signal, timeoutMs), frame = await this.inputFrame(transport, targetId, frameId, selector, signal);
		await uploadBrowserFiles(transport, frame, selector, files, this.actionSignal(transport, signal));
	}
	async close(state: BrowserSessionState, targetId: string, signal?: AbortSignal, timeoutMs?: number): Promise<void> {
		const transport = await this.target(state, targetId, signal, timeoutMs);
		this.assertNativeSafe(targetId);
		await transport.command(targetId, "Target.closeTarget", { targetId }, { signal });
	}
	dispose(): void { this.lifetime.abort(); this.lifetime = new AbortController(); this.options?.runtime.disposeTransport(); this.transport = undefined; this.connecting = undefined; this.sessionId = undefined; this.protectedValues.clear(); this.warningTargets.clear(); }
}
