import type {
	BashToolCallEvent,
	EditToolCallEvent,
	ExtensionAPI,
	ReadToolCallEvent,
	WriteToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import {
	type DamageControlHealth,
	getDamageControlHealth,
	publishDamageControlHealth,
} from "../lib/damage-control-health.js";
import { emitTerminalBell } from "../lib/extension-utils.js";
import { recordEvent } from "../lib/metrics.js";
import {
	type DecisionProvenance,
	recordDecision,
} from "../lib/permission-registry.js";
import {
	debugDecision,
	debugLog,
	redactSummary,
} from "./damage-control-debug.js";
import {
	canonicalizeOrBlock,
	checkNoDeletePaths,
	checkReadOnlyPath,
	checkWriteConfirmPath,
	checkZeroAccess,
	containsInjectionPattern,
	contentNeedsScan,
	type DamageControlMode,
	evaluateDangerousCommand,
	evaluateShellMode,
	extractBashDeleteTargets,
	extractPwshDeleteTargets,
	extractTruncatingEditWriteTarget,
	matchesPattern,
} from "./damage-control-engine.js";
import { loadRules } from "./damage-control-rules.js";

export { debugLog, redactSummary } from "./damage-control-debug.js";
export {
	checkNoDeletePaths,
	checkReadOnlyPath,
	checkWriteConfirmPath,
	checkZeroAccess,
	commandAppliesToCurrentPlatform,
	containsInjectionPattern,
	contentNeedsScan,
	type DamageControlMode,
	evaluateDangerousCommand,
	evaluateShellMode,
	extractBashDeleteTargets,
	extractPwshDeleteTargets,
	extractTruncatingEditWriteTarget,
	isReadOnlySearchCommand,
	isSshProtectedPattern,
	matchesPattern,
} from "./damage-control-engine.js";
export {
	compileCommandRegex,
	type DamageControlRules,
	type DangerousCommand,
	loadRules,
	normalizeClaudePolicy,
	parseDamageControlRules,
	validateDamageControlRules,
} from "./damage-control-rules.js";

const DENY_PROVENANCE: DecisionProvenance = "rule";
const DAMAGE_CONTROL_MODES: DamageControlMode[] = [
	"default",
	"whitelist",
	"noshell",
];
interface DamageControlRuntimeState {
	health: DamageControlHealth;
	mode: DamageControlMode;
}

function createDamageControlState(): DamageControlRuntimeState {
	return { health: getDamageControlHealth(), mode: "default" };
}

function safeRecordDeny(
	toolName: string,
	rawAction: string,
	reason: string,
	rule?: string,
	replayPayload?: Record<string, unknown>,
): void {
	try {
		const action = `${toolName}:${rawAction.slice(0, 200)}`;
		recordDecision({
			action,
			outcome: "deny",
			provenance: DENY_PROVENANCE,
			summary: reason,
			rule,
			replayPayload,
		});
		recordEvent({
			event: "permission_decision",
			data: {
				tool: toolName,
				outcome: "deny",
				provenance: DENY_PROVENANCE,
				rule,
				summary: reason,
			},
		});
	} catch {
		// Registry/metrics failures must never block damage-control flow.
	}
}

function safeRecordAllow(
	toolName: string,
	rawAction: string,
	provenance: DecisionProvenance,
	summary?: string,
): void {
	try {
		const action = `${toolName}:${rawAction.slice(0, 200)}`;
		recordDecision({ action, outcome: "allow", provenance, summary });
		recordEvent({
			event: "permission_decision",
			data: { tool: toolName, outcome: "allow", provenance, summary },
		});
	} catch {
		// ignore
	}
}

function extractRulePattern(reason: string): string | undefined {
	const match = reason.match(/matched "([^"]+)"/);
	return match ? match[1] : undefined;
}

function replayDescriptor(input: {
	toolName: string;
	rawAction: string;
	cwd?: string;
	reason: string;
	rule?: string;
}): Record<string, unknown> {
	return {
		toolName: input.toolName,
		cwd: input.cwd,
		rule: input.rule,
		classification: input.reason.startsWith("Confirmation required")
			? "ask-deny"
			: "block",
		redactedSummary: redactSummary(input.rawAction),
	};
}

function formatDamageControlStatus(state: DamageControlRuntimeState): string {
	if (state.health.status === "active") {
		return `damage-control: active (${state.mode})`;
	}
	return "damage-control: failed";
}

function damageControlStatusMessage(state: DamageControlRuntimeState): string {
	return `damage-control status: ${state.health.status}; mode: ${state.mode}; core protections: always on`;
}

function parseDamageControlMode(value: string): DamageControlMode | undefined {
	return DAMAGE_CONTROL_MODES.includes(value as DamageControlMode)
		? (value as DamageControlMode)
		: undefined;
}

function safeRecordModeTransition(
	previousMode: DamageControlMode,
	newMode: DamageControlMode,
	alias: string,
): void {
	try {
		recordEvent({
			event: "damage_control_mode_transition",
			data: { previousMode, newMode, alias },
		});
	} catch {
		// Metrics failures must never block damage-control flow.
	}
}

