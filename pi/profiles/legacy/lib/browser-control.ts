import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir, updateJsonObjectAtomic, writeJsonObjectAtomic } from "./settings-file.js";

export const MAX_OUTPUT = 50_000;
export const MAX_ITEMS = 100;
export const BROWSER_CONFIG_VERSION = 1;

export type ProfileMode = "isolated" | "real";
export type ExtensionMode = "enabled" | "disabled";
export type SessionAction = "discover" | "status" | "start" | "restart" | "stop";
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

export interface BrowserExecutor {
	run(command: string, args: string[], signal?: AbortSignal): Promise<BrowserCommandResult>;
}

export class BrowserControlError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = "BrowserControlError";
		this.code = code;
	}
}

const SENSITIVE_TEXT = /(?:password|passwd|passcode|credential|captcha|recaptcha|hcaptcha|unusual\s+traffic|verify\s+(?:you|that)|consent\s+(?:required|interstitial))/i;
const PASSWORD_FIELD = /(?:password|passwd|passcode|credential|secret|token)/i;

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
		outcome: output.match(/close-owned:\s*([a-z_]+)/)?.[1],
	};
}

export function redactOutput(value: string, max = MAX_OUTPUT): string {
	const home = path.dirname(getAgentDir()).replaceAll("\\", "/");
	const normalized = value.replaceAll("\\", "/").replaceAll(home, "<HOME>");
	const redacted = normalized.replace(/(?:password|passwd|token|cookie|authorization|captcha)[^\n]*/gi, "[redacted]");
	return redacted.length <= max ? redacted : `${redacted.slice(0, max)}\n[output truncated]`;
}

export function isSensitiveSurface(value: string): boolean {
	return SENSITIVE_TEXT.test(value);
}

export function isPasswordField(value: string): boolean {
	return PASSWORD_FIELD.test(value);
}

export function invalidateComparison(state: BrowserSessionState, reason: string): BrowserSessionState {
	return { ...state, targetId: undefined, comparisonGeneration: state.comparisonGeneration + 1, comparisonInvalidatedReason: reason };
}

export function restartAuthorization(state: BrowserSessionState): string {
	return [state.profileAlias ?? "isolated", state.sessionId, state.pid, state.processStartTime, state.executablePath, state.userDataDir, state.profileDirectory, state.cdpPort].join(":");
}

export function createPiBrowserExecutor(pi: ExtensionAPI): BrowserExecutor {
	return {
		run: async (command, args, signal) => {
			const result = await pi.exec(command, args, { signal, timeout: 30_000 });
			return { code: result.code, stdout: result.stdout, stderr: result.stderr };
		},
	};
}

export class BrowserSessionProtocol {
	private readonly executor: BrowserExecutor;
	private readonly wrapperPath: string;
	constructor(executor: BrowserExecutor, wrapperPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/agent-browser-brave")) {
		this.executor = executor;
		this.wrapperPath = wrapperPath;
	}
	private async wrapper(args: string[], signal?: AbortSignal): Promise<BrowserCommandResult> {
		const result = await this.executor.run("python", [this.wrapperPath, ...args], signal);
		if (result.code !== 0) throw new BrowserControlError("protocol_failed", redactOutput(result.stderr || result.stdout));
		return { ...result, stdout: redactOutput(result.stdout), stderr: redactOutput(result.stderr) };
	}
	async status(signal?: AbortSignal): Promise<BrowserCommandResult> {
		return this.wrapper(["--status"], signal);
	}
	async start(input: { profileMode: ProfileMode; profileAlias?: string; extensionMode: ExtensionMode; url?: string; signal?: AbortSignal }): Promise<BrowserCommandResult> {
		const args = ["--open", input.url ?? "about:blank", "--extensions", input.extensionMode];
		if (input.profileMode === "real") {
			if (!input.profileAlias) throw new BrowserControlError("profile_required", "Real profile start requires a configured alias.");
			args.push("--real-brave-profile", input.profileAlias);
		}
		return this.wrapper(args, input.signal);
	}
	async stop(signal?: AbortSignal): Promise<BrowserCommandResult> {
		return this.wrapper(["--close-owned"], signal);
	}
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) throw new BrowserControlError("cdp_failed", `CDP returned HTTP ${response.status}.`);
	return await response.json() as T;
}

