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
	checkZeroAccess,
	evaluateDangerousCommand,
	extractBashDeleteTargets,
	extractPwshDeleteTargets,
	extractTruncatingEditWriteTarget,
} from "./damage-control-engine.js";
import { loadRules } from "./damage-control-rules.js";

export { debugLog, redactSummary } from "./damage-control-debug.js";
export {
	checkNoDeletePaths,
	checkZeroAccess,
	commandAppliesToCurrentPlatform,
	evaluateDangerousCommand,
	extractBashDeleteTargets,
	extractPwshDeleteTargets,
	extractTruncatingEditWriteTarget,
	isSshProtectedPattern,
	matchesPattern,
} from "./damage-control-engine.js";
export {
	type DamageControlRules,
	type DangerousCommand,
	loadRules,
	parseDamageControlRules,
	validateDamageControlRules,
} from "./damage-control-rules.js";

const DENY_PROVENANCE: DecisionProvenance = "rule";
let lastDamageControlHealth: DamageControlHealth = getDamageControlHealth();

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

function formatDamageControlStatus(health: DamageControlHealth): string {
	if (health.status === "active") {
		return "damage-control: active";
	}
	return "damage-control: failed";
}

function blockIfRulesFailed(): { block: true; reason: string } | undefined {
	if (lastDamageControlHealth.status !== "failed") return undefined;
	return {
		block: true,
		reason:
			lastDamageControlHealth.error ?? "Damage-control rules failed to load.",
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
	const loaded = loadRules();
	const rules = loaded.rules;
	lastDamageControlHealth = loaded.health;
	debugLog("rules_loaded", { health: loaded.health });
	publishDamageControlHealth(loaded.health);

	pi.on("session_start", async (_event, ctx) => {
		debugLog("session_start", { health: lastDamageControlHealth });
		ctx.ui.setStatus(
			"damage-control",
			formatDamageControlStatus(lastDamageControlHealth),
		);
		if (lastDamageControlHealth.status === "failed") {
			ctx.ui.notify(
				lastDamageControlHealth.error ?? "Damage-control rules failed to load.",
				"warning",
			);
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const failed = blockIfRulesFailed();
		if (failed) return failed;
		const command = (event as BashToolCallEvent).input.command ?? "";
		debugLog("tool_call_seen", {
			toolName: event.toolName,
			actionSummary: command,
			cwd: ctx.cwd,
		});

		const dangerous = await evaluateDangerousCommand(
			command,
			rules.dangerous_commands,
			{
				ui: ctx.ui,
				hasUI: true,
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

	pi.on("tool_call", (event, ctx) => {
		if (event.toolName !== "pwsh") return undefined;
		const failed = blockIfRulesFailed();
		if (failed) return failed;
		const command = (event.input as { command?: string }).command ?? "";
		debugLog("tool_call_seen", {
			toolName: event.toolName,
			actionSummary: command,
			cwd: ctx.cwd,
		});
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
		const failed = blockIfRulesFailed();
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

		const zeroAccess = await checkZeroAccess(
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