function registerDamageControlCommand(
	pi: ExtensionAPI,
	state: DamageControlRuntimeState,
): void {
	const registerCommand = pi.registerCommand?.bind(pi);
	if (!registerCommand) return;
	const command = {
		description:
			"Show or switch the session-local damage-control mode: default, whitelist, noshell",
		getArgumentCompletions: (prefix: string) => {
			const items = [
				{ value: "status", label: "status" },
				{ value: "mode default", label: "mode default" },
				{ value: "mode whitelist", label: "mode whitelist" },
				{ value: "mode noshell", label: "mode noshell" },
			];
			const filtered = items.filter((item) => item.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : items;
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (trimmed === "" || trimmed === "status") {
				ctx.ui.notify(damageControlStatusMessage(state), "info");
				return;
			}
			const tokens = trimmed.split(/\s+/);
			const [subcommand, rawMode] = tokens;
			if (subcommand !== "mode" || tokens.length !== 2) {
				ctx.ui.notify(
					"Usage: /damage-control status | /damage-control mode default|whitelist|noshell",
					"warning",
				);
				return;
			}
			const mode = parseDamageControlMode(rawMode ?? "");
			if (!mode) {
				ctx.ui.notify(
					"Usage: /damage-control mode default|whitelist|noshell",
					"warning",
				);
				return;
			}
			const previousMode = state.mode;
			state.mode = mode;
			safeRecordModeTransition(
				previousMode,
				mode,
				(ctx as { commandName?: string }).commandName ?? "damage-control",
			);
			ctx.ui.setStatus("damage-control", formatDamageControlStatus(state));
			ctx.ui.notify(
				`damage-control mode changed from ${previousMode} to ${mode}`,
				"info",
			);
		},
	} satisfies Parameters<ExtensionAPI["registerCommand"]>[1];
	registerCommand("damage-control", command);
	registerCommand("dc", {
		...command,
		description: "Alias for /damage-control",
	});
}

function blockIfRulesFailed(
	state: DamageControlRuntimeState,
): { block: true; reason: string } | undefined {
	if (state.health.status !== "failed") return undefined;
	return {
		block: true,
		reason: state.health.error ?? "Damage-control rules failed to load.",
	};
}

function recordBlock(
	toolName: string,
	rawAction: string,
	cwd: string,
	decision: { block: true; reason: string },
): void {
	const rule = extractRulePattern(decision.reason);
	safeRecordDeny(
		toolName,
		rawAction,
		decision.reason,
		rule,
		replayDescriptor({
			toolName,
			rawAction,
			cwd,
			reason: decision.reason,
			rule,
		}),
	);
}

export default function (pi: ExtensionAPI) {
	debugLog("extension_registered");
	const state = createDamageControlState();
	const loaded = loadRules();
	const rules = loaded.rules;
	state.health = loaded.health;
	debugLog("rules_loaded", { health: loaded.health });
	publishDamageControlHealth(loaded.health);
	registerDamageControlCommand(pi, state);

	pi.on("session_start", async (_event, ctx) => {
		debugLog("session_start", { health: state.health });
		ctx.ui.setStatus("damage-control", formatDamageControlStatus(state));
		if (state.health.status === "failed") {
			ctx.ui.notify(
				state.health.error ?? "Damage-control rules failed to load.",
				"warning",
			);
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const failed = blockIfRulesFailed(state);
		if (failed) return failed;
		const command = (event as BashToolCallEvent).input.command ?? "";
		debugLog("tool_call_seen", {
			toolName: event.toolName,
			actionSummary: command,
			cwd: ctx.cwd,
		});

		const modeDecision = evaluateShellMode("bash", command, state.mode);
		if (modeDecision) {
			recordBlock("bash", command, ctx.cwd, modeDecision);
			return modeDecision;
		}

		const dangerous = await evaluateDangerousCommand(
			command,
			rules.dangerous_commands,
			{
				ui: ctx.ui,
				hasUI: true,
				toolName: "bash",
				onConfirm: (rule) => {
					safeRecordAllow(
						"bash",
						command,
						"manual_once",
						`Confirmed dangerous command (matched "${rule.pattern}"): ${rule.reason}`,
					);
				},
			},
		);
		if (dangerous) {
			debugDecision(
				"dangerous_command_decision",
				event.toolName,
				command,
				dangerous,
			);
			recordBlock("bash", command, ctx.cwd, dangerous);
			return dangerous;
		}

		const targets = extractBashDeleteTargets(command);
		const noDelete = checkNoDeletePaths(
			targets,
			rules.no_delete_paths,
			ctx.cwd,
		);
		if (noDelete) {
			debugDecision("no_delete_decision", event.toolName, command, noDelete, {
				targets,
			});
			recordBlock("bash", command, ctx.cwd, noDelete);
		}
		return noDelete;
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "pwsh") return undefined;
		const failed = blockIfRulesFailed(state);
		if (failed) return failed;
		const command = (event.input as { command?: string }).command ?? "";
		debugLog("tool_call_seen", {
			toolName: event.toolName,
			actionSummary: command,
			cwd: ctx.cwd,
		});
		const modeDecision = evaluateShellMode("pwsh", command, state.mode);
		if (modeDecision) {
			recordBlock("pwsh", command, ctx.cwd, modeDecision);
			return modeDecision;
		}
		const dangerous = await evaluateDangerousCommand(
			command,
			rules.dangerous_commands,
			{
				ui: ctx.ui,
				hasUI: true,
				toolName: "pwsh",
				onConfirm: (rule) => {
					safeRecordAllow(
						"pwsh",
						command,
						"manual_once",
						`Confirmed dangerous command (matched "${rule.pattern}"): ${rule.reason}`,
					);
				},
			},
		);
		if (dangerous) {
			recordBlock("pwsh", command, ctx.cwd, dangerous);
			return dangerous;
		}
		const noDelete = checkNoDeletePaths(
			extractPwshDeleteTargets(command),
			rules.no_delete_paths,
			ctx.cwd,
		);
		if (noDelete) recordBlock("pwsh", command, ctx.cwd, noDelete);
		return noDelete;
	});

	pi.on("tool_call", async (event, ctx) => {
		const FILE_TOOLS = new Set(["read", "write", "edit", "find", "ls"]);
		if (!FILE_TOOLS.has(event.toolName)) return undefined;
		const failed = blockIfRulesFailed(state);
		if (failed) return failed;
		const fileEvent = event as
			| ReadToolCallEvent
			| WriteToolCallEvent
			| EditToolCallEvent;
		const rawPath = (fileEvent.input as { path?: string }).path ?? "";
		if (!rawPath) return undefined;
		debugLog("tool_call_seen", {
			toolName: event.toolName,
			actionSummary: rawPath,
			cwd: ctx.cwd,
		});

		const canonResult = canonicalizeOrBlock(rawPath, ctx.cwd);
		if ("block" in canonResult) {
			recordBlock(event.toolName, rawPath, ctx.cwd, canonResult);
			return canonResult;
		}

		const zeroAccess = rules.zero_access_exclusions.some((pattern) =>
			matchesPattern(canonResult.canonical, pattern),
		)
			? undefined
			: await checkZeroAccess(
					canonResult.canonical,
					rules.zero_access_paths,
					event.toolName,
					{ ui: ctx.ui, hasUI: true },
				);
		if (zeroAccess) {
			debugDecision(
				"zero_access_decision",
				event.toolName,
				rawPath,
				zeroAccess,
			);
			recordBlock(event.toolName, rawPath, ctx.cwd, zeroAccess);
			return zeroAccess;
		}

		if (event.toolName === "write" || event.toolName === "edit") {
			const readOnly = checkReadOnlyPath(
				rawPath,
				rules.read_only_paths,
				rules.zero_access_exclusions,
				ctx.cwd,
			);
			if (readOnly) {
				recordBlock(event.toolName, rawPath, ctx.cwd, readOnly);
				return readOnly;
			}
			const content =
				(fileEvent.input as { content?: string; new_string?: string })
					.content ??
				(fileEvent.input as { new_string?: string }).new_string ??
				"";
			if (contentNeedsScan(rawPath, rules.content_scan_paths, ctx.cwd)) {
				const injectionPattern = containsInjectionPattern(
					content,
					rules.injection_patterns,
				);
				if (injectionPattern) {
					const decision = {
						block: true as const,
						reason: `Blocked content injection pattern (matched "${injectionPattern}"): ${rawPath}`,
					};
					recordBlock(event.toolName, rawPath, ctx.cwd, decision);
					return decision;
				}
			}
			const writeConfirm = checkWriteConfirmPath(
				rawPath,
				rules.write_confirm_paths,
				rules.zero_access_exclusions,
				ctx.cwd,
			);
			if (writeConfirm) {
				emitTerminalBell();
				const ok = await ctx.ui.confirm(
					"Confirm protected write",
					writeConfirm.reason,
				);
				if (!ok) {
					const decision = {
						block: true as const,
						reason: writeConfirm.reason,
					};
					recordBlock(event.toolName, rawPath, ctx.cwd, decision);
					return decision;
				}
				safeRecordAllow(
					event.toolName,
					rawPath,
					"manual_once",
					writeConfirm.reason,
				);
			}
		}

		const truncatingTarget = extractTruncatingEditWriteTarget(
			event.toolName,
			fileEvent.input as {
				path?: string;
				content?: string;
				new_string?: string;
				old_string?: string;
			},
		);
		if (truncatingTarget) {
			const noDelete = checkNoDeletePaths(
				[truncatingTarget],
				rules.no_delete_paths,
				ctx.cwd,
			);
			if (noDelete) recordBlock(event.toolName, rawPath, ctx.cwd, noDelete);
			return noDelete;
		}
		return undefined;
	});
}
