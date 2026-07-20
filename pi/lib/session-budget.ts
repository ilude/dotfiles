export const SESSION_BUDGET_DEFAULTS = {
	enabled: true,
	softToolCalls: 25,
	hardToolCalls: 60,
	softMinutes: 10,
	hardMinutes: 30,
	maxSameAgentSpawns: 1,
	maxCommandErrorRepeats: 3,
} as const;

export interface SessionBudgetConfig {
	enabled: boolean;
	softToolCalls: number;
	hardToolCalls: number;
	softMinutes: number;
	hardMinutes: number;
	maxSameAgentSpawns: number;
	maxCommandErrorRepeats: number;
}

export type SessionBudgetSensor =
	| "budget"
	| "repeat_spawn"
	| "command_error_repeat";
export type SessionBudgetLevel = "soft" | "hard";
export type SessionBudgetMetric =
	| "tool_calls"
	| "minutes"
	| "same_agent_spawns"
	| "command_errors";

export interface SessionBudgetFinding {
	sensor: SessionBudgetSensor;
	level: SessionBudgetLevel;
	metric: SessionBudgetMetric;
	measured: number;
	threshold: number;
	epochId: string;
}

export type SessionBudgetEvent =
	| {
			type: "epoch_start";
			epochId: string;
			prompt: string;
			timestamp: number;
	  }
	| {
			type: "tool_call";
			toolName: string;
			timestamp: number;
			waitPollKey?: string;
			touchedPaths?: string[];
	  }
	| {
			type: "spawn";
			agentType: string;
			promptHash: string;
			timestamp: number;
	  }
	| {
			type: "command_result";
			command: string;
			ok: boolean;
			timestamp: number;
			errorSignature?: string;
	  };

export interface SessionBudgetSensorState {
	softTriggered: boolean;
	hardTriggered: boolean;
	acknowledged: boolean;
}

export interface SessionBudgetSnapshot {
	epochId?: string;
	prompt?: string;
	startedAt?: number;
	elapsedMinutes: number;
	toolCalls: number;
	filesTouched: string[];
	spawns: Array<{ agentType: string; count: number }>;
	maxCommandErrorRepeats: number;
	sensors: Record<SessionBudgetSensor, SessionBudgetSensorState>;
}

interface EpochState {
	id: string;
	prompt: string;
	startedAt: number;
	toolCalls: number;
	filesTouched: Set<string>;
	seenWaitPollKeys: Set<string>;
	spawnCounts: Map<string, number>;
	spawnTypes: Map<string, number>;
	commandErrorStreak?: {
		command: string;
		errorSignature: string;
		count: number;
	};
	emitted: Set<string>;
	acknowledged: Set<SessionBudgetSensor>;
}

const MINUTE_MS = 60_000;

function requireObject(value: unknown): Record<string, unknown> {
	if (value === undefined) return {};
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("sessionBudget must be an object");
	}
	return value as Record<string, unknown>;
}

function readBoolean(
	settings: Record<string, unknown>,
	key: string,
	fallback: boolean,
): boolean {
	const value = settings[key];
	if (value === undefined) return fallback;
	if (typeof value !== "boolean")
		throw new Error(`sessionBudget.${key} must be a boolean`);
	return value;
}

function readPositiveNumber(
	settings: Record<string, unknown>,
	key: string,
	fallback: number,
	integer: boolean,
): number {
	const value = settings[key];
	if (value === undefined) return fallback;
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value <= 0 ||
		(integer && !Number.isInteger(value))
	) {
		throw new Error(
			`sessionBudget.${key} must be a positive ${integer ? "integer" : "number"}`,
		);
	}
	return value;
}

