import path from "node:path";
import fs from "node:fs";
import { getAgentDir } from "../lib/settings-file.js";
import { browserCredentialConfigPath, parseBrowserCredentialConfig, createBrowserCredentialResolver } from "../lib/browser-credentials.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import { registerProfileCommand } from "../lib/profile-command.ts";
import {
	BrowserControlError,
	BrowserPageProtocol,
	BrowserSessionProtocol,
	PAGE_ACTIONS,
	discoverBraveProfiles,
	getBrowserConfigPath,
	loadBrowserState,
	parseSessionStatus,
	readBrowserConfig,
	redactOutput,
	resolveConfiguredProfile,
	restartAuthorization,
	saveBrowserState,
	writeBrowserConfig,
	type BrowserProfileConfig,
	type BrowserSessionState,
	type ExtensionMode,
	type PageAction,
	type ProfileMode,
	type SessionAction,
} from "../lib/browser-control.js";

const SESSION_ACTIONS = ["discover", "status", "start", "attach", "restart", "stop"] as const;

const SessionParameters = Type.Object({
	action: StringEnum(SESSION_ACTIONS),
	timeout_ms: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 300_000, description: "Optional overall call deadline and CDP timeout in milliseconds; CDP commands default to 30000. Overrides apply only to this call." })),
	profile_mode: Type.Optional(StringEnum(["isolated", "real"] as const)),
	profile_alias: Type.Optional(Type.String()),
	cdp_port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535 })),
	extension_mode: Type.Optional(StringEnum(["enabled", "disabled"] as const)),
	allow_localhost_tls_errors: Type.Optional(Type.Boolean({ description: "Owned isolated start only: allow certificate errors for localhost by using Chromium's localhost-only exception. Never enables bypass for remote hosts." })),
	restart_authorization: Type.Optional(Type.String()),
	download_directory: Type.Optional(Type.String({ minLength: 1, description: "Owned isolated start only. Set the native download destination for a fresh disposable profile." })),
	url: Type.Optional(Type.String()),
});

const PageParameters = Type.Object({
	action: StringEnum(PAGE_ACTIONS),
	timeout_ms: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 300_000, description: "Optional overall call deadline and CDP timeout in milliseconds; CDP commands default to 30000. Overrides apply only to this call." })),
	session_id: Type.String(),
	target_id: Type.Optional(Type.String()),
	url: Type.Optional(Type.String()),
	selector: Type.Optional(Type.String({ description: "Unique exact-frame CSS selector. Required for upload and scroll into_view; optional subtree for snapshot, container for scroll by, or focus for press/paste. Use selector or ref for click, fill and native forms. Wait accepts selector or text." })),
	scroll_mode: Type.Optional(StringEnum(["by", "into_view"] as const, { description: "Scroll only: by (default) moves document or selected container by deltas; into_view moves a selected element's ancestors within this exact frame, at most 16 containers and 2000 pixels per axis each. Re-snapshot after scrolling." })),
	delta_x: Type.Optional(Type.Integer({ minimum: -2000, maximum: 2000, description: "Scroll by only: horizontal pixels. At least one delta must be nonzero." })),
	delta_y: Type.Optional(Type.Integer({ minimum: -2000, maximum: 2000, description: "Scroll by only: vertical pixels. into_view takes no deltas." })),
	value: Type.Optional(Type.String()),
	ref: Type.Optional(Type.String({ description: "Current snapshot ref for click, fill, check, uncheck, or select_option; mutually exclusive with selector." })),
	text: Type.Optional(Type.String({ maxLength: 2000, description: "Wait for visible page text, or supply text when accepting a prompt." })),
	option_by: Type.Optional(StringEnum(["value", "label"] as const)),
	dialog_decision: Type.Optional(StringEnum(["accept", "dismiss"] as const)),
	dialog_id: Type.Optional(Type.String()),
	key: Type.Optional(Type.String({ description: "press: named key or chord, such as Enter, Tab, Control+a, or ControlOrMeta+a." })),
	files: Type.Optional(Type.Array(Type.String(), { description: "upload: local file paths. Relative paths resolve against the tool working directory; an empty list clears the file input." })),
	secret_ref: Type.Optional(Type.String()),
	frame_id: Type.Optional(Type.String()),
	output_path: Type.Optional(Type.String()),
});