export async function listTargets(port: number): Promise<BrowserTarget[]> {
	const targets = await fetchJson<BrowserTarget[]>(`http://127.0.0.1:${port}/json/list`);
	return targets.filter((target) => target.type === "page").slice(0, MAX_ITEMS);
}

export async function getTarget(port: number, targetId: string): Promise<BrowserTarget> {
	const target = (await listTargets(port)).find((candidate) => candidate.id === targetId);
	if (!target) throw new BrowserControlError("target_mismatch", "CDP target is closed, replaced, or outside the current browser session.");
	return target;
}

let cdpMessageId = 0;
export async function cdpCommand<T>(target: BrowserTarget, method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
	if (!target.webSocketDebuggerUrl) throw new BrowserControlError("target_unavailable", "CDP target has no debugger endpoint.");
	return await new Promise<T>((resolve, reject) => {
		const socket = new WebSocket(target.webSocketDebuggerUrl!);
		const id = ++cdpMessageId;
		let settled = false;
		const timer = setTimeout(() => finish(new BrowserControlError("cdp_timeout", "CDP command timed out.")), 10_000);
		const finish = (error?: Error, value?: T) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			try { socket.close(); } catch { /* already closed */ }
			if (error) reject(error); else resolve(value as T);
		};
		const onAbort = () => finish(new BrowserControlError("cancelled", "Browser operation was cancelled."));
		signal?.addEventListener("abort", onAbort, { once: true });
		socket.addEventListener("open", () => socket.send(JSON.stringify({ id, method, params })));
		socket.addEventListener("message", (event) => {
			const message = JSON.parse(String(event.data)) as { id?: number; error?: { message?: string }; result?: T };
			if (message.id !== id) return;
			if (message.error) finish(new BrowserControlError("cdp_failed", message.error.message ?? "CDP command failed."));
			else finish(undefined, message.result as T);
		});
		socket.addEventListener("error", () => finish(new BrowserControlError("cdp_failed", "CDP WebSocket failed.")));
	});
}

interface SurfaceResult { result?: { value?: { sensitive?: boolean; captcha?: boolean; password?: boolean } } }
const SURFACE_EXPRESSION = `(() => { const text = (document.title + "\\n" + (document.body?.innerText || "")).slice(0, 20000); const password = !!document.querySelector('input[type="password"]'); const captcha = /captcha|recaptcha|hcaptcha|unusual\\s+traffic|verify\\s+(you|that)/i.test(text); const sensitive = password || captcha || /consent\\s+(required|interstitial)|before\\s+you\\s+continue|cookie\\s+consent|accept\\s+all/i.test(text); return { sensitive, captcha, password }; })()`;

export async function inspectSurface(target: BrowserTarget, signal?: AbortSignal): Promise<{ sensitive: boolean; captcha: boolean; password: boolean }> {
	const response = await cdpCommand<SurfaceResult>(target, "Runtime.evaluate", { expression: SURFACE_EXPRESSION, returnByValue: true }, signal);
	const value = response.result?.value;
	return { sensitive: value?.sensitive === true, captcha: value?.captcha === true, password: value?.password === true };
}

