import { createHash, randomUUID } from "node:crypto";
import type {
	BashToolCallEvent,
	EditToolCallEvent,
	ExtensionAPI,
	ExtensionContext,
	ReadToolCallEvent,
	WriteToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import {
	addDamageControlEvalLabel,
	type DamageControlEvalDecisionType,
	isDamageControlEvalLabel,
	listDamageControlEvalEvents,
	recordDamageControlEval,
	summarizeDamageControlEval,
} from "../lib/damage-control-eval.js";
import {
	judgeDamageControl,
	listDamageControlJudgeRecords,
	summarizeDamageControlJudge,
} from "../lib/damage-control-judge.js";
import { readMergedSettings } from "../lib/settings-loader.js";
import {
	type DamageControlHealth,
	getDamageControlHealth,
	publishDamageControlHealth,
} from "../lib/damage-control-health.js";
import { uiNotify } from "../lib/extension-utils.js";
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
	analyzeUnsafeShellEdit,
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
	classifyDamageControlPrompt,
	damageControlPromptPresentation,
	type DamageControlPromptCategory,
	type DamageControlPromptSeverity,
	showDamageControlPrompt,
} from "./damage-control/prompt.js";
import {
	DamageControlSessionState,
	outputContainsSecret,
} from "./damage-control-state.js";

export { debugLog, redactSummary } from "./damage-control-debug.js";
export {
	analyzeGitCommand,
	analyzeUnsafeShellEdit,
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
const MAX_TRACKED_TOOL_OUTCOMES = 128;
const REPEATED_TOOL_RESULT_LIMIT = 5;
const REPEATED_TOOL_LOOP_RULE = "repeated_tool_loop";
const REPEATED_TOOL_LOOP_REASON =
	`Blocked repeated tool loop (matched "${REPEATED_TOOL_LOOP_RULE}"): the same tool call produced the same result ${REPEATED_TOOL_RESULT_LIMIT} times; the current agent run was aborted.`;

interface RepeatedToolOutcome {
	resultFingerprint: string;
	count: number;
}

function normalizeFingerprintValue(value: unknown): unknown {
	if (typeof value === "string")
		return value.replaceAll("\r\n", "\n").trimEnd();
	if (Array.isArray(value)) return value.map(normalizeFingerprintValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.keys(value as Record<string, unknown>)
			.sort()
			.map((key) => [
				key,
				normalizeFingerprintValue(
					(value as Record<string, unknown>)[key],
				),
			]),
	);
}

function fingerprint(value: unknown): string | undefined {
	try {
		return JSON.stringify(normalizeFingerprintValue(value));
	} catch {
		return undefined;
	}
}

function fingerprintHash(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export class RepeatedToolLoopGuard {
	private readonly outcomes = new Map<string, RepeatedToolOutcome>();

	reset(): void {
		this.outcomes.clear();
	}

	check(toolName: string, input: unknown):
		| {
				callFingerprint: string;
				resultFingerprint: string;
				attemptCount: number;
		  }
		| undefined {
		const callFingerprint = fingerprint([
			toolName.trim().toLowerCase(),
			input,
		]);
		if (!callFingerprint) return undefined;
		const previous = this.outcomes.get(callFingerprint);
		if (!previous || previous.count < REPEATED_TOOL_RESULT_LIMIT)
			return undefined;
		return {
			callFingerprint,
			resultFingerprint: previous.resultFingerprint,
			attemptCount: previous.count + 1,
		};
	}

	record(toolName: string, input: unknown, result: unknown): void {
		const callFingerprint = fingerprint([
			toolName.trim().toLowerCase(),
			input,
		]);
		const resultFingerprint = fingerprint(result);
		if (!callFingerprint || !resultFingerprint) return;
		const previous = this.outcomes.get(callFingerprint);
		this.outcomes.delete(callFingerprint);
		this.outcomes.set(callFingerprint, {
			resultFingerprint,
			count:
				previous?.resultFingerprint === resultFingerprint
					? previous.count + 1
					: 1,
		});
		if (this.outcomes.size <= MAX_TRACKED_TOOL_OUTCOMES) return;
		const oldest = this.outcomes.keys().next().value;
		if (typeof oldest === "string") this.outcomes.delete(oldest);
	}
}

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
	decisionType: DamageControlEvalDecisionType;
	toolName: string;
	rawAction: string;
	cwd?: string;
	reason?: string;
	rule?: string;
	ruleSource?: string;
	toolCallId?: string;
	hasUI?: boolean;
	category?: DamageControlPromptCategory;
	severity?: DamageControlPromptSeverity;
	promptId?: string;
	tier?: "scoped_delete";
	id?: string;
}): string | undefined {
	try {
		const redactedAction = redactSummary(input.rawAction);
		return recordDamageControlEval({
			decisionType: input.decisionType,
			toolName: input.toolName,
			redactedAction,
			redactedActionTruncated:
				input.rawAction.length > SHADOW_JUDGE_MAX_REDACTED_BYTES &&
				redactedAction.length === SHADOW_JUDGE_MAX_REDACTED_BYTES,
			redactedActionLossy: input.rawAction !== redactedAction,
			rule: input.rule,
			ruleSource: input.ruleSource,
			summary: input.reason ? redactSummary(input.reason) : undefined,
			cwd: input.cwd,
			toolCallId: input.toolCallId,
			hasUI: input.hasUI,
			category: input.category,
			severity: input.severity,
			promptId: input.promptId,
			tier: input.tier,
			id: input.id,
		}).id;
	} catch {
		// Eval logging must never affect safety flow.
		return undefined;
	}
}