type SessionInput = {
	action: SessionAction;
	timeout_ms?: number;
	profile_mode?: ProfileMode;
	profile_alias?: string;
	cdp_port?: number;
	extension_mode?: ExtensionMode;
	allow_localhost_tls_errors?: boolean;
	restart_authorization?: string;
	download_directory?: string;
	url?: string;
};

type PageInput = {
	action: PageAction;
	timeout_ms?: number;
	session_id: string;
	target_id?: string;
	url?: string;
	selector?: string;
	scroll_mode?: "by" | "into_view";
	delta_x?: number;
	delta_y?: number;
	value?: string;
	text?: string;
	ref?: string;
	option_by?: "value" | "label";
	dialog_decision?: "accept" | "dismiss";
	dialog_id?: string;
	key?: string;
	files?: string[];
	secret_ref?: string;
	frame_id?: string;
	output_path?: string;
};

function toolResult(text: string, details: Static<typeof BrowserResultSchema> = {}) {
	const structuredContent = details as unknown as import("@earendil-works/pi-ai").JsonValue;
	return { content: [{ type: "text" as const, text: redactOutput(text) }], details, structuredContent };
}

const BrowserResultSchema = Type.Object({
	state: Type.Optional(Type.Object({
		session: Type.Optional(Type.String()), sessionId: Type.Optional(Type.String()), profileMode: Type.Optional(Type.String()),
		sessionMode: Type.Optional(Type.String()), profileAlias: Type.Optional(Type.String()), extensionMode: Type.Optional(Type.String()),
		targetId: Type.Optional(Type.String()), comparisonGeneration: Type.Optional(Type.Number()), comparisonInvalidated: Type.Optional(Type.Boolean()),
		restartAuthorizationRequired: Type.Optional(Type.Boolean()),
	}, { additionalProperties: false })),
	status: Type.Optional(Type.Object({ online: Type.Optional(Type.Boolean()), ownershipVerified: Type.Optional(Type.Boolean()), outcome: Type.Optional(Type.String()) })),
	candidates: Type.Optional(Type.Array(Type.Object({ userDataDir: Type.String(), profileDirectory: Type.String(), displayName: Type.String(), configuredAliases: Type.Array(Type.String()) }))),
	candidateCount: Type.Optional(Type.Number()), targets: Type.Optional(Type.Array(Type.Object({ id: Type.String(), url: Type.String(), type: Type.Optional(Type.String()) }))),
	count: Type.Optional(Type.Number()), targetId: Type.Optional(Type.String()), url: Type.Optional(Type.String()),
	snapshot: Type.Optional(Type.String()),
	visible: Type.Optional(Type.Boolean()),
	dialog: Type.Optional(Type.Object({ id: Type.String(), type: StringEnum(["alert", "confirm", "prompt", "beforeunload"] as const), message: Type.String({ maxLength: 500 }) }, { additionalProperties: false })),
	downloads: Type.Optional(Type.Array(Type.Object({ id: Type.String(), state: StringEnum(["in_progress", "completed", "canceled"] as const), path: Type.Optional(Type.String()) }, { additionalProperties: false }), { maxItems: 20 })),
	diagnostics: Type.Optional(Type.Object({ events: Type.Array(Type.Union([
		Type.Object({ kind: Type.Literal("console"), level: StringEnum(["warning", "error"] as const) }),
		Type.Object({ kind: StringEnum(["page_error", "request_failed"] as const) }),
		Type.Object({ kind: Type.Literal("http_error"), status: Type.Integer() }),
	]), { maxItems: 50 }), dropped: Type.Integer() }, { additionalProperties: false })),
	scroll: Type.Optional(Type.Object({
		moved: Type.Boolean(), ancestorsTruncated: Type.Boolean(),
		inView: Type.Optional(Type.Boolean({ description: "Selected element intersects all inspected ancestor viewports after into_view; not proof that all content was read." })),
		movements: Type.Array(Type.Object({
			document: Type.Boolean(),
			before: Type.Object({ x: Type.Number(), y: Type.Number() }), after: Type.Object({ x: Type.Number(), y: Type.Number() }),
			delta: Type.Object({ x: Type.Number(), y: Type.Number() }), min: Type.Object({ x: Type.Number(), y: Type.Number() }), max: Type.Object({ x: Type.Number(), y: Type.Number() }),
			boundary: Type.Object({ left: Type.Boolean(), right: Type.Boolean(), top: Type.Boolean(), bottom: Type.Boolean() }),
		}, { additionalProperties: false }), { maxItems: 16 }),
	}, { additionalProperties: false })),
	frames: Type.Optional(Type.Array(Type.Object({ id: Type.String(), targetId: Type.String(), origin: Type.String() }, { additionalProperties: false }))),
	observation: Type.Optional(Type.Object({ source: Type.Literal("browser"), trust: Type.Literal("untrusted"), kind: Type.Literal("image"), origin: Type.String(), classification: StringEnum(["public", "private"] as const), screening: Type.Literal("not-screened") }, { additionalProperties: false })),
}, { additionalProperties: false });

