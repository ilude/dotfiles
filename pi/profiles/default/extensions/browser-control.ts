import path from "node:path";
import fs from "node:fs";
import { getAgentDir } from "../lib/settings-file.js";
import { browserPolicyIdentity, browserPolicyLease, requestBrowserPolicy, requestBrowserLocalFilePolicy, samePolicyIdentity, type PolicyIdentity } from "../lib/browser-effect-contract.js";
import { browserCredentialConfigPath, parseBrowserCredentialConfig, createBrowserCredentialResolver, type BrowserCredentialConfig } from "../lib/browser-credentials.js";
import { createBrowserObservationHooks } from "../lib/browser-observations.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import { registerProfileCommand } from "../lib/profile-command.ts";
import {
	BrowserControlError,
	BrowserPageProtocol,
	BrowserSessionProtocol,
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
const PAGE_ACTIONS = ["list", "open", "select", "snapshot", "scroll", "screenshot", "click", "fill", "close"] as const;

const SessionParameters = Type.Object({
	action: StringEnum(SESSION_ACTIONS),
	timeout_ms: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 300_000, description: "Optional overall call deadline and CDP timeout in milliseconds; CDP commands default to 30000. Policy deadlines remain separate." })),
	profile_mode: Type.Optional(StringEnum(["isolated", "real"] as const)),
	profile_alias: Type.Optional(Type.String()),
	cdp_port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535 })),
	extension_mode: Type.Optional(StringEnum(["enabled", "disabled"] as const)),
	allow_localhost_tls_errors: Type.Optional(Type.Boolean({ description: "Owned isolated start only: allow certificate errors for localhost by using Chromium's localhost-only exception. Never enables bypass for remote hosts." })),
	restart_authorization: Type.Optional(Type.String()),
	url: Type.Optional(Type.String()),
});

const PageParameters = Type.Object({
	action: StringEnum(PAGE_ACTIONS),
	timeout_ms: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 300_000, description: "Optional overall call deadline and CDP timeout in milliseconds; CDP commands default to 30000. Policy deadlines remain separate." })),
	session_id: Type.String(),
	target_id: Type.Optional(Type.String()),
	url: Type.Optional(Type.String()),
	selector: Type.Optional(Type.String({ description: "Unique exact-frame CSS selector. Optional subtree root for snapshot or container for scroll by; required for click/fill and scroll into_view. Scroll selectors are limited to 2000 characters." })),
	scroll_mode: Type.Optional(StringEnum(["by", "into_view"] as const, { description: "Scroll only: by (default) moves document or selected container by deltas; into_view moves a selected element's ancestors within this exact frame, at most 16 containers and 2000 pixels per axis each. Re-snapshot after scrolling." })),
	delta_x: Type.Optional(Type.Integer({ minimum: -2000, maximum: 2000, description: "Scroll by only: horizontal pixels. At least one delta must be nonzero." })),
	delta_y: Type.Optional(Type.Integer({ minimum: -2000, maximum: 2000, description: "Scroll by only: vertical pixels. into_view takes no deltas." })),
	value: Type.Optional(Type.String()),
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
	secret_ref?: string;
	frame_id?: string;
	output_path?: string;
};