interface DamageControlPromptTrace {
	promptId?: string;
	category: DamageControlPromptCategory;
	severity: DamageControlPromptSeverity;
}

interface ApprovedAskRecord {
	toolName: string;
	rawAction: string;
	cwd: string;
	approval: DamageControlAskApproval;
	ruleSource?: string;
	toolCallId?: string;
	metadata?: Record<string, unknown>;
	evalEventId?: string;
	prompt?: DamageControlPromptTrace;
}

function safeRecordApprovedAsk(input: ApprovedAskRecord): void {
	const summary = redactSummary(input.approval.reason);
	const metadata = {
		cwd: input.cwd,
		ruleSource: input.ruleSource,
		toolCallId: input.toolCallId,
		promptId: input.prompt?.promptId,
		category: input.prompt?.category,
		severity: input.prompt?.severity,
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
		category: input.prompt?.category,
		severity: input.prompt?.severity,
		promptId: input.prompt?.promptId,
		id: input.evalEventId,
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

async function requestDamageControlApproval(
	ctx: ExtensionContext,
	input: {
		toolName: string;
		rawAction: string;
		approval: DamageControlAskApproval;
		title: string;
		message: string;
		ruleSource?: string;
		toolCallId?: string;
		category?: DamageControlPromptCategory;
	},
): Promise<{ approved: boolean; prompt: DamageControlPromptTrace }> {
	const category = classifyDamageControlPrompt({
		action: input.rawAction,
		rule: input.approval.rule,
		category: input.category,
	});
	const severity = damageControlPromptPresentation(category).severity;
	if (!ctx.hasUI) {
		return { approved: false, prompt: { category, severity } };
	}
	const promptId = safeRecordDamageControlEval({
		decisionType: "prompt_shown",
		toolName: input.toolName,
		rawAction: input.rawAction,
		cwd: ctx.cwd,
		reason: input.approval.reason,
		rule: input.approval.rule,
		ruleSource: input.ruleSource,
		toolCallId: input.toolCallId,
		hasUI: true,
		category,
		severity,
	});
	const approved = await showDamageControlPrompt(ctx, {
		category,
		title: input.title,
		message: input.message,
	});
	return {
		approved,
		prompt: { promptId, category, severity },
	};
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
			`    ${row.total} ${row.rule} (shown=${row.promptShown}, approved=${row.askApproved}, denied=${row.askDenied}, auto-allowed=${row.autoAllowed}, blocked=${row.hardBlock}${labels ? `, ${labels}` : ""})`,
		);
	}
	return lines.join("\n");
}