function safeUrl(value: string): string {
	try {
		const url = new URL(value);
		return url.protocol === "file:" ? `file://${url.host}${url.pathname}` : `${url.origin}${url.pathname}`;
	} catch {
		return value === "about:blank" ? value : "<invalid-url>";
	}
}

function publicState(state: BrowserSessionState | undefined): NonNullable<Static<typeof BrowserResultSchema>["state"]> {
	if (!state) return { session: "absent" };
	return {
		sessionId: state.sessionId,
		profileMode: state.profileMode,
		sessionMode: state.sessionMode ?? "owned",
		profileAlias: state.profileAlias,
		extensionMode: state.extensionMode,
		targetId: state.targetId,
		comparisonGeneration: state.comparisonGeneration,
		comparisonInvalidated: state.comparisonInvalidatedReason !== undefined,
		restartAuthorizationRequired: state.profileMode === "real",
	};
}

function parseSetupArgs(args: string): { alias: string; profileDirectory: string; userDataDir?: string; extensionsExpected?: boolean } {
	const trimmed = args.trim();
	if (!trimmed) throw new BrowserControlError("usage", "Usage: /browser-setup {\"alias\":\"...\",\"profileDirectory\":\"...\",\"userDataDir\":\"...\"}");
	let fields: Record<string, unknown>;
	try {
		fields = JSON.parse(trimmed) as Record<string, unknown>;
	} catch {
		throw new BrowserControlError("invalid_setup", "Browser setup must be one JSON object.");
	}
	if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new BrowserControlError("invalid_setup", "Browser setup must be one JSON object.");
	const allowed = new Set(["alias", "profileDirectory", "userDataDir", "extensionsExpected"]);
	if (Object.keys(fields).some((key) => !allowed.has(key))) throw new BrowserControlError("invalid_setup", "Only alias, profileDirectory, userDataDir, and extensionsExpected may be configured.");
	if (typeof fields.alias !== "string" || !fields.alias.trim() || typeof fields.profileDirectory !== "string" || !fields.profileDirectory.trim()) throw new BrowserControlError("invalid_setup", "Setup requires non-empty alias and profileDirectory strings.");
	if (fields.userDataDir !== undefined && (typeof fields.userDataDir !== "string" || !fields.userDataDir.trim())) throw new BrowserControlError("invalid_setup", "userDataDir must be a non-empty string.");
	if (fields.extensionsExpected !== undefined && typeof fields.extensionsExpected !== "boolean") throw new BrowserControlError("invalid_setup", "extensionsExpected must be boolean.");
	return {
		alias: fields.alias,
		profileDirectory: fields.profileDirectory,
		...(fields.userDataDir === undefined ? {} : { userDataDir: fields.userDataDir }),
		...(fields.extensionsExpected === undefined ? {} : { extensionsExpected: fields.extensionsExpected }),
	};
}

function requireTarget(input: PageInput): string {
	if (!input.target_id) throw new BrowserControlError("target_required", `${input.action} requires a raw CDP target ID.`);
	return input.target_id;
}

