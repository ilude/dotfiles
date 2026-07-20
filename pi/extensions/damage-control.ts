import type {
	BashToolCallEvent,
	EditToolCallEvent,
	ExtensionAPI,
	ReadToolCallEvent,
	WriteToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import {
	addDamageControlEvalLabel,
	isDamageControlEvalLabel,
	listDamageControlEvalEvents,
	recordDamageControlEval,
	summarizeDamageControlEval,
} from "../lib/damage-control-eval.js";
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
import { wrapCommandRegistration } from "../lib/slash-command-echo.js";
import {
	debugDecision,
	debugLog,
	redactSummary,
} from "./damage-control-debug.js";
import {
	canonicalizeOrBlock,
	checkNoDeletePaths,
	checkReadConfirmPath,
	checkReadOnlyPath,
	checkWriteConfirmPath,
	checkZeroAccess,
	containsInjectionPattern,
	contentNeedsScan,
	type DamageControlAskApproval,
	type DamageControlMode,
	evaluateDangerousCommand,
	evaluateShellMode,
	extractBashDeleteTargets,
	extractPwshDeleteTargets,
	extractTruncatingEditWriteTarget,
	matchesPattern,
} from "./damage-control-engine.js";
import { loadRules } from "./damage-control-rules.js";
import {
	DamageControlSessionState,
	outputContainsSecret,
} from "./damage-control-state.js";

export { debugLog, redactSummary } from "./damage-control-debug.js";
export {
	analyzeGitCommand,
	checkNoDeletePaths,
	checkReadConfirmPath,
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
	hasValidDryRun,
	isReadOnlySearchCommand,
	isSshProtectedPattern,
	matchesPattern,
} from "./damage-control-engine.js";
export {
	compileCommandRegex,
	type DamageControlRules,
	type DangerousCommand,
	loadRules,
	parseDamageControlRules,
	validateDamageControlRules,
} from "./damage-control-rules.js";

const DENY_PROVENANCE: DecisionProvenance = "rule";
const DAMAGE_CONTROL_MODES: DamageControlMode[] = ["default", "noshell"];
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
	metadata?: Record<string, unknown>,
): void {
	try {
		const action = `${toolName}:${redactSummary(rawAction).slice(0, 200)}`;
		const summary = redactSummary(reason);
		recordDecision({
			action,
			outcome: "deny",
			provenance: DENY_PROVENANCE,
			summary,
			rule,
			replayPayload,
			metadata,
		});
		recordEvent({
			event: "permission_decision",
			data: {
				tool: toolName,
				outcome: "deny",
				provenance: DENY_PROVENANCE,
				rule,
				summary,
				toolCallId: metadata?.toolCallId,
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
	rule?: string,
	metadata?: Record<string, unknown>,
): void {
	try {
		const action = `${toolName}:${redactSummary(rawAction).slice(0, 200)}`;
		recordDecision({
			action,
			outcome: "allow",
			provenance,
			summary,
			rule,
			metadata,
		});
		recordEvent({
			event: "permission_decision",
			data: {
				tool: toolName,
				outcome: "allow",
				provenance,
				summary,
				rule,
				toolCallId: metadata?.toolCallId,
			},
		});
	} catch {
		// Registry/metrics failures must never block damage-control flow.
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
	metadata?: Record<string, unknown>;
}): Record<string, unknown> {
	return {
		toolName: input.toolName,
		cwd: input.cwd,
		rule: input.rule,
		classification: input.reason.startsWith("Confirmation required")
			? "ask-deny"
			: "block",
		redactedSummary: redactSummary(input.rawAction),
		metadata: input.metadata,
	};
}

function safeRecordDamageControlEval(input: {
	decisionType: "ask_approved" | "ask_denied" | "hard_block";
	toolName: string;
	rawAction: string;
	cwd?: string;
	reason?: string;
	rule?: string;
	ruleSource?: string;
	toolCallId?: string;
	hasUI?: boolean;
}): void {
	try {
		recordDamageControlEval({
			decisionType: input.decisionType,
			toolName: input.toolName,
			redactedAction: redactSummary(input.rawAction),
			rule: input.rule,
			ruleSource: input.ruleSource,
			summary: input.reason ? redactSummary(input.reason) : undefined,
			cwd: input.cwd,
			toolCallId: input.toolCallId,
			hasUI: input.hasUI,
		});
	} catch {
		// Eval logging must never affect safety flow.
	}
}

interface ApprovedAskRecord {
	toolName: string;
	rawAction: string;
	cwd: string;
	approval: DamageControlAskApproval;
	ruleSource?: string;
	toolCallId?: string;
	metadata?: Record<string, unknown>;
}

function safeRecordApprovedAsk(input: ApprovedAskRecord): void {
	const summary = redactSummary(input.approval.reason);
	const metadata = {
		cwd: input.cwd,
		ruleSource: input.ruleSource,
		toolCallId: input.toolCallId,
		...input.metadata,
	};
	safeRecordDamageControlEval({
		decisionType: "ask_approved",
		toolName: input.toolName,
		rawAction: input.rawAction,
		cwd: input.cwd,
		reason: summary,
		rule: input.approval.rule,
		ruleSource: input.ruleSource,
		toolCallId: input.toolCallId,
		hasUI: true,
	});
	safeRecordAllow(
		input.toolName,
		input.rawAction,
		"manual_once",
		summary,
		input.approval.rule,
		metadata,
	);
}

function damageControlStatusMessage(state: DamageControlRuntimeState): string {
	return `damage-control status: ${state.health.status}; mode: ${state.mode}; core protections: always on`;
}

function shortId(id: string): string {
	return id.slice(0, 8);
}

function formatDamageControlStats(): string {
	const stats = summarizeDamageControlEval();
	const lines = ["damage-control eval stats:"];
	lines.push(`  events: ${stats.total}`);
	const decisionTypes = Object.entries(stats.byDecisionType)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([type, count]) => `${type}=${count}`)
		.join(", ");
	lines.push(`  decision types: ${decisionTypes || "none"}`);
	lines.push("  top rules:");
	for (const row of stats.byRule.slice(0, 10)) {
		const labels = Object.entries(row.labels)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([label, count]) => `${label}=${count}`)
			.join(", ");
		lines.push(
			`    ${row.total} ${row.rule} (approved=${row.askApproved}, denied=${row.askDenied}, blocked=${row.hardBlock}${labels ? `, ${labels}` : ""})`,
		);
	}
	return lines.join("\n");
}

function formatDamageControlRecent(): string {
	const events = listDamageControlEvalEvents(10);
	if (events.length === 0) return "No damage-control eval events recorded.";
	return ["recent damage-control eval events:"]
		.concat(
			events.map(
				(event) =>
					`  ${shortId(event.id)} ${event.decisionType} ${event.toolName} ${event.rule ?? "(no rule)"} -- ${event.redactedAction}`,
			),
		)
		.join("\n");
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
			"Show or switch the session-local damage-control mode: default, noshell",
		getArgumentCompletions: (prefix: string) => {
			const items = [
				{ value: "status", label: "status" },
				{ value: "mode default", label: "mode default" },
				{ value: "mode noshell", label: "mode noshell" },
			];
			const filtered = items.filter((item) => item.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : items;
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			ctx.ui.setStatus?.(
				"damage-control",
				`damage-control: ${state.health.status}; mode ${state.mode}`,
			);
			if (trimmed === "" || trimmed === "status") {
				ctx.ui.notify(damageControlStatusMessage(state), "info");
				return;
			}
			const tokens = trimmed.split(/\s+/);
			const [subcommand, rawMode, labelArg] = tokens;
			if (subcommand === "stats") {
				ctx.ui.notify(formatDamageControlStats(), "info");
				return;
			}
			if (subcommand === "recent") {
				ctx.ui.notify(formatDamageControlRecent(), "info");
				return;
			}
			if (subcommand === "label") {
				if (!rawMode || !labelArg || !isDamageControlEvalLabel(labelArg)) {
					ctx.ui.notify(
						"Usage: /damage-control label <event-id> useful|noise|too_strict|too_weak|unclear",
						"warning",
					);
					return;
				}
				try {
					const updated = addDamageControlEvalLabel(rawMode, labelArg);
					ctx.ui.notify(
						`Labeled ${shortId(updated.id)}: ${(updated.labels ?? []).join(", ")}`,
						"info",
					);
				} catch (err) {
					ctx.ui.notify(
						`Label failed: ${err instanceof Error ? err.message : String(err)}`,
						"warning",
					);
				}
				return;
			}
			if (subcommand !== "mode" || tokens.length !== 2) {
				ctx.ui.notify(
					"Usage: /damage-control status | /damage-control mode default|noshell | /damage-control stats | /damage-control recent | /damage-control label <id> <label>",
					"warning",
				);
				return;
			}
			const mode = parseDamageControlMode(rawMode ?? "");
			if (!mode) {
				ctx.ui.notify("Usage: /damage-control mode default|noshell", "warning");
				return;
			}
			const previousMode = state.mode;
			state.mode = mode;
			ctx.ui.setStatus?.(
				"damage-control",
				`damage-control: ${state.health.status}; mode ${state.mode}`,
			);
			safeRecordModeTransition(
				previousMode,
				mode,
				(ctx as { commandName?: string }).commandName ?? "damage-control",
			);
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
	hasUI: boolean,
	ruleSource?: string,
	toolCallId?: string,
	metadata?: Record<string, unknown>,
): void {
	const rule = extractRulePattern(decision.reason);
	const auditMetadata = {
		cwd,
		ruleSource,
		toolCallId,
		...metadata,
	};
	safeRecordDamageControlEval({
		decisionType: decision.reason.startsWith("Confirmation required")
			? "ask_denied"
			: "hard_block",
		toolName,
		rawAction,
		cwd,
		reason: decision.reason,
		rule,
		ruleSource,
		toolCallId,
		hasUI,
	});
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
			metadata: auditMetadata,
		}),
		auditMetadata,
	);
}

export default function (pi: ExtensionAPI) {
	wrapCommandRegistration(pi);
	debugLog("extension_registered");
	const state = createDamageControlState();
	const sessionState = new DamageControlSessionState();
	const loaded = loadRules();
	const rules = loaded.rules;
	state.health = loaded.health;
	debugLog("rules_loaded", { health: loaded.health });
	publishDamageControlHealth(loaded.health);
	registerDamageControlCommand(pi, state);

	pi.on("session_start", async (_event, ctx) => {
		debugLog("session_start", { health: state.health });
		ctx.ui.setStatus?.("damage-control", "damage-control: active");
		if (state.health.status === "failed") {
			ctx.ui.notify(
				state.health.error ?? "Damage-control rules failed to load.",
				"warning",
			);
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const command = (event as BashToolCallEvent).input.command ?? "";
		const failed = blockIfRulesFailed(state);
		if (failed) {
			recordBlock(
				"bash",
				command,
				ctx.cwd,
				failed,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
				{ ruleLoadFailure: true },
			);
			return failed;
		}
		debugLog("tool_call_seen", {
			toolName: event.toolName,
			actionSummary: command,
			cwd: ctx.cwd,
		});

		const sequenceDecision = sessionState.check("bash", command);
		if (sequenceDecision) {
			const decision = {
				block: true as const,
				reason: `${sequenceDecision.action === "ask" ? "Confirmation required" : "Blocked"} for dangerous sequence (matched "${sequenceDecision.name}"): ${sequenceDecision.reason}`,
			};
			if (sequenceDecision.action === "ask" && ctx.hasUI && ctx.ui?.confirm) {
				emitTerminalBell();
				const ok = await ctx.ui.confirm(
					"Confirm dangerous sequence",
					sequenceDecision.reason,
				);
				if (ok) {
					safeRecordApprovedAsk({
						toolName: "bash",
						rawAction: command,
						cwd: ctx.cwd,
						approval: {
							rule: sequenceDecision.name,
							reason: sequenceDecision.reason,
						},
						ruleSource: loaded.health.ruleSource,
						toolCallId: event.toolCallId,
						metadata: sequenceDecision.evidence
							? { sequenceEvidence: sequenceDecision.evidence }
							: undefined,
					});
					return undefined;
				}
			}
			recordBlock(
				"bash",
				command,
				ctx.cwd,
				decision,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
				sequenceDecision.evidence
					? { sequenceEvidence: sequenceDecision.evidence }
					: undefined,
			);
			return decision;
		}

		const modeDecision = evaluateShellMode("bash", command, state.mode);
		if (modeDecision) {
			recordBlock(
				"bash",
				command,
				ctx.cwd,
				modeDecision,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
			);
			return modeDecision;
		}

		const dangerous = await evaluateDangerousCommand(
			command,
			rules.dangerous_commands,
			{
				ui: ctx.ui,
				hasUI: ctx.hasUI,
				toolName: "bash",
				astAnalysis: rules.astAnalysis,
				cwd: ctx.cwd,
				onAskApproved: (approval) =>
					safeRecordApprovedAsk({
						toolName: "bash",
						rawAction: command,
						cwd: ctx.cwd,
						approval,
						ruleSource: loaded.health.ruleSource,
						toolCallId: event.toolCallId,
					}),
			},
		);
		if (dangerous) {
			debugDecision(
				"dangerous_command_decision",
				event.toolName,
				command,
				dangerous,
			);
			recordBlock(
				"bash",
				command,
				ctx.cwd,
				dangerous,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
			);
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
			recordBlock(
				"bash",
				command,
				ctx.cwd,
				noDelete,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
			);
		} else {
			sessionState.record("bash", command);
		}
		return noDelete;
	});

	pi.on("tool_result", async (event) => {
		if (!outputContainsSecret(event.content)) return undefined;
		const reason = "Tool output matched secret-material heuristics.";
		safeRecordDeny(
			event.toolName,
			JSON.stringify(event.content ?? "").slice(0, 200),
			reason,
			"secret_output",
		);
		return undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "pwsh") return undefined;
		const command = (event.input as { command?: string }).command ?? "";
		const failed = blockIfRulesFailed(state);
		if (failed) {
			recordBlock(
				"pwsh",
				command,
				ctx.cwd,
				failed,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
				{ ruleLoadFailure: true },
			);
			return failed;
		}
		debugLog("tool_call_seen", {
			toolName: event.toolName,
			actionSummary: command,
			cwd: ctx.cwd,
		});
		const modeDecision = evaluateShellMode("pwsh", command, state.mode);
		if (modeDecision) {
			recordBlock(
				"pwsh",
				command,
				ctx.cwd,
				modeDecision,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
			);
			return modeDecision;
		}
		const dangerous = await evaluateDangerousCommand(
			command,
			rules.dangerous_commands,
			{
				ui: ctx.ui,
				hasUI: ctx.hasUI,
				toolName: "pwsh",
				cwd: ctx.cwd,
				onAskApproved: (approval) =>
					safeRecordApprovedAsk({
						toolName: "pwsh",
						rawAction: command,
						cwd: ctx.cwd,
						approval,
						ruleSource: loaded.health.ruleSource,
						toolCallId: event.toolCallId,
					}),
			},
		);
		if (dangerous) {
			recordBlock(
				"pwsh",
				command,
				ctx.cwd,
				dangerous,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
			);
			return dangerous;
		}
		const noDelete = checkNoDeletePaths(
			extractPwshDeleteTargets(command),
			rules.no_delete_paths,
			ctx.cwd,
		);
		if (noDelete)
			recordBlock(
				"pwsh",
				command,
				ctx.cwd,
				noDelete,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
			);
		return noDelete;
	});

	pi.on("tool_call", async (event, ctx) => {
		const FILE_TOOLS = new Set(["read", "write", "edit", "find", "ls", "glob"]);
		if (!FILE_TOOLS.has(event.toolName)) return undefined;
		const fileEvent = event as
			| ReadToolCallEvent
			| WriteToolCallEvent
			| EditToolCallEvent;
		const rawPath = (fileEvent.input as { path?: string }).path ?? "";
		const failed = blockIfRulesFailed(state);
		if (failed) {
			recordBlock(
				event.toolName,
				rawPath,
				ctx.cwd,
				failed,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
				{ ruleLoadFailure: true },
			);
			return failed;
		}
		if (!rawPath) return undefined;
		debugLog("tool_call_seen", {
			toolName: event.toolName,
			actionSummary: rawPath,
			cwd: ctx.cwd,
		});

		const canonResult = canonicalizeOrBlock(rawPath, ctx.cwd);
		if ("block" in canonResult) {
			recordBlock(
				event.toolName,
				rawPath,
				ctx.cwd,
				canonResult,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
			);
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
					{
						ui: ctx.ui,
						hasUI: ctx.hasUI,
						onAskApproved: (approval) =>
							safeRecordApprovedAsk({
								toolName: event.toolName,
								rawAction: rawPath,
								cwd: ctx.cwd,
								approval,
								ruleSource: loaded.health.ruleSource,
								toolCallId: event.toolCallId,
							}),
					},
				);
		if (zeroAccess) {
			debugDecision(
				"zero_access_decision",
				event.toolName,
				rawPath,
				zeroAccess,
			);
			recordBlock(
				event.toolName,
				rawPath,
				ctx.cwd,
				zeroAccess,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
			);
			return zeroAccess;
		}

		if (event.toolName === "read") {
			const readConfirm = checkReadConfirmPath(
				rawPath,
				rules.read_confirm_paths,
				rules.zero_access_exclusions,
				ctx.cwd,
			);
			if (readConfirm) {
				let ok = false;
				if (ctx.hasUI) {
					emitTerminalBell();
					ok = await ctx.ui.confirm(
						"Confirm protected read",
						readConfirm.reason,
					);
				}
				if (!ok) {
					const decision = {
						block: true as const,
						reason: readConfirm.reason,
					};
					recordBlock(
						event.toolName,
						rawPath,
						ctx.cwd,
						decision,
						ctx.hasUI,
						loaded.health.ruleSource,
						event.toolCallId,
					);
					return decision;
				}
				safeRecordApprovedAsk({
					toolName: event.toolName,
					rawAction: rawPath,
					cwd: ctx.cwd,
					approval: {
						rule: extractRulePattern(readConfirm.reason) ?? "protected read",
						reason: readConfirm.reason,
					},
					ruleSource: loaded.health.ruleSource,
					toolCallId: event.toolCallId,
				});
			}
		}

		if (event.toolName === "write" || event.toolName === "edit") {
			const readOnly = checkReadOnlyPath(
				rawPath,
				rules.read_only_paths,
				rules.zero_access_exclusions,
				ctx.cwd,
			);
			if (readOnly) {
				recordBlock(
					event.toolName,
					rawPath,
					ctx.cwd,
					readOnly,
					ctx.hasUI,
					loaded.health.ruleSource,
					event.toolCallId,
				);
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
					recordBlock(
						event.toolName,
						rawPath,
						ctx.cwd,
						decision,
						ctx.hasUI,
						loaded.health.ruleSource,
						event.toolCallId,
					);
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
				let ok = false;
				if (ctx.hasUI) {
					emitTerminalBell();
					ok = await ctx.ui.confirm(
						"Confirm protected write",
						writeConfirm.reason,
					);
				}
				if (!ok) {
					const decision = {
						block: true as const,
						reason: writeConfirm.reason,
					};
					recordBlock(
						event.toolName,
						rawPath,
						ctx.cwd,
						decision,
						ctx.hasUI,
						loaded.health.ruleSource,
						event.toolCallId,
					);
					return decision;
				}
				safeRecordApprovedAsk({
					toolName: event.toolName,
					rawAction: rawPath,
					cwd: ctx.cwd,
					approval: {
						rule: extractRulePattern(writeConfirm.reason) ?? "protected write",
						reason: writeConfirm.reason,
					},
					ruleSource: loaded.health.ruleSource,
					toolCallId: event.toolCallId,
				});
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
			if (noDelete)
				recordBlock(
					event.toolName,
					rawPath,
					ctx.cwd,
					noDelete,
					ctx.hasUI,
					loaded.health.ruleSource,
					event.toolCallId,
				);
			return noDelete;
		}
		if (["read", "glob"].includes(event.toolName)) {
			sessionState.record(event.toolName, rawPath);
		}
		return undefined;
	});
}