function toolResult(text: string, details: Static<typeof BrowserResultSchema> = {}) {
	const structuredContent = { ...details };
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
	requestFailures: Type.Optional(Type.Array(Type.Object({
		phase: StringEnum(["navigation", "intercepted"] as const),
		stage: StringEnum(["safety", "identity", "destination", "frame", "source", "projection", "classification", "policy", "postcheck", "dispatch"] as const),
		code: Type.String(), cancellation: StringEnum(["none", "policy-disposed", "target-disconnected", "caller-aborted", "deadline"] as const),
	}, { additionalProperties: false }), { maxItems: 8 })),
	snapshot: Type.Optional(Type.String()),
	visible: Type.Optional(Type.Boolean()),
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
	let credentialIdentity: PolicyIdentity | undefined;
	let credentialConfig: BrowserCredentialConfig | undefined;
	let credentialLifetime = new AbortController();
	const identity = () => {
		const current = browserPolicyIdentity(pi.events);
		if (!current) throw new BrowserControlError("policy_unavailable", "Damage Control browser policy is unavailable; enable it before this action.");
		return current;
	};
	const pages = new BrowserPageProtocol({
		runtime: sessions, identity,
		lease: () => { const lease = browserPolicyLease(pi.events); if (!lease) throw new BrowserControlError("policy_unavailable", "Browser policy lifetime is unavailable."); return lease; },
		policy: (effect, signal) => requestBrowserPolicy(pi.events, effect, signal),
		localFile: (nativePath, signal) => requestBrowserLocalFilePolicy(pi.events, identity(), nativePath, signal),
		credentialOrigins: reference => { const binding = credentialConfig?.bindings[reference]; return binding ? [...(binding.form_origins ?? binding.frame_origins ?? binding.origins)] : []; },
		resolveCredential: async (reference, target, signal) => {
			const current = identity(), lease = browserPolicyLease(pi.events);
			if (!lease || !samePolicyIdentity(current, lease.identity)) throw new BrowserControlError("credential_unavailable", "Browser credential lifetime expired.");
			if (!credentialIdentity || !samePolicyIdentity(current, credentialIdentity)) {
				credentials?.clear(); credentialLifetime.abort(); credentialLifetime = new AbortController(); credentials = undefined; credentialConfig = undefined;
				credentialIdentity = { ...current };
			}
			if (!credentials) {
				let config;
				try { config = parseBrowserCredentialConfig(JSON.parse(fs.readFileSync(browserCredentialConfigPath(getAgentDir()), "utf8"))); }
				catch { throw new Error("Browser credential configuration unavailable."); }
				credentialConfig = config;
				credentials = createBrowserCredentialResolver(config, (command, args, options) => pi.exec(command, args, options), AbortSignal.any([credentialLifetime.signal, lease.signal]));
			}
			return await credentials.resolve(reference, target, AbortSignal.any([signal, credentialLifetime.signal, lease.signal]));
		},
	});
	pages.setObservationHooks(createBrowserObservationHooks({ events: pi.events, identity, classify: source => pages.observationClass(source) }));
	let state: BrowserSessionState | undefined;
	const dispose = () => { pages.dispose(); credentials?.clear(); credentials = undefined; credentialConfig = undefined; credentialLifetime.abort(); credentialLifetime = new AbortController(); credentialIdentity = undefined; };
	pi.on("session_start", () => { dispose(); state = loadBrowserState(); });
	// CDP interception must not outlive the run and open approvals for idle page traffic.
	// Disposal disconnects tooling only; the browser and its tabs remain operator-owned.
	pi.on("agent_end", dispose);
	pi.on("session_before_switch", dispose);
	pi.on("session_tree", dispose);
	pi.on("input", event => { if ((event.source === "interactive" || event.source === "rpc") && !event.streamingBehavior) dispose(); });
	const navigateInitial = async (url: string | undefined, signal?: AbortSignal, timeoutMs?: number) => {
		if (!url || !state) return;
		try {
			const target = await pages.open(state, url, signal, timeoutMs); state = { ...state, targetId: target.id }; await saveBrowserState(state);
		} catch (error) { throw pages.diagnosticError(error); }
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
		async execute(_id, rawParams, signal) {
			const input = rawParams as SessionInput;
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
				const requestFailures = pages.diagnostics();
				return toolResult(`${command.stdout || "Browser session is absent."}${requestFailures.length ? `\nRecent browser request failures: ${JSON.stringify(requestFailures)}` : ""}`, { state: publicState(state), status: parseSessionStatus(command.stdout), requestFailures });
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
				const command = await sessions.start({ profileMode, profileAlias: input.profile_alias, extensionMode: input.extension_mode ?? "enabled", allowLocalhostTlsErrors: input.allow_localhost_tls_errors ?? false, signal, timeoutMs: input.timeout_ms });
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
				const started = await sessions.start({ profileMode: prior.profileMode, profileAlias, extensionMode: input.extension_mode ?? prior.extensionMode, signal, timeoutMs: input.timeout_ms });
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
		description: "Operate on exact session/target/frame IDs with task and destination policy. Snapshot first; use its unique selectors or focus a subtree with selector when truncated. Scroll with scroll_mode by (default), optional container selector and nonzero delta_x/delta_y (integer pixels, each -2000..2000), or into_view with required element selector and no deltas. Re-snapshot after scrolling, then act on current selector/state evidence; movement is not proof all virtualized content was read. Prefer state evidence over network-idle waits. Fill uses exactly one value or locally bound secret_ref. Actual CAPTCHA completion is manual; cookies, storage, arbitrary evaluation and security-warning bypass are unavailable.",
		promptSnippet: "Use one exact session ID and raw CDP target ID for bounded page actions",
		parameters: PageParameters,
		outputSchema: BrowserResultSchema,
		async execute(_id, rawParams, signal, _onUpdate, ctx) {
			const input = rawParams as PageInput;
			if (input.timeout_ms !== undefined) signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(input.timeout_ms)]) : AbortSignal.timeout(input.timeout_ms);
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
				if (input.action === "select") {
					await pages.select(state, targetId, signal, input.timeout_ms);
					state = { ...state, targetId };
					await saveBrowserState(state);
					return toolResult(`Selected raw CDP target ${targetId}.`, { state: publicState(state) });
				}
				if (input.action === "snapshot") {
					const snapshot = redactOutput(await pages.snapshot(state, targetId, signal, input.frame_id, input.selector, input.timeout_ms));
					const frames = await pages.frames(state, targetId, signal, input.timeout_ms);
					const text = `${snapshot}\nExact frames: ${JSON.stringify(frames)}`;
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
					const observation = { ...source, source: "browser" as const, trust: "untrusted" as const, kind: "image" as const, screening: "not-screened" as const };
					return toolResult(`Screenshot saved to ${redactOutput(outputPath)}. Untrusted browser image; origin=${source.origin}; classification=${source.classification}; visual screening not performed.`, { state: publicState(state), targetId, observation });
				}
				if (input.action === "click") {
					if (!input.selector) throw new BrowserControlError("selector_required", "Click requires a CSS selector.");
					const result = await pages.click(state, targetId, input.selector, signal, input.frame_id, input.timeout_ms);
					return toolResult(`Clicked selector on target ${targetId}.${result.visible ? "" : " Warning: the acted-on control was not rendered; snapshot this exact frame to inspect the outcome."}`, { state: publicState(state), targetId, visible: result.visible });
				}
				if (input.action === "fill") {
					if (!input.selector || (input.value === undefined) === (input.secret_ref === undefined)) throw new BrowserControlError("value_required", "Fill requires a selector and exactly one value or secret_ref.");
					const result = await pages.fill(state, targetId, input.selector, { value: input.value, secret_ref: input.secret_ref, frame_id: input.frame_id }, signal, input.timeout_ms);
					return toolResult(`Filled selector on target ${targetId}.${result.visible ? "" : " Warning: the acted-on control was not rendered; snapshot this exact frame to inspect the outcome."}`, { state: publicState(state), targetId, visible: result.visible });
				}
				await pages.close(state, targetId, signal, input.timeout_ms);
				if (state.targetId === targetId) state = { ...state, targetId: undefined };
				await saveBrowserState(state);
				return toolResult(`Closed raw CDP target ${targetId}.`, { state: publicState(state), targetId });
			} catch (error) { throw pages.diagnosticError(error); }
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
