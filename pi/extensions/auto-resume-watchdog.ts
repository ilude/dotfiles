/**
 * Pi Auto Resume Watchdog
 *
 * Feasibility decision: extension-observe-only.
 * Evidence: Pi extension events expose lifecycle/activity signals
 * (`before_agent_start`, `agent_start`, `turn_start/end`, `message_update`,
 * `tool_execution_start/update/end`, `after_provider_response`, `agent_end`) and
 * `pi.sendUserMessage()`, but the public ExtensionAPI has no transport-level
 * WebSocket error event. The safe extension-level release therefore observes
 * likely idle stalls and offers `/resume-safe`; bounded auto mode is available
 * only when explicitly enabled and still sends a guarded continuation prompt.
 *
 * Defaults: mode `observe-only`, stale threshold `90s`, cooldown `5m`, max
 * auto-resumes `1 per user prompt` and `3 per session`. The watchdog never
 * replays tools; every continuation says to verify the last tool/file operation
 * before repeating it. Disable/rollback: set mode `disabled` or remove this
 * extension, reload Pi, and verify no watchdog status or notifications remain.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type ExtensionAPI, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { uiNotify } from "../lib/extension-utils.js";
import { getUserSettingsPath, invalidateSettingsCache, readMergedSettings } from "../lib/settings-loader.js";

export type WatchdogMode = "disabled" | "observe-only" | "auto";
export type WatchdogActivityKind =
	| "agent_start"
	| "agent_end"
	| "turn_start"
	| "turn_end"
	| "message_update"
	| "tool_start"
	| "tool_update"
	| "tool_end"
	| "provider_response"
	| "user_steering";

export interface WatchdogConfig {
	mode: WatchdogMode;
	staleMs: number;
	cooldownMs: number;
	maxAutoResumesPerPrompt: number;
	maxAutoResumesPerSession: number;
	now: () => number;
}

export interface WatchdogState {
	active: boolean;
	lastActivityAt: number;
	lastToolName?: string;
	lastToolCallId?: string;
	inTool: boolean;
	currentPromptId: number;
	autoResumesThisPrompt: number;
	autoResumesThisSession: number;
	lastResumeAt: number;
	lastDetectionAt: number;
	builtInAutoRetryActive: boolean;
	userSteeringActive: boolean;
}

export const GUARDED_CONTINUATION_PROMPT =
	"Continue after the transient interruption. First verify whether the last tool/file operation completed before repeating it. Do not repeat irreversible operations without verification.";

export const DEFAULT_WATCHDOG_CONFIG: WatchdogConfig = {
	mode: "observe-only",
	staleMs: 90_000,
	cooldownMs: 5 * 60_000,
	maxAutoResumesPerPrompt: 1,
	maxAutoResumesPerSession: 3,
	now: () => Date.now(),
};

export function createInitialWatchdogState(now = Date.now()): WatchdogState {
	return {
		active: false,
		lastActivityAt: now,
		inTool: false,
		currentPromptId: 0,
		autoResumesThisPrompt: 0,
		autoResumesThisSession: 0,
		lastResumeAt: -Infinity,
		lastDetectionAt: -Infinity,
		builtInAutoRetryActive: false,
		userSteeringActive: false,
	};
}

export function recordWatchdogActivity(
	state: WatchdogState,
	kind: WatchdogActivityKind,
	now: number,
	tool?: { name?: string; id?: string },
): WatchdogState {
	state.lastActivityAt = now;
	if (kind === "agent_start") {
		state.active = true;
		state.currentPromptId += 1;
		state.autoResumesThisPrompt = 0;
		state.userSteeringActive = false;
	}
	if (kind === "agent_end") {
		state.active = false;
		state.inTool = false;
		state.userSteeringActive = false;
	}
	if (kind === "tool_start" || kind === "tool_update") {
		state.inTool = true;
		state.lastToolName = tool?.name ?? state.lastToolName;
		state.lastToolCallId = tool?.id ?? state.lastToolCallId;
	}
	if (kind === "tool_end") state.inTool = false;
	if (kind === "user_steering") state.userSteeringActive = true;
	return state;
}

export function setBuiltInAutoRetryActive(state: WatchdogState, active: boolean): WatchdogState {
	state.builtInAutoRetryActive = active;
	return state;
}

export interface WatchdogDecision {
	action: "none" | "notify" | "resume";
	reason: string;
	prompt?: string;
}

export function evaluateWatchdog(state: WatchdogState, config: WatchdogConfig): WatchdogDecision {
	const now = config.now();
	if (config.mode === "disabled") return { action: "none", reason: "disabled" };
	if (!state.active) return { action: "none", reason: "no active agent run" };
	if (state.inTool) return { action: "none", reason: "tool still running" };
	if (state.userSteeringActive) return { action: "none", reason: "user steering/follow-up active" };
	if (state.builtInAutoRetryActive) return { action: "none", reason: "auto_retry active" };
	if (now - state.lastActivityAt < config.staleMs) return { action: "none", reason: "not stale" };
	if (now - state.lastResumeAt < config.cooldownMs) return { action: "notify", reason: "cooldown" };
	state.lastDetectionAt = now;
	if (config.mode === "observe-only") return { action: "notify", reason: "observe-only stale run detected" };
	if (state.autoResumesThisPrompt >= config.maxAutoResumesPerPrompt) return { action: "notify", reason: "max auto-resumes per prompt reached" };
	if (state.autoResumesThisSession >= config.maxAutoResumesPerSession) return { action: "notify", reason: "max auto-resumes per session reached" };
	state.autoResumesThisPrompt += 1;
	state.autoResumesThisSession += 1;
	state.lastResumeAt = now;
	return { action: "resume", reason: "guarded auto resume", prompt: GUARDED_CONTINUATION_PROMPT };
}

function isWatchdogMode(value: unknown): value is WatchdogMode {
	return value === "disabled" || value === "observe-only" || value === "auto";
}

function readSettingsMode(): WatchdogMode | undefined {
	const raw = readMergedSettings().autoResumeWatchdog;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const mode = (raw as Record<string, unknown>).mode;
	return isWatchdogMode(mode) ? mode : undefined;
}

function readConfig(): WatchdogConfig {
	const envMode = process.env.PI_AUTO_RESUME_WATCHDOG_MODE;
	const mode = isWatchdogMode(envMode) ? envMode : (readSettingsMode() ?? DEFAULT_WATCHDOG_CONFIG.mode);
	return { ...DEFAULT_WATCHDOG_CONFIG, mode };
}

function writeSettingsMode(mode: WatchdogMode): void {
	const settingsPath = getUserSettingsPath();
	let settings: Record<string, unknown> = {};
	try {
		if (fs.existsSync(settingsPath)) settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
	} catch {
		settings = {};
	}
	const current = settings.autoResumeWatchdog;
	const autoResumeWatchdog = current && typeof current === "object" && !Array.isArray(current)
		? { ...(current as Record<string, unknown>), mode }
		: { mode };
	settings.autoResumeWatchdog = autoResumeWatchdog;
	fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
	fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
	invalidateSettingsCache();
}

function nextToggleMode(mode: WatchdogMode): WatchdogMode {
	return mode === "disabled" ? "observe-only" : "disabled";
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" = "warning") {
	uiNotify(ctx as any, level, message, { prefix: "auto-resume-watchdog" });
}

export default function (pi: ExtensionAPI) {
	let config = readConfig();
	const state = createInitialWatchdogState(config.now());
	let timer: NodeJS.Timeout | undefined;
	let lastCtx: ExtensionContext | undefined;

	const applyStatus = (ctx: ExtensionContext) => {
		ctx.ui.setStatus("watchdog", config.mode === "disabled" ? undefined : `watchdog ${config.mode}`);
	};

	const setMode = (mode: WatchdogMode, ctx: ExtensionContext) => {
		config = { ...config, mode };
		writeSettingsMode(mode);
		applyStatus(ctx);
		notify(ctx, `Watchdog mode set to ${mode}.`, "info");
	};

	const tick = () => {
		if (!lastCtx) return;
		config = readConfig();
		applyStatus(lastCtx);
		const decision = evaluateWatchdog(state, config);
		if (decision.action === "notify") {
			notify(lastCtx, `Likely stalled agent run detected (${decision.reason}). Use /resume-safe to continue safely.`);
		}
		if (decision.action === "resume" && decision.prompt) {
			notify(lastCtx, `Likely stalled agent run detected; sending one guarded continuation (${decision.reason}).`, "info");
			pi.sendUserMessage(decision.prompt, { deliverAs: "followUp" });
		}
	};

	pi.on("session_start", (_event, ctx) => {
		lastCtx = ctx;
		config = readConfig();
		applyStatus(ctx);
		if (!timer) timer = setInterval(tick, 10_000);
	});
	pi.on("session_shutdown", () => {
		if (timer) clearInterval(timer);
		timer = undefined;
	});
	pi.on("agent_start", (_event, ctx) => { lastCtx = ctx; recordWatchdogActivity(state, "agent_start", config.now()); });
	pi.on("agent_end", (_event, ctx) => { lastCtx = ctx; recordWatchdogActivity(state, "agent_end", config.now()); });
	pi.on("turn_start", (_event, ctx) => { lastCtx = ctx; recordWatchdogActivity(state, "turn_start", config.now()); });
	pi.on("turn_end", (_event, ctx) => { lastCtx = ctx; recordWatchdogActivity(state, "turn_end", config.now()); });
	pi.on("message_update", (_event, ctx) => { lastCtx = ctx; recordWatchdogActivity(state, "message_update", config.now()); });
	pi.on("after_provider_response", (_event, ctx) => { lastCtx = ctx; recordWatchdogActivity(state, "provider_response", config.now()); });
	pi.on("tool_execution_start", (event, ctx) => { lastCtx = ctx; recordWatchdogActivity(state, "tool_start", config.now(), { name: event.toolName, id: event.toolCallId }); });
	pi.on("tool_execution_update", (event, ctx) => { lastCtx = ctx; recordWatchdogActivity(state, "tool_update", config.now(), { name: event.toolName, id: event.toolCallId }); });
	pi.on("tool_execution_end", (event, ctx) => { lastCtx = ctx; recordWatchdogActivity(state, "tool_end", config.now(), { name: event.toolName, id: event.toolCallId }); });
	pi.on("input", (event) => {
		if (event.source === "extension") recordWatchdogActivity(state, "user_steering", config.now());
		return { action: "continue" };
	});

	pi.registerShortcut("alt+w", {
		description: "Toggle auto-resume watchdog between disabled and observe-only.",
		handler: (ctx) => {
			lastCtx = ctx;
			config = readConfig();
			setMode(nextToggleMode(config.mode), ctx);
		},
	});

	pi.registerCommand("watchdog-toggle", {
		description: "Toggle auto-resume watchdog between disabled and observe-only and persist it to pi/settings.json.",
		handler: async (_args, ctx) => {
			lastCtx = ctx;
			config = readConfig();
			setMode(nextToggleMode(config.mode), ctx);
		},
	});

	pi.registerCommand("resume-safe", {
		description: "Send a guarded continuation after a suspected transient interruption.",
		handler: async (_args, ctx) => {
			lastCtx = ctx;
			notify(ctx, "Sending guarded continuation. The agent must verify the last operation before repeating it.", "info");
			pi.sendUserMessage(GUARDED_CONTINUATION_PROMPT, { deliverAs: "followUp" });
		},
	});
}