export function parseSessionBudgetConfig(value: unknown): SessionBudgetConfig {
	const settings = requireObject(value);
	const config: SessionBudgetConfig = {
		enabled: readBoolean(settings, "enabled", SESSION_BUDGET_DEFAULTS.enabled),
		softToolCalls: readPositiveNumber(
			settings,
			"softToolCalls",
			SESSION_BUDGET_DEFAULTS.softToolCalls,
			true,
		),
		hardToolCalls: readPositiveNumber(
			settings,
			"hardToolCalls",
			SESSION_BUDGET_DEFAULTS.hardToolCalls,
			true,
		),
		softMinutes: readPositiveNumber(
			settings,
			"softMinutes",
			SESSION_BUDGET_DEFAULTS.softMinutes,
			false,
		),
		hardMinutes: readPositiveNumber(
			settings,
			"hardMinutes",
			SESSION_BUDGET_DEFAULTS.hardMinutes,
			false,
		),
		maxSameAgentSpawns: readPositiveNumber(
			settings,
			"maxSameAgentSpawns",
			SESSION_BUDGET_DEFAULTS.maxSameAgentSpawns,
			true,
		),
		maxCommandErrorRepeats: readPositiveNumber(
			settings,
			"maxCommandErrorRepeats",
			SESSION_BUDGET_DEFAULTS.maxCommandErrorRepeats,
			true,
		),
	};
	if (config.hardToolCalls <= config.softToolCalls) {
		throw new Error(
			"sessionBudget.hardToolCalls must be greater than softToolCalls",
		);
	}
	if (config.hardMinutes <= config.softMinutes) {
		throw new Error(
			"sessionBudget.hardMinutes must be greater than softMinutes",
		);
	}
	return config;
}

function findingKey(sensor: SessionBudgetSensor, level: SessionBudgetLevel) {
	return `${sensor}:${level}`;
}

export class SessionBudgetTracker {
	private epoch: EpochState | undefined;

	constructor(readonly config: SessionBudgetConfig) {}

	process(event: SessionBudgetEvent): SessionBudgetFinding[] {
		if (event.type === "epoch_start") {
			this.epoch = {
				id: event.epochId,
				prompt: event.prompt,
				startedAt: event.timestamp,
				toolCalls: 0,
				filesTouched: new Set(),
				seenWaitPollKeys: new Set(),
				spawnCounts: new Map(),
				spawnTypes: new Map(),
				emitted: new Set(),
				acknowledged: new Set(),
			};
			return [];
		}
		if (!this.epoch) return [];

		const findings: SessionBudgetFinding[] = [];
		if (event.type === "tool_call") {
			const repeatedWaitPoll =
				Boolean(event.waitPollKey) &&
				this.epoch.seenWaitPollKeys.has(event.waitPollKey as string);
			if (event.waitPollKey) this.epoch.seenWaitPollKeys.add(event.waitPollKey);
			if (!repeatedWaitPoll) this.epoch.toolCalls += 1;
			for (const filePath of event.touchedPaths ?? []) {
				if (filePath) this.epoch.filesTouched.add(filePath);
			}
		}
		if (event.type === "spawn") {
			const key = `${event.agentType}\0${event.promptHash}`;
			const count = (this.epoch.spawnCounts.get(key) ?? 0) + 1;
			this.epoch.spawnCounts.set(key, count);
			this.epoch.spawnTypes.set(
				event.agentType,
				(this.epoch.spawnTypes.get(event.agentType) ?? 0) + 1,
			);
			const threshold = this.config.maxSameAgentSpawns + 1;
			if (count >= threshold) {
				this.addFinding(findings, {
					sensor: "repeat_spawn",
					level: "hard",
					metric: "same_agent_spawns",
					measured: count,
					threshold,
				});
			}
		}
		if (event.type === "command_result") {
			if (event.ok || !event.errorSignature) {
				this.epoch.commandErrorStreak = undefined;
			} else {
				const previous = this.epoch.commandErrorStreak;
				const count =
					previous?.command === event.command &&
					previous.errorSignature === event.errorSignature
						? previous.count + 1
						: 1;
				this.epoch.commandErrorStreak = {
					command: event.command,
					errorSignature: event.errorSignature,
					count,
				};
				const softThreshold = this.config.maxCommandErrorRepeats;
				const hardThreshold = softThreshold + 2;
				if (count >= hardThreshold) {
					this.addFinding(findings, {
						sensor: "command_error_repeat",
						level: "hard",
						metric: "command_errors",
						measured: count,
						threshold: hardThreshold,
					});
				} else if (count >= softThreshold) {
					this.addFinding(findings, {
						sensor: "command_error_repeat",
						level: "soft",
						metric: "command_errors",
						measured: count,
						threshold: softThreshold,
					});
				}
			}
		}

		this.addBudgetFindings(findings, event.timestamp);
		return findings;
	}

