import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { reportActionableExtensionFailure } from "../lib/extension-diagnostics.js";
import { onSessionStart } from "../lib/session-start-metrics.js";
import {
	BrowserControlError,
	BrowserPageProtocol,
	BrowserSessionProtocol,
	discoverBraveProfiles,
	getBrowserConfigPath,
	invalidateComparison,
	loadBrowserState,
	parseSessionStatus,
	readBrowserConfig,
	redactOutput,
	resolveConfiguredProfile,
	restartAuthorization,
	saveBrowserState,
	writeBrowserConfig,
	createPiBrowserExecutor,
	type BrowserProfileConfig,
	type BrowserSessionState,
	type ExtensionMode,
	type PageAction,
	type ProfileMode,
	type SessionAction,
} from "../lib/browser-control.js";

const SESSION_ACTIONS = ["discover", "status", "start", "restart", "stop"] as const;
const PAGE_ACTIONS = ["list", "open", "select", "snapshot", "screenshot", "click", "fill", "close"] as const;

const SessionParameters = Type.Object({
	action: StringEnum(SESSION_ACTIONS),
	profile_mode: Type.Optional(StringEnum(["isolated", "real"] as const)),
	profile_alias: Type.Optional(Type.String()),
	extension_mode: Type.Optional(StringEnum(["enabled", "disabled"] as const)),
	restart_authorization: Type.Optional(Type.String()),
	url: Type.Optional(Type.String()),
});

const PageParameters = Type.Object({
	action: StringEnum(PAGE_ACTIONS),
	session_id: Type.String(),
	target_id: Type.Optional(Type.String()),
	url: Type.Optional(Type.String()),
	selector: Type.Optional(Type.String()),
	value: Type.Optional(Type.String()),
	output_path: Type.Optional(Type.String()),
});

type SessionInput = {
	action: SessionAction;
	profile_mode?: ProfileMode;
	profile_alias?: string;
	extension_mode?: ExtensionMode;
	restart_authorization?: string;
	url?: string;
};

type PageInput = {
	action: PageAction;
	session_id: string;
	target_id?: string;
	url?: string;
	selector?: string;
	value?: string;
	output_path?: string;
};

function toolResult(text: string, details: Record<string, unknown> = {}) {
	return { content: [{ type: "text" as const, text: redactOutput(text) }], details };
}

function safeUrl(value: string): string {
	try {
		const url = new URL(value);
		return `${url.origin}${url.pathname}`;
	} catch {
		return value === "about:blank" ? value : "<invalid-url>";
	}
}