function formatDamageControlJudge(): string {
	const stats = summarizeDamageControlJudge(
		listDamageControlJudgeRecords(500),
		listDamageControlEvalEvents(500),
	);
	const lines = ["damage-control judge agreement:"];
	lines.push(`  judge rows: ${stats.total}; matched asks: ${stats.matched}`);
	lines.push(
		`  approval agreement: ${stats.approvalAgreement.matching}/${stats.approvalAgreement.total}`,
	);
	lines.push(`  judge allow on user denied: ${stats.judgeAllowOnDenied}`);
	for (const row of stats.byRule) {
		lines.push(
			`    ${row.rule}: ${row.approvalAgreement.matching}/${row.approvalAgreement.total} approvals, judge-allow-on-denied=${row.judgeAllowOnDenied}`,
		);
	}
	return lines.join("\n");
}

function isJudgeEnabled(): boolean {
	const damageControl = readMergedSettings().damageControl;
	if (!damageControl || typeof damageControl !== "object") return false;
	const judge = (damageControl as Record<string, unknown>).judge;
	return Boolean(
		judge &&
			typeof judge === "object" &&
			(judge as Record<string, unknown>).enabled === true,
	);
}

function isJudgeEligible(approval: DamageControlAskApproval): boolean {
	return !/(?:secret|\.env|exfil)/i.test(`${approval.rule} ${approval.reason}`);
}

const SHADOW_JUDGE_MAX_REDACTED_BYTES = 200;
const SHADOW_JUDGE_CREDENTIAL_OPTION =
	/^--(?:user|proxy-user|oauth2-bearer|[a-z-]*?(?:token|password|secret|credential|api[-_]?key)[a-z-]*)(?:=(.*))?$/i;
const SHADOW_JUDGE_HEADER_OPTION =
	/^(?:-H|--(?:header|http-header|proxy-header))$/i;
const SHADOW_JUDGE_SENSITIVE_HEADER =
	/^(?:authorization|proxy-authorization|x-api-key|x-auth-token|x-amz-security-token|x-goog-api-key)\s*:/i;

function tokenizeShadowJudgeCommand(command: string): string[] | undefined {
	const tokens: string[] = [];
	let index = 0;
	while (index < command.length) {
		while (/\s/.test(command[index] ?? "")) index += 1;
		if (index === command.length) break;
		if (/[\\\\`$(){}<>|&;]/.test(command[index] ?? "")) return undefined;
		let token = "";
		if (command[index] === "'" || command[index] === '"') {
			const quote = command[index];
			index += 1;
			const end = command.indexOf(quote, index);
			if (end === -1 || !/\s|$/.test(command[end + 1] ?? "")) {
				return undefined;
			}
			token = command.slice(index, end);
			index = end + 1;
		} else {
			while (index < command.length && !/\s/.test(command[index] ?? "")) {
				const character = command[index] ?? "";
				if (/[\\\\'"`$(){}<>|&;]/.test(character)) return undefined;
				token += character;
				index += 1;
			}
		}
		if (!token) return undefined;
		tokens.push(token);
	}
	return tokens.length > 0 ? tokens : undefined;
}