export default function registerBrowserControl(pi: ExtensionAPI) {
	const sessions = new BrowserSessionProtocol();
	let credentials: ReturnType<typeof createBrowserCredentialResolver> | undefined;
	let credentialLifetime = new AbortController();
	const pages = new BrowserPageProtocol({
		runtime: sessions,
		resolveCredential: async (reference, target, signal) => {
			if (credentialLifetime.signal.aborted) throw new BrowserControlError("credential_unavailable", "Browser session ended.");
			if (!credentials) {
				let config;
				try { config = parseBrowserCredentialConfig(JSON.parse(fs.readFileSync(browserCredentialConfigPath(getAgentDir()), "utf8"))); }
				catch { throw new Error("Browser credential configuration unavailable."); }
				credentials = createBrowserCredentialResolver(config, (command, args, options) => pi.exec(command, args, options), credentialLifetime.signal);
			}
			return await credentials.resolve(reference, target, AbortSignal.any([signal, credentialLifetime.signal]));
		},
	});
	let state: BrowserSessionState | undefined;
	const dispose = () => { pages.dispose(); credentials?.clear(); credentials = undefined; credentialLifetime.abort(); credentialLifetime = new AbortController(); };
	pi.on("session_start", () => { dispose(); state = loadBrowserState(); });
	pi.on("session_before_switch", dispose);
	const navigateInitial = async (url: string | undefined, signal?: AbortSignal, timeoutMs?: number) => {
		if (!url || !state) return;
		const target = await pages.open(state, url, signal, timeoutMs); state = { ...state, targetId: target.id }; await saveBrowserState(state);
	};

	registerProfileCommand(pi, "browser-setup", {
		description: "Validate and save one secret-free local Brave profile alias",
		handler: async (args, ctx) => {
			try {
				const setup = parseSetupArgs(args);
				const discovered = discoverBraveProfiles(setup.userDataDir ? [setup.userDataDir] : undefined);
				const matches = discovered.filter((candidate) => candidate.profileDirectory === setup.profileDirectory && (!setup.userDataDir || path.resolve(setup.userDataDir) === candidate.userDataDir));
				if (matches.length !== 1) throw new BrowserControlError("profile_unresolved", "Setup fields do not resolve to exactly one live Brave Local State profile.");
				const entry: BrowserProfileConfig = {
					profileDirectory: setup.profileDirectory,
					...(setup.userDataDir === undefined ? {} : { userDataDir: path.resolve(setup.userDataDir) }),
					...(setup.extensionsExpected === undefined ? {} : { extensionsExpected: setup.extensionsExpected }),
				};
				await writeBrowserConfig({ [setup.alias]: entry });
				ctx.ui.notify(`Saved browser profile alias ${setup.alias} in ${getBrowserConfigPath()}.`, "info");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Browser setup failed: ${message} Inspect the Brave profile configuration before retrying.`, "error");
			}
		},
	});

	pi.registerTool({
		name: "browser_session",
		label: "Browser Session",
		description: "Discover, inspect, start, attach, restart, or stop one ownership-verified Brave session. Only isolated starts may explicitly set allow_localhost_tls_errors to use Chromium's localhost-only TLS exception; remote certificate validation remains enabled. Attach connects only to an operator-launched real alias on loopback CDP; restart requires an owned session.",
		promptSnippet: "Control one profile-aware Brave session without guessing or broad process termination",
		parameters: SessionParameters,
		outputSchema: BrowserResultSchema,
		async execute(_id, rawParams, signal, _onUpdate, ctx) {
			const input = rawParams as SessionInput;
			if (input.download_directory !== undefined && (input.action !== "start" || !input.download_directory.trim())) throw new BrowserControlError("download_scope", "Set a non-empty download_directory only when starting an isolated session.");
			if (input.timeout_ms !== undefined) signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(input.timeout_ms)]) : AbortSignal.timeout(input.timeout_ms);
			if (input.action === "discover") {
				const config = readBrowserConfig();
				const candidates = discoverBraveProfiles().map((candidate) => ({
					userDataDir: redactOutput(candidate.userDataDir),
					profileDirectory: candidate.profileDirectory,
					displayName: candidate.displayName,
					configuredAliases: Object.entries(config.profiles).filter(([, profile]) => profile.profileDirectory === candidate.profileDirectory && (!profile.userDataDir || path.resolve(profile.userDataDir) === candidate.userDataDir)).map(([alias]) => alias),
				}));
				return toolResult(`${JSON.stringify({ candidates }, null, 2)}\nUse /browser-setup with one exact candidate; no profile is guessed.`, { candidates, candidateCount: candidates.length });
			}

			if (input.action === "status") {
				const command = await sessions.status(signal);
				state = loadBrowserState();
				return toolResult(command.stdout || "Browser session is absent.", { state: publicState(state), status: parseSessionStatus(command.stdout) });
			}

			if (input.action === "start") {
				state = loadBrowserState();
				if (input.allow_localhost_tls_errors && (input.profile_mode ?? "isolated") !== "isolated") throw new BrowserControlError("tls_exception_scope", "The localhost TLS exception is available only for Pi-owned isolated sessions.");
				const profileMode = input.profile_mode ?? "isolated";
				if (profileMode === "real") {
					if (!input.profile_alias) throw new BrowserControlError("profile_required", "Real-profile start requires a configured alias.");
					resolveConfiguredProfile(input.profile_alias);
				}
				dispose();
				const command = await sessions.start({ profileMode, profileAlias: input.profile_alias, extensionMode: input.extension_mode ?? "enabled", allowLocalhostTlsErrors: input.allow_localhost_tls_errors ?? false, downloadDirectory: input.download_directory === undefined ? undefined : path.resolve(ctx.cwd, input.download_directory), signal, timeoutMs: input.timeout_ms });
				state = loadBrowserState();
				if (!state) throw new BrowserControlError("state_missing", "Brave started without a complete ownership record.");
				await navigateInitial(input.url, signal, input.timeout_ms);
				return toolResult(command.stdout || "Browser session started.", { state: publicState(state) });
			}

			if (input.action === "attach") {
				if (input.allow_localhost_tls_errors) throw new BrowserControlError("tls_exception_scope", "The localhost TLS exception applies only when starting a new isolated session; attach does not change browser certificate behavior.");
				if (input.profile_mode !== undefined && input.profile_mode !== "real") throw new BrowserControlError("profile_mode_invalid", "Attach requires profile_mode real or no profile_mode.");
				if (!input.profile_alias) throw new BrowserControlError("profile_required", "Attach requires a configured real-profile alias.");
				dispose();
				const command = await sessions.attach({ profileAlias: input.profile_alias, cdpPort: input.cdp_port, extensionMode: input.extension_mode ?? "enabled", signal, timeoutMs: input.timeout_ms });
				state = loadBrowserState();
				if (!state) throw new BrowserControlError("state_missing", "Brave attached without a complete session record.");
				await navigateInitial(input.url, signal, input.timeout_ms);
				return toolResult(command.stdout || "Attached to the operator-launched Brave browser.", { state: publicState(state) });
			}

			if (input.action === "restart") {
				state = loadBrowserState();
				if (!state) throw new BrowserControlError("session_required", "Restart requires a current browser session.");
				if (state.sessionMode === "attached") throw new BrowserControlError("restart_not_supported", "Attached browsers are preserved and cannot be restarted by Pi.");
				if (state.profileMode === "real" && input.restart_authorization !== restartAuthorization(state)) throw new BrowserControlError("authorization_required", "Real-profile restart requires current authorization bound to the resolved profile and occupied process tuple.");
				const prior = state;
				dispose();
				const stopped = await sessions.stop(signal);
				const outcome = parseSessionStatus(stopped.stdout).outcome;
				if (outcome !== "stopped" && outcome !== "already_absent") throw new BrowserControlError("restart_not_safe", `Restart stopped before relaunch because close-owned reported ${outcome ?? "no proven outcome"}.`);
				const profileAlias = prior.profileAlias ?? input.profile_alias;
				if (prior.profileMode === "real" && profileAlias) resolveConfiguredProfile(profileAlias);
				const started = await sessions.start({ profileMode: prior.profileMode, profileAlias, extensionMode: input.extension_mode ?? prior.extensionMode, downloadDirectory: prior.downloadDirectory, signal, timeoutMs: input.timeout_ms });
				state = loadBrowserState();
				if (!state) throw new BrowserControlError("state_missing", "Brave restarted without a complete ownership record.");
				await navigateInitial(input.url, signal, input.timeout_ms);
				return toolResult(started.stdout || "Browser session restarted.", { state: publicState(state) });
			}

			state = loadBrowserState();
			if (!state) return toolResult("close-owned: already_absent", { state: publicState(undefined), status: { outcome: "already_absent" } });
			dispose();
			const command = await sessions.stop(signal);
			const status = parseSessionStatus(command.stdout);
			state = loadBrowserState();
			return toolResult(command.stdout || "Browser stop completed.", { state: publicState(state), status });
		},
	});

	pi.registerTool({
		name: "browser_page",
		label: "Browser Page",
		description: "Operate on exact session/target/frame IDs. Open creates a tab; navigate, reload, back and forward reuse it. Wait for a visible selector or text (default 5 seconds). Snapshot first; use its current ref or unique selector for click, fill, check, uncheck and select_option. Scroll by delta or into_view with a selector. Dialog inspects pending JavaScript dialogs; responding requires their ID. Diagnostics starts a bounded tab-local warning/error summary. Downloads starts tab-local observation of native downloads in a session started with download_directory. Fill takes value or a locally bound secret_ref. Press sends key chords; paste preserves tabs/newlines. Upload assigns local files to a file-input selector. Screenshots are raw captures. No network interception, arbitrary evaluation, cookies, storage, CAPTCHA completion or security-warning bypass.",
		promptSnippet: "Use one exact session ID and raw CDP target ID for bounded page actions",
		parameters: PageParameters,
		outputSchema: BrowserResultSchema,
		async execute(_id, rawParams, signal, _onUpdate, ctx) {
			const input = rawParams as PageInput;
			if (input.timeout_ms !== undefined && input.action !== "wait") signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(input.timeout_ms)]) : AbortSignal.timeout(input.timeout_ms);
			state = loadBrowserState();
			if (!state || input.session_id !== state.sessionId) throw new BrowserControlError("session_mismatch", "The supplied session ID is not the current ownership-verified session.");
			try {
				if (input.action === "list") {
					const targets = (await pages.list(state, signal, input.timeout_ms)).map((target) => ({ id: target.id, url: safeUrl(target.url), type: target.type }));
					return toolResult(JSON.stringify({ targets }, null, 2), { targets, count: targets.length, state: publicState(state) });
				}
				if (input.action === "open") {
					if (!input.url) throw new BrowserControlError("url_required", "Open requires a URL.");
					const target = await pages.open(state, input.url, signal, input.timeout_ms);
					state = { ...state, targetId: target.id };
					await saveBrowserState(state);
					return toolResult(JSON.stringify({ targetId: target.id, url: safeUrl(target.url) }), { state: publicState(state), targetId: target.id, url: safeUrl(target.url) });
				}
				const targetId = requireTarget(input);
				if (input.action === "navigate" || input.action === "reload" || input.action === "back" || input.action === "forward") {
					await pages.navigate(state, targetId, input.action, input.url, signal, input.timeout_ms);
					return toolResult(`Requested ${input.action} on target ${targetId}. Wait for the required condition if the page is still loading.`, { state: publicState(state), targetId });
				}
				if (input.action === "wait") {
					await pages.wait(state, targetId, { selector: input.selector, text: input.text, frame_id: input.frame_id }, signal, input.timeout_ms);
					return toolResult(`Observed the requested condition on target ${targetId}.`, { state: publicState(state), targetId });
				}
				if (input.action === "downloads") {
					const downloads = await pages.downloads(state, targetId, signal, input.timeout_ms);
					return toolResult(`Native downloads observed on target ${targetId} since first downloads call: ${JSON.stringify(downloads)}`, { state: publicState(state), targetId, downloads });
				}
				if (input.action === "diagnostics") {
					const diagnostics = await pages.diagnostics(state, targetId, signal, input.timeout_ms);
					return toolResult(`Diagnostic summary for target ${targetId} (from first diagnostics call): ${JSON.stringify(diagnostics)}`, { state: publicState(state), targetId, diagnostics });
				}
				if (input.action === "dialog") {
					const dialog = await pages.dialog(state, targetId, input.dialog_decision, input.dialog_id, input.text, signal, input.timeout_ms);
					return toolResult(input.dialog_decision ? `Sent ${input.dialog_decision} for the ${dialog.type} dialog.` : `Open ${dialog.type} dialog. Use its ID to respond explicitly: ${dialog.id}\nUntrusted dialog text: ${JSON.stringify(dialog.message)}`, { state: publicState(state), targetId, dialog });
				}
				if (input.action === "check" || input.action === "uncheck" || input.action === "select_option") {
					if ((input.selector === undefined) === (input.ref === undefined) || (input.action === "select_option" && input.value === undefined)) throw new BrowserControlError("control_required", "Provide one selector or ref; select_option also requires a value.");
					const result = await pages.form(state, targetId, input.selector, input.action, input.value, input.option_by, signal, input.frame_id, input.timeout_ms, input.ref);
					return toolResult(`Verified ${input.action} on target ${targetId}.`, { state: publicState(state), targetId, visible: result.visible });
				}
				if (input.action === "select") {
					await pages.select(state, targetId, signal, input.timeout_ms);
					state = { ...state, targetId };
					await saveBrowserState(state);
					return toolResult(`Selected raw CDP target ${targetId}.`, { state: publicState(state) });
				}
				if (input.action === "snapshot") {
					const { text: snapshot, frames } = await pages.snapshot(state, targetId, signal, input.frame_id, input.selector, input.timeout_ms);
					const text = `${redactOutput(snapshot)}\nExact frames: ${JSON.stringify(frames)}`;
					return toolResult(text, { state: publicState(state), targetId, snapshot: text, frames });
				}
				if (input.action === "scroll") {
					const scroll = await pages.scroll(state, targetId, { scroll_mode: input.scroll_mode, selector: input.selector, delta_x: input.delta_x, delta_y: input.delta_y, frame_id: input.frame_id }, signal, input.timeout_ms);
					return toolResult(`${JSON.stringify(scroll)}\nScroll reports actual viewport movement only. Snapshot this exact target/frame again to observe content; virtualized content may remain unread.`, { state: publicState(state), targetId, scroll });
				}
				if (input.action === "screenshot") {
					if (!input.output_path) throw new BrowserControlError("output_required", "Screenshot requires an output path.");
					const outputPath = path.resolve(ctx.cwd, input.output_path);
					const source = await pages.screenshot(state, targetId, outputPath, signal, input.timeout_ms);
					const observation = { ...source, source: "browser" as const, trust: "untrusted" as const, kind: "image" as const, classification: source.classification as "public" | "private", screening: "not-screened" as const };
					return toolResult(`Screenshot saved to ${redactOutput(outputPath)}. Untrusted browser image; origin=${source.origin}; classification=${source.classification}; visual screening not performed.`, { state: publicState(state), targetId, observation });
				}
				if (input.action === "click") {
					if ((input.selector === undefined) === (input.ref === undefined)) throw new BrowserControlError("selector_required", "Click requires one selector or ref.");
					const result = await pages.click(state, targetId, input.selector, signal, input.frame_id, input.timeout_ms, ...(input.ref === undefined ? [] : [input.ref] as const));
					return toolResult(`Clicked the control on target ${targetId}.`, { state: publicState(state), targetId, visible: result.visible });
				}
				if (input.action === "fill") {
					if ((input.selector === undefined) === (input.ref === undefined) || (input.value === undefined) === (input.secret_ref === undefined)) throw new BrowserControlError("value_required", "Fill requires one selector or ref and exactly one value or secret_ref.");
					const result = await pages.fill(state, targetId, input.selector, { value: input.value, secret_ref: input.secret_ref, frame_id: input.frame_id, ...(input.ref === undefined ? {} : { ref: input.ref }) }, signal, input.timeout_ms);
					return toolResult(`Filled the control on target ${targetId}.${result.visible ? "" : " Warning: the acted-on control was not rendered; snapshot this exact frame to inspect the outcome."}`, { state: publicState(state), targetId, visible: result.visible });
				}
				if (input.action === "press") {
					if (!input.key) throw new BrowserControlError("key_required", "Press requires a key or chord.");
					await pages.press(state, targetId, input.key, signal, input.frame_id, input.selector, input.timeout_ms);
					return toolResult(`Pressed ${JSON.stringify(input.key)} on target ${targetId}.`, { state: publicState(state), targetId });
				}
				if (input.action === "paste") {
					if (input.value === undefined) throw new BrowserControlError("value_required", "Paste requires value text.");
					await pages.paste(state, targetId, input.value, signal, input.frame_id, input.selector, input.timeout_ms);
					return toolResult(`Pasted text on target ${targetId}.`, { state: publicState(state), targetId });
				}
				if (input.action === "upload") {
					if (!input.selector || input.files === undefined) throw new BrowserControlError("files_required", "Upload requires a file-input selector and files array.");
					await pages.upload(state, targetId, input.selector, input.files.map(file => path.resolve(ctx.cwd, file)), signal, input.frame_id, input.timeout_ms);
					return toolResult(`Assigned ${input.files.length} file(s) on target ${targetId}.`, { state: publicState(state), targetId });
				}
				await pages.close(state, targetId, signal, input.timeout_ms);
				if (state.targetId === targetId) state = { ...state, targetId: undefined };
				await saveBrowserState(state);
				return toolResult(`Closed raw CDP target ${targetId}.`, { state: publicState(state), targetId });
			} catch (error) { throw error; }
		},
	});

	pi.on("session_shutdown", async () => {
		dispose();
		state = loadBrowserState();
		if (state?.profileMode !== "isolated") return;
		await sessions.stop();
	});
}

export { parseSetupArgs, publicState, safeUrl };