function publicState(state: BrowserSessionState | undefined): Record<string, unknown> {
	if (!state) return { session: "absent" };
	return {
		sessionId: state.sessionId,
		profileMode: state.profileMode,
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
	const sessions = new BrowserSessionProtocol(createPiBrowserExecutor(pi));
	const pages = new BrowserPageProtocol();
	let state: BrowserSessionState | undefined;

	const restore = (_ctx: ExtensionContext) => {
		state = loadBrowserState();
	};
	onSessionStart(pi, import.meta.url, (_event, ctx) => restore(ctx));

	pi.registerCommand("browser-setup", {
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
				reportActionableExtensionFailure(pi, ctx, {
					extension: "browser-control",
					failure: message,
					nextAction: "Inspect the Brave profile configuration before retrying browser setup.",
				});
			}
		},
	});

	pi.registerTool({
		name: "browser_session",
		label: "Browser Session",
		description: "Discover, inspect, start, restart, or stop one ownership-verified Brave session. Real-profile restart requires current tuple-bound authorization.",
		promptSnippet: "Control one profile-aware Brave session without guessing or broad process termination",
		parameters: SessionParameters,
		async execute(_id, rawParams, signal) {
			const input = rawParams as SessionInput;
			if (input.action === "discover") {
				const config = readBrowserConfig();
				const candidates = discoverBraveProfiles().map((candidate) => ({
					userDataDir: redactOutput(candidate.userDataDir),
					profileDirectory: candidate.profileDirectory,
					displayName: candidate.displayName,
					configuredAliases: Object.entries(config.profiles).filter(([, profile]) => profile.profileDirectory === candidate.profileDirectory && (!profile.userDataDir || path.resolve(profile.userDataDir) === candidate.userDataDir)).map(([alias]) => alias),
				}));
				return toolResult(`${JSON.stringify({ candidates }, null, 2)}\nUse /browser-setup with one exact candidate; no profile is guessed.`, { candidateCount: candidates.length });
			}

			if (input.action === "status") {
				const command = await sessions.status(signal);
				state = loadBrowserState();
				return toolResult(command.stdout || "Browser session is absent.", { state: publicState(state), status: parseSessionStatus(command.stdout) });
			}

			if (input.action === "start") {
				if (state) throw new BrowserControlError("session_occupied", "One browser session is already registered; inspect or stop it first.");
				const profileMode = input.profile_mode ?? "isolated";
				if (profileMode === "real") {
					if (!input.profile_alias) throw new BrowserControlError("profile_required", "Real-profile start requires a configured alias.");
					resolveConfiguredProfile(input.profile_alias);
				}
				const command = await sessions.start({ profileMode, profileAlias: input.profile_alias, extensionMode: input.extension_mode ?? "enabled", url: input.url, signal });
				state = loadBrowserState();
				if (!state) throw new BrowserControlError("state_missing", "Brave started without a complete ownership record.");
				return toolResult(command.stdout || "Browser session started.", { state: publicState(state) });
			}

			if (input.action === "restart") {
				state = loadBrowserState();
				if (!state) throw new BrowserControlError("session_required", "Restart requires a current browser session.");
				if (state.profileMode === "real" && input.restart_authorization !== restartAuthorization(state)) throw new BrowserControlError("authorization_required", "Real-profile restart requires current authorization bound to the resolved profile and occupied process tuple.");
				const prior = state;
				const stopped = await sessions.stop(signal);
				const outcome = parseSessionStatus(stopped.stdout).outcome;
				if (outcome !== "stopped" && outcome !== "already_absent") throw new BrowserControlError("restart_not_safe", `Restart stopped before relaunch because close-owned reported ${outcome ?? "no proven outcome"}.`);
				const profileAlias = prior.profileAlias ?? input.profile_alias;
				if (prior.profileMode === "real" && profileAlias) resolveConfiguredProfile(profileAlias);
				const started = await sessions.start({ profileMode: prior.profileMode, profileAlias, extensionMode: input.extension_mode ?? prior.extensionMode, url: input.url, signal });
				state = loadBrowserState();
				if (!state) throw new BrowserControlError("state_missing", "Brave restarted without a complete ownership record.");
				return toolResult(started.stdout || "Browser session restarted.", { state: publicState(state) });
			}

			state = loadBrowserState();
			if (!state) return toolResult("close-owned: already_absent", { state: publicState(undefined), status: { outcome: "already_absent" } });
			const command = await sessions.stop(signal);
			const status = parseSessionStatus(command.stdout);
			state = loadBrowserState();
			return toolResult(command.stdout || "Browser stop completed.", { state: publicState(state), status });
		},
	});

	pi.registerTool({
		name: "browser_page",
		label: "Browser Page",
		description: "Operate on exact raw CDP page targets. Credential, CAPTCHA, cookie, storage, and arbitrary evaluation surfaces are unavailable.",
		promptSnippet: "Use one exact session ID and raw CDP target ID for bounded page actions",
		parameters: PageParameters,
		async execute(_id, rawParams, signal, _onUpdate, ctx) {
			const input = rawParams as PageInput;
			state = loadBrowserState();
			if (!state || input.session_id !== state.sessionId) throw new BrowserControlError("session_mismatch", "The supplied session ID is not the current ownership-verified session.");
			try {
				if (input.action === "list") {
					const targets = (await pages.list(state)).map((target) => ({ id: target.id, url: safeUrl(target.url), type: target.type }));
					return toolResult(JSON.stringify({ targets }, null, 2), { count: targets.length, state: publicState(state) });
				}
				if (input.action === "open") {
					if (!input.url) throw new BrowserControlError("url_required", "Open requires a URL.");
					const target = await pages.open(state, input.url, signal);
					state = { ...state, targetId: target.id };
					await saveBrowserState(state);
					return toolResult(JSON.stringify({ targetId: target.id, url: safeUrl(target.url) }), { state: publicState(state) });
				}
				const targetId = requireTarget(input);
				if (input.action === "select") {
					await pages.select(state, targetId, signal);
					state = { ...state, targetId };
					await saveBrowserState(state);
					return toolResult(`Selected raw CDP target ${targetId}.`, { state: publicState(state) });
				}
				if (input.action === "snapshot") return toolResult(await pages.snapshot(state, targetId, signal), { state: publicState(state), targetId });
				if (input.action === "screenshot") {
					if (!input.output_path) throw new BrowserControlError("output_required", "Screenshot requires an output path.");
					const outputPath = path.resolve(ctx.cwd, input.output_path);
					await pages.screenshot(state, targetId, outputPath, signal);
					return toolResult(`Screenshot saved to ${redactOutput(outputPath)}.`, { state: publicState(state), targetId });
				}
				if (input.action === "click") {
					if (!input.selector) throw new BrowserControlError("selector_required", "Click requires a CSS selector.");
					await pages.click(state, targetId, input.selector, signal);
					return toolResult(`Clicked selector on target ${targetId}.`, { state: publicState(state), targetId });
				}
				if (input.action === "fill") {
					if (!input.selector || input.value === undefined) throw new BrowserControlError("value_required", "Fill requires a CSS selector and value.");
					await pages.fill(state, targetId, input.selector, input.value, signal);
					return toolResult(`Filled selector on target ${targetId}.`, { state: publicState(state), targetId });
				}
				await pages.close(state, targetId, signal);
				if (state.targetId === targetId) state = { ...state, targetId: undefined };
				await saveBrowserState(state);
				return toolResult(`Closed raw CDP target ${targetId}.`, { state: publicState(state), targetId });
			} catch (error) {
				if (error instanceof BrowserControlError && error.code === "protected_surface") {
					state = invalidateComparison(state, error.message);
					await saveBrowserState(state);
				}
				throw error;
			}
		},
	});

	pi.on("session_shutdown", async () => {
		state = loadBrowserState();
		if (state?.profileMode !== "isolated") return;
		await sessions.stop();
	});
}

export { parseSetupArgs, publicState, safeUrl };