function sanitizeShadowJudgeCommand(command: string): string | undefined {
	const tokens = tokenizeShadowJudgeCommand(command);
	if (!tokens) return undefined;
	const redacted: string[] = [];
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index] ?? "";
		if (/^-u.+/i.test(token)) {
			redacted.push("-u[redacted]");
			continue;
		}
		if (/^-u$/i.test(token)) {
			if (!tokens[index + 1]) return undefined;
			redacted.push(token, "[redacted]");
			index += 1;
			continue;
		}
		const credential = token.match(SHADOW_JUDGE_CREDENTIAL_OPTION);
		if (credential) {
			if (token.includes("=")) {
				redacted.push(`${token.slice(0, token.indexOf("="))}=[redacted]`);
				continue;
			}
			if (!tokens[index + 1]) return undefined;
			redacted.push(token, "[redacted]");
			index += 1;
			continue;
		}
		const headerAssignment = token.match(
			/^(--(?:header|http-header|proxy-header))=(.*)$/i,
		);
		if (headerAssignment) {
			if (!headerAssignment[2]) return undefined;
			redacted.push(`${headerAssignment[1]}=[redacted]`);
			continue;
		}
		if (SHADOW_JUDGE_HEADER_OPTION.test(token)) {
			if (!tokens[index + 1]) return undefined;
			redacted.push(token, "[redacted]");
			index += 1;
			continue;
		}
		redacted.push(
			SHADOW_JUDGE_SENSITIVE_HEADER.test(token) ? "[redacted]" : token,
		);
	}
	return redacted.join(" ");
}

export function redactShadowJudgeCommand(command: string): string | undefined {
	if (
		command.length > SHADOW_JUDGE_MAX_REDACTED_BYTES ||
		/(?:secret|\.env|exfil)/i.test(command)
	) {
		return undefined;
	}
	const sanitized = sanitizeShadowJudgeCommand(command);
	if (!sanitized) return undefined;
	const redacted = redactSummary(sanitized);
	return redacted.length <= SHADOW_JUDGE_MAX_REDACTED_BYTES
		? redacted
		: undefined;
}