	acknowledge(sensor: SessionBudgetSensor): void {
		this.epoch?.acknowledged.add(sensor);
	}

	snapshot(timestamp: number): SessionBudgetSnapshot {
		if (!this.epoch) {
			return {
				elapsedMinutes: 0,
				toolCalls: 0,
				filesTouched: [],
				spawns: [],
				maxCommandErrorRepeats: 0,
				sensors: this.sensorStates(undefined),
			};
		}
		return {
			epochId: this.epoch.id,
			prompt: this.epoch.prompt,
			startedAt: this.epoch.startedAt,
			elapsedMinutes: Math.max(0, timestamp - this.epoch.startedAt) / MINUTE_MS,
			toolCalls: this.epoch.toolCalls,
			filesTouched: [...this.epoch.filesTouched].sort(),
			spawns: [...this.epoch.spawnTypes.entries()]
				.map(([agentType, count]) => ({ agentType, count }))
				.sort((a, b) => a.agentType.localeCompare(b.agentType)),
			maxCommandErrorRepeats: this.epoch.commandErrorStreak?.count ?? 0,
			sensors: this.sensorStates(this.epoch),
		};
	}

	private addBudgetFindings(
		findings: SessionBudgetFinding[],
		timestamp: number,
	): void {
		if (!this.epoch) return;
		const minutes = Math.max(0, timestamp - this.epoch.startedAt) / MINUTE_MS;
		if (
			this.epoch.toolCalls >= this.config.hardToolCalls ||
			minutes >= this.config.hardMinutes
		) {
			const byCalls = this.epoch.toolCalls >= this.config.hardToolCalls;
			this.addFinding(findings, {
				sensor: "budget",
				level: "hard",
				metric: byCalls ? "tool_calls" : "minutes",
				measured: byCalls ? this.epoch.toolCalls : minutes,
				threshold: byCalls
					? this.config.hardToolCalls
					: this.config.hardMinutes,
			});
		} else if (
			this.epoch.toolCalls >= this.config.softToolCalls ||
			minutes >= this.config.softMinutes
		) {
			const byCalls = this.epoch.toolCalls >= this.config.softToolCalls;
			this.addFinding(findings, {
				sensor: "budget",
				level: "soft",
				metric: byCalls ? "tool_calls" : "minutes",
				measured: byCalls ? this.epoch.toolCalls : minutes,
				threshold: byCalls
					? this.config.softToolCalls
					: this.config.softMinutes,
			});
		}
	}

	private addFinding(
		findings: SessionBudgetFinding[],
		finding: Omit<SessionBudgetFinding, "epochId">,
	): void {
		if (!this.epoch || this.epoch.acknowledged.has(finding.sensor)) return;
		const key = findingKey(finding.sensor, finding.level);
		if (this.epoch.emitted.has(key)) return;
		this.epoch.emitted.add(key);
		findings.push({ ...finding, epochId: this.epoch.id });
	}

	private sensorStates(
		epoch: EpochState | undefined,
	): Record<SessionBudgetSensor, SessionBudgetSensorState> {
		const state = (sensor: SessionBudgetSensor): SessionBudgetSensorState => ({
			softTriggered: epoch?.emitted.has(findingKey(sensor, "soft")) ?? false,
			hardTriggered: epoch?.emitted.has(findingKey(sensor, "hard")) ?? false,
			acknowledged: epoch?.acknowledged.has(sensor) ?? false,
		});
		return {
			budget: state("budget"),
			repeat_spawn: state("repeat_spawn"),
			command_error_repeat: state("command_error_repeat"),
		};
	}
}
