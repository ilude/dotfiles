export const SESSION_BUDGET_DEFAULTS = {
	enabled: true,
	maxSameAgentSpawns: 1,
	maxCommandErrorRepeats: 3,
} as const;

export interface SessionBudgetConfig {
	enabled: boolean;
	maxSameAgentSpawns: number;
	maxCommandErrorRepeats: number;
}

export type SessionBudgetSensor = "repeat_spawn" | "command_error_repeat";
export type SessionBudgetLevel = "soft" | "hard";
export type SessionBudgetMetric = "same_agent_spawns" | "command_errors";

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

function readPositiveInteger(
	settings: Record<string, unknown>,
	key: string,
	fallback: number,
): number {
	const value = settings[key];
	if (value === undefined) return fallback;
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value <= 0 ||
		!Number.isInteger(value)
	) {
		throw new Error(`sessionBudget.${key} must be a positive integer`);
	}
	return value;
}

export function parseSessionBudgetConfig(value: unknown): SessionBudgetConfig {
	const settings = requireObject(value);
	return {
		enabled: readBoolean(settings, "enabled", SESSION_BUDGET_DEFAULTS.enabled),
		maxSameAgentSpawns: readPositiveInteger(
			settings,
			"maxSameAgentSpawns",
			SESSION_BUDGET_DEFAULTS.maxSameAgentSpawns,
		),
		maxCommandErrorRepeats: readPositiveInteger(
			settings,
			"maxCommandErrorRepeats",
			SESSION_BUDGET_DEFAULTS.maxCommandErrorRepeats,
		),
	};
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
			this.epoch.toolCalls += 1;
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
			repeat_spawn: state("repeat_spawn"),
			command_error_repeat: state("command_error_repeat"),
		};
	}
}