function startShadowJudge(input: {
	approval: DamageControlAskApproval;
	command: string;
	cwd: string;
	modelRegistry: Parameters<typeof judgeDamageControl>[0]["modelRegistry"];
}): string | undefined {
	const command = redactShadowJudgeCommand(input.command);
	if (!isJudgeEnabled() || !isJudgeEligible(input.approval) || !command) {
		return undefined;
	}
	const eventId = randomUUID();
	void judgeDamageControl({
		eventId,
		command,
		cwd: input.cwd,
		rule: input.approval.rule,
		reason: input.approval.reason,
		modelRegistry: input.modelRegistry,
	}).catch(() => undefined);
	return eventId;
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
			if (subcommand === "judge") {
				ctx.ui.notify(formatDamageControlJudge(), "info");
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
					"Usage: /damage-control status | /damage-control mode default|noshell | /damage-control stats | /damage-control recent | /damage-control judge | /damage-control label <id> <label>",
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
	evalEventId?: string,
	prompt?: DamageControlPromptTrace,
): void {
	const rule = extractRulePattern(decision.reason);
	const auditMetadata = {
		cwd,
		ruleSource,
		toolCallId,
		promptId: prompt?.promptId,
		category: prompt?.category,
		severity: prompt?.severity,
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
		category: prompt?.category,
		severity: prompt?.severity,
		promptId: prompt?.promptId,
		id: evalEventId,
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
	const repeatedToolLoop = new RepeatedToolLoopGuard();
	const loaded = loadRules();
	const rules = loaded.rules;
	state.health = loaded.health;
	debugLog("rules_loaded", { health: loaded.health });
	publishDamageControlHealth(loaded.health);
	registerDamageControlCommand(pi, state);

	pi.on("input", (event) => {
		if (event.source !== "extension") repeatedToolLoop.reset();
	});

	pi.on("agent_settled", () => {
		repeatedToolLoop.reset();
	});

	pi.on("tool_call", (event, ctx) => {
		const repeated = repeatedToolLoop.check(event.toolName, event.input);
		if (!repeated) return undefined;
		const rawAction =
			fingerprint(event.input) ?? `[unserializable ${event.toolName} input]`;
		const decision = { block: true as const, reason: REPEATED_TOOL_LOOP_REASON };
		recordBlock(
			event.toolName,
			rawAction,
			ctx.cwd,
			decision,
			ctx.hasUI,
			loaded.health.ruleSource,
			event.toolCallId,
			{
				attemptCount: repeated.attemptCount,
				callFingerprint: fingerprintHash(repeated.callFingerprint),
				resultFingerprint: fingerprintHash(repeated.resultFingerprint),
			},
		);
		uiNotify(
			ctx,
			"warning",
			`Stopped the current run after the same tool call produced the same result ${REPEATED_TOOL_RESULT_LIMIT} times.`,
			{ prefix: "damage-control" },
		);
		ctx.abort();
		return decision;
	});

	pi.on("tool_result", (event) => {
		repeatedToolLoop.record(event.toolName, event.input, {
			content: event.content,
			details: event.details,
			isError: event.isError,
		});
	});

	pi.on("session_start", async (_event, ctx) => {
		repeatedToolLoop.reset();
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
			let prompt: DamageControlPromptTrace | undefined;
			if (sequenceDecision.action === "ask" && ctx.hasUI) {
				const approval = {
					rule: sequenceDecision.name,
					reason: sequenceDecision.reason,
				};
				const result = await requestDamageControlApproval(ctx, {
					toolName: "bash",
					rawAction: command,
					approval,
					title: "Confirm dangerous sequence",
					message: sequenceDecision.reason,
					ruleSource: loaded.health.ruleSource,
					toolCallId: event.toolCallId,
				});
				prompt = result.prompt;
				if (result.approved) {
					safeRecordApprovedAsk({
						toolName: "bash",
						rawAction: command,
						cwd: ctx.cwd,
						approval,
						ruleSource: loaded.health.ruleSource,
						toolCallId: event.toolCallId,
						metadata: sequenceDecision.evidence
							? { sequenceEvidence: sequenceDecision.evidence }
							: undefined,
						prompt,
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
				undefined,
				prompt,
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

		const shellEdit = await analyzeUnsafeShellEdit(command, rules.astAnalysis);
		if (shellEdit) {
			recordBlock(
				"bash",
				command,
				ctx.cwd,
				shellEdit,
				ctx.hasUI,
				loaded.health.ruleSource,
				event.toolCallId,
			);
			return shellEdit;
		}

		let askEventId: string | undefined;
		let dangerousPrompt: DamageControlPromptTrace | undefined;
		const dangerous = await evaluateDangerousCommand(
			command,
			rules.dangerous_commands,
			{
				ui: ctx.ui,
				hasUI: ctx.hasUI,
				confirmAsk: async (approval, title, message) => {
					const result = await requestDamageControlApproval(ctx, {
						toolName: "bash",
						rawAction: command,
						approval,
						title,
						message,
						ruleSource: loaded.health.ruleSource,
						toolCallId: event.toolCallId,
					});
					dangerousPrompt = result.prompt;
					return result.approved;
				},
				toolName: "bash",
				astAnalysis: rules.astAnalysis,
				cwd: ctx.cwd,
				noDeletePaths: rules.no_delete_paths,
				onAutoAllowed: (approval) => {
					safeRecordDamageControlEval({
						decisionType: "auto_allowed",
						toolName: "bash",
						rawAction: command,
						cwd: ctx.cwd,
						reason: approval.reason,
						rule: approval.rule,
						ruleSource: loaded.health.ruleSource,
						toolCallId: event.toolCallId,
						hasUI: ctx.hasUI,
						tier: "scoped_delete",
					});
				},
				onAskStart: (approval) => {
					askEventId = startShadowJudge({
						approval,
						command,
						cwd: ctx.cwd,
						modelRegistry: ctx.modelRegistry,
					});
				},
				onAskApproved: (approval) =>
					safeRecordApprovedAsk({
						toolName: "bash",
						rawAction: command,
						cwd: ctx.cwd,
						approval,
						ruleSource: loaded.health.ruleSource,
						toolCallId: event.toolCallId,
						evalEventId: askEventId,
						prompt: dangerousPrompt,
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
				undefined,
				askEventId,
				dangerousPrompt,
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
		let askEventId: string | undefined;
		let dangerousPrompt: DamageControlPromptTrace | undefined;
		const dangerous = await evaluateDangerousCommand(
			command,
			rules.dangerous_commands,
			{
				ui: ctx.ui,
				hasUI: ctx.hasUI,
				confirmAsk: async (approval, title, message) => {
					const result = await requestDamageControlApproval(ctx, {
						toolName: "pwsh",
						rawAction: command,
						approval,
						title,
						message,
						ruleSource: loaded.health.ruleSource,
						toolCallId: event.toolCallId,
					});
					dangerousPrompt = result.prompt;
					return result.approved;
				},
				toolName: "pwsh",
				cwd: ctx.cwd,
				onAskStart: (approval) => {
					askEventId = startShadowJudge({
						approval,
						command,
						cwd: ctx.cwd,
						modelRegistry: ctx.modelRegistry,
					});
				},
				onAskApproved: (approval) =>
					safeRecordApprovedAsk({
						toolName: "pwsh",
						rawAction: command,
						cwd: ctx.cwd,
						approval,
						ruleSource: loaded.health.ruleSource,
						toolCallId: event.toolCallId,
						evalEventId: askEventId,
						prompt: dangerousPrompt,
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
				undefined,
				askEventId,
				dangerousPrompt,
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

		let zeroAccessPrompt: DamageControlPromptTrace | undefined;
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
						confirmAsk: async (approval, title, message) => {
							const result = await requestDamageControlApproval(ctx, {
								toolName: event.toolName,
								rawAction: rawPath,
								approval,
								title,
								message,
								ruleSource: loaded.health.ruleSource,
								toolCallId: event.toolCallId,
								category: "sensitive-data",
							});
							zeroAccessPrompt = result.prompt;
							return result.approved;
						},
						onAskApproved: (approval) =>
							safeRecordApprovedAsk({
								toolName: event.toolName,
								rawAction: rawPath,
								cwd: ctx.cwd,
								approval,
								ruleSource: loaded.health.ruleSource,
								toolCallId: event.toolCallId,
								prompt: zeroAccessPrompt,
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
				undefined,
				undefined,
				zeroAccessPrompt,
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
				const approval = {
					rule: extractRulePattern(readConfirm.reason) ?? "protected read",
					reason: readConfirm.reason,
				};
				const result = await requestDamageControlApproval(ctx, {
					toolName: event.toolName,
					rawAction: rawPath,
					approval,
					title: "Confirm protected read",
					message: readConfirm.reason,
					ruleSource: loaded.health.ruleSource,
					toolCallId: event.toolCallId,
					category: "sensitive-data",
				});
				if (!result.approved) {
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
						undefined,
						undefined,
						result.prompt,
					);
					return decision;
				}
				safeRecordApprovedAsk({
					toolName: event.toolName,
					rawAction: rawPath,
					cwd: ctx.cwd,
					approval,
					ruleSource: loaded.health.ruleSource,
					toolCallId: event.toolCallId,
					prompt: result.prompt,
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
				const approval = {
					rule: extractRulePattern(writeConfirm.reason) ?? "protected write",
					reason: writeConfirm.reason,
				};
				const result = await requestDamageControlApproval(ctx, {
					toolName: event.toolName,
					rawAction: rawPath,
					approval,
					title: "Confirm protected write",
					message: writeConfirm.reason,
					ruleSource: loaded.health.ruleSource,
					toolCallId: event.toolCallId,
					category: "local-state",
				});
				if (!result.approved) {
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
						undefined,
						undefined,
						result.prompt,
					);
					return decision;
				}
				safeRecordApprovedAsk({
					toolName: event.toolName,
					rawAction: rawPath,
					cwd: ctx.cwd,
					approval,
					ruleSource: loaded.health.ruleSource,
					toolCallId: event.toolCallId,
					prompt: result.prompt,
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