export class BrowserPageProtocol {
	async list(state: BrowserSessionState): Promise<BrowserTarget[]> {
		return await listTargets(state.cdpPort);
	}
	async open(state: BrowserSessionState, url: string, signal?: AbortSignal): Promise<BrowserTarget> {
		const before = new Set((await listTargets(state.cdpPort)).map((target) => target.id));
		const created = await fetchJson<BrowserTarget>(`http://127.0.0.1:${state.cdpPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT", signal });
		if (!created.id || before.has(created.id)) throw new BrowserControlError("target_missing", "CDP did not create one new target.");
		return await getTarget(state.cdpPort, created.id);
	}
	async select(state: BrowserSessionState, targetId: string, signal?: AbortSignal): Promise<void> {
		const target = await getTarget(state.cdpPort, targetId);
		await cdpCommand(target, "Page.bringToFront", {}, signal);
	}
	async snapshot(state: BrowserSessionState, targetId: string, signal?: AbortSignal): Promise<string> {
		const target = await this.allowedTarget(state, targetId, signal);
		const response = await cdpCommand<{ nodes?: Array<{ role?: { value?: string }; name?: { value?: string } }> }>(target, "Accessibility.getFullAXTree", {}, signal);
		return redactOutput((response.nodes ?? []).map((node) => `${node.role?.value ?? "node"}: ${node.name?.value ?? ""}`).join("\n"));
	}
	async screenshot(state: BrowserSessionState, targetId: string, outputPath: string, signal?: AbortSignal): Promise<void> {
		const target = await this.allowedTarget(state, targetId, signal);
		const response = await cdpCommand<{ data?: string }>(target, "Page.captureScreenshot", { format: "png" }, signal);
		if (!response.data) throw new BrowserControlError("screenshot_failed", "CDP returned no screenshot data.");
		await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
		await fs.promises.writeFile(outputPath, Buffer.from(response.data, "base64"));
	}
	async click(state: BrowserSessionState, targetId: string, selector: string, signal?: AbortSignal): Promise<void> {
		const target = await this.allowedTarget(state, targetId, signal);
		const expression = `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return { ok: false }; const label = [element.getAttribute('type'), element.getAttribute('name'), element.getAttribute('aria-label')].filter(Boolean).join(' '); if (/(password|passwd|passcode|credential|secret|token|captcha|recaptcha|hcaptcha)/i.test(label)) return { protected: true }; element.click(); return { ok: true }; })()`;
		const response = await cdpCommand<{ result?: { value?: { ok?: boolean; protected?: boolean } } }>(target, "Runtime.evaluate", { expression, returnByValue: true }, signal);
		if (response.result?.value?.protected) throw new BrowserControlError("protected_surface", "Protected controls require operator handling.");
		if (!response.result?.value?.ok) throw new BrowserControlError("selector_missing", "Selector did not match an element.");
	}
	async fill(state: BrowserSessionState, targetId: string, selector: string, value: string, signal?: AbortSignal): Promise<void> {
		if (isPasswordField(selector)) throw new BrowserControlError("protected_surface", "Password and credential fields cannot be filled.");
		const target = await this.allowedTarget(state, targetId, signal);
		const expression = `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return { ok: false }; const label = [element.getAttribute('type'), element.getAttribute('name'), element.getAttribute('autocomplete'), element.getAttribute('aria-label')].filter(Boolean).join(' '); if (/(password|passwd|passcode|credential|secret|token)/i.test(label)) return { protected: true }; element.focus(); element.value = ${JSON.stringify(value)}; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true }; })()`;
		const response = await cdpCommand<{ result?: { value?: { ok?: boolean; protected?: boolean } } }>(target, "Runtime.evaluate", { expression, returnByValue: true }, signal);
		if (response.result?.value?.protected) throw new BrowserControlError("protected_surface", "Password and credential fields cannot be filled.");
		if (!response.result?.value?.ok) throw new BrowserControlError("selector_missing", "Selector did not match an element.");
	}
	async close(state: BrowserSessionState, targetId: string, signal?: AbortSignal): Promise<void> {
		await getTarget(state.cdpPort, targetId);
		const response = await fetch(`http://127.0.0.1:${state.cdpPort}/json/close/${encodeURIComponent(targetId)}`, { signal });
		if (!response.ok) throw new BrowserControlError("cdp_failed", `CDP close returned HTTP ${response.status}.`);
	}
	private async allowedTarget(state: BrowserSessionState, targetId: string, signal?: AbortSignal): Promise<BrowserTarget> {
		const target = await getTarget(state.cdpPort, targetId);
		const surface = await inspectSurface(target, signal);
		if (surface.sensitive) throw new BrowserControlError("protected_surface", "Credential, CAPTCHA, or continuation surface requires operator handling.");
		return target;
	}
}
