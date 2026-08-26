import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	defaultAnalyticsDatabase,
	openAnalyticsStore,
	selectAnalytics,
	type AnalyticsOperationOptions,
} from "./api.ts";
import { definitionFor } from "./registry.ts";
import type { SourceDefinition } from "./store.ts";
import { enumerateJsonlFiles, resolveAgentDir } from "../session-jsonl.ts";

export type SessionSkillEvidenceSource =
	| "explicit_slash_command"
	| "prompt_skill_inventory"
	| "expanded_skill_block"
	| "historical_explicit_prompt"
	| "manual_read_candidate"
	| "unknown";

export interface SessionSkillEvidence {
	skill: string;
	source: SessionSkillEvidenceSource;
	timestamp: Date;
	turnKey: string;
	candidate: boolean;
}

export interface SessionAnalyticsEvent {
	sessionId: string;
	eventId: string;
	line: number;
	timestamp: Date;
	startedAt: Date;
	eventType?: string;
	customType?: string;
	slashCommand?: string;
	customMessageTokens: number;
	role?: string;
	toolNames: string[];
	usageTokens: number;
	skillEvidence: SessionSkillEvidence[];
}

export interface ReadSessionAnalyticsOptions {
	sessionRoot: string;
	databaseRoot?: string;
	files?: readonly string[];
	signal?: AbortSignal;
	diagnostics?: Map<string, number>;
}

type SessionProjection = Record<string, unknown>;

interface EncodedSessionEvent {
	startedAt: string | null;
	sessionStartedAt?: string;
	customType?: string;
	slashCommand?: string;
	customMessageTokens?: number;
	role?: string;
	toolNames?: string[];
	usageTokens?: number;
	skillEvidence?: Array<{
		skill: string;
		source: SessionSkillEvidenceSource;
		timestamp: string;
		turnKey: string;
		candidate: boolean;
	}>;
}

const VALID_SOURCES = new Set<SessionSkillEvidenceSource>([
	"explicit_slash_command",
	"prompt_skill_inventory",
	"expanded_skill_block",
	"historical_explicit_prompt",
	"manual_read_candidate",
	"unknown",
]);

const SESSION_PAGE_SIZE = 1000;
const SESSION_COLUMNS = [
	"event_id",
	"timestamp",
	"session_id",
	"turn_id",
	"event_type",
	"event_name",
	"tool_name",
	"input_tokens",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function finiteNumber(value: unknown): number {
	if (typeof value !== "number" && typeof value !== "string") return 0;
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}

function parseDate(value: unknown): Date | null {
	const raw = asString(value);
	if (!raw) return null;
	const date = new Date(raw);
	return Number.isFinite(date.getTime()) ? date : null;
}

function safeLabel(value: string): string {
	return (
		[...value]
			.filter((character) => {
				const code = character.charCodeAt(0);
				return code >= 32 && code !== 127;
			})
			.join("")
			.replace(/[|`[\]<>]/g, "_")
			.replace(/[\\/]+/g, "/")
			.slice(0, 80) || "unknown"
	);
}

function extractUsageTokens(entry: Record<string, unknown>): number {
	const message = isRecord(entry.message) ? entry.message : undefined;
	const usage = isRecord(entry.usage)
		? entry.usage
		: message && isRecord(message.usage)
			? message.usage
			: undefined;
	if (!usage) return 0;
	return [
		usage.input,
		usage.output,
		usage.cacheRead,
		usage.cacheWrite,
		usage["gen_ai.usage.input_tokens"],
		usage["gen_ai.usage.output_tokens"],
		usage["gen_ai.usage.cache_read_tokens"],
		usage["gen_ai.usage.cache_write_tokens"],
	].reduce((total: number, value) => total + finiteNumber(value), 0);
}

function estimateTextTokens(value: unknown): number {
	return typeof value === "string" && value.length > 0
		? Math.ceil(value.length / 4)
		: 0;
}

function fileTime(file: string): Date {
	const match = path
		.basename(file)
		.match(/^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2})-([0-9]{2})-([0-9]{2})-([0-9]{3})Z/);
	if (!match) return new Date(0);
	return new Date(
		`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`,
	);
}

async function countMalformedJsonLines(
	files: readonly string[],
	diagnostics: Map<string, number> | undefined,
): Promise<void> {
	if (!diagnostics) return;
	let count = diagnostics.get("malformed_json") ?? 0;
	for (const file of files) {
		try {
			const content = await fs.readFile(file, "utf8");
			for (const line of content.split(/\r?\n/)) {
				if (!line.trim()) continue;
				try {
					JSON.parse(line);
				} catch {
					count += 1;
				}
			}
		} catch {
			continue;
		}
	}
	if (count > 0) diagnostics.set("malformed_json", count);
}

function sessionIdFor(file: string): string {
	return createHash("sha256").update(path.resolve(file)).digest("hex").slice(0, 20);
}

function eventIdFor(sessionId: string, line: number): string {
	return `${sessionId}:${String(line).padStart(12, "0")}`;
}

function textValues(entry: Record<string, unknown>, message: Record<string, unknown> | undefined): string[] {
	const values = [entry.text, entry.content].filter(
		(value): value is string => typeof value === "string",
	);
	if (message?.role !== "user") return values;
	if (typeof message.content === "string") values.push(message.content);
	if (!Array.isArray(message.content)) return values;
	for (const block of message.content) {
		if (!isRecord(block) || typeof block.text !== "string") continue;
		values.push(block.text);
	}
	return values;
}

function projectSkillEvidence(
	entry: Record<string, unknown>,
	line: number,
	fallback: Date,
): EncodedSessionEvent["skillEvidence"] {
	const evidence: NonNullable<EncodedSessionEvent["skillEvidence"]> = [];
	const timestamp = parseDate(entry.timestamp) ?? fallback;
	const data = isRecord(entry.data) ? entry.data : undefined;
	if (entry.type === "custom" && entry.customType === "skill-load" && data) {
		const skill = asString(data.skill);
		const sourceValue = asString(data.source);
		const source = sourceValue as SessionSkillEvidenceSource | undefined;
		const eventTimestamp = parseDate(data.timestamp) ?? timestamp;
		if (skill && eventTimestamp && (!source || VALID_SOURCES.has(source))) {
			evidence.push({
				skill: safeLabel(skill),
				source: source || "unknown",
				timestamp: eventTimestamp.toISOString(),
				turnKey: asString(data.turnId) || String(line),
				candidate:
					source === "manual_read_candidate" ||
					source === "prompt_skill_inventory",
			});
		}
	}

	const message = isRecord(entry.message) ? entry.message : undefined;
	for (const text of textValues(entry, message)) {
		for (const match of text.matchAll(/<skill\s+name=["']([^"']+)["']/gi))
			evidence.push({
				skill: safeLabel(match[1]),
				source: "expanded_skill_block",
				timestamp: timestamp.toISOString(),
				turnKey: String(line),
				candidate: false,
			});
		for (const match of text.matchAll(/(?:^|\s)\/skill:([A-Za-z0-9_-]+)/g))
			evidence.push({
				skill: safeLabel(match[1]),
				source: "historical_explicit_prompt",
				timestamp: timestamp.toISOString(),
				turnKey: String(line),
				candidate: false,
			});
	}

	const blocks = Array.isArray(message?.content)
		? message.content.filter(isRecord)
		: [];
	for (const toolRecord of [entry, ...blocks]) {
		const toolName = asString(toolRecord.toolName) || asString(toolRecord.name);
		const args = isRecord(toolRecord.args)
			? toolRecord.args
			: isRecord(toolRecord.parameters)
				? toolRecord.parameters
				: isRecord(toolRecord.arguments)
					? toolRecord.arguments
					: undefined;
		const filePath = args
			? asString(args.path) || asString(args.file_path)
			: undefined;
		if (
			toolName === "read" &&
			filePath &&
			/(^|[\\/])SKILL\.md$/i.test(filePath)
		) {
			evidence.push({
				skill: safeLabel(path.basename(path.dirname(filePath))),
				source: "manual_read_candidate",
				timestamp: timestamp.toISOString(),
				turnKey: String(line),
				candidate: true,
			});
		}
	}
	return evidence.length > 0 ? evidence : undefined;
}

function projectionFor(
	value: unknown,
	line: number,
	source: string,
	fallback: Date,
): SessionProjection | undefined {
	if (!isRecord(value)) return undefined;
	const sessionId = sessionIdFor(source);
	const timestamp = parseDate(value.timestamp) ?? fallback;
	const message = isRecord(value.message) ? value.message : undefined;
	const blocks = Array.isArray(message?.content)
		? message.content.filter(isRecord)
		: [];
	const toolNames =
		message?.role === "assistant"
			? blocks
					.filter(
						(block) =>
							block.type === "toolCall" && typeof block.name === "string",
					)
					.map((block) => String(block.name).trim())
					.filter((name) => name.length > 0)
			: [];
	const customType = asString(value.customType);
	const slashCommand =
		value.type === "custom_message" && customType === "slash-echo" &&
			typeof value.content === "string"
			? value.content.match(/^\/([A-Za-z0-9_-]+)(?:\s|$)/)?.[1]
			: undefined;
	const encoded: EncodedSessionEvent = {
		startedAt: fileTime(source).toISOString(),
		...(value.type === "session" && timestamp.getTime() > 0
			? { sessionStartedAt: timestamp.toISOString() }
			: {}),
		...(customType ? { customType: customType.slice(0, 120) } : {}),
		...(slashCommand ? { slashCommand } : {}),
		...(value.type === "custom_message"
			? { customMessageTokens: estimateTextTokens(value.content) }
			: {}),
		...(typeof message?.role === "string" ? { role: message.role } : {}),
		...(toolNames.length > 0 ? { toolNames } : {}),
		...(message?.role === "assistant"
			? { usageTokens: extractUsageTokens(value) }
			: {}),
		...(projectSkillEvidence(value, line, timestamp)
			? { skillEvidence: projectSkillEvidence(value, line, timestamp) }
			: {}),
	};
	return {
		event_id: eventIdFor(sessionId, line),
		timestamp: timestamp.toISOString(),
		session_id: sessionId,
		turn_id: asString(value.turnId) || asString(value.turn_id) || null,
		event_type: asString(value.type) || null,
		event_name: JSON.stringify(encoded),
		tool_name: toolNames[0] || null,
		input_tokens: extractUsageTokens(value) || null,
	};
}

function sessionDefinition(
	root: string,
): SourceDefinition<SessionProjection> {
	const base = definitionFor("session_events", root);
	if (!base) throw new Error("session_events analytics source is unavailable");
	return {
		...base,
		parse: (value, line, source) =>
			projectionFor(value, line, source, fileTime(source)),
	};
}

function decodeEvidence(value: unknown): SessionSkillEvidence[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (!isRecord(item)) return [];
		const skill = asString(item.skill);
		const source = asString(item.source) as SessionSkillEvidenceSource | undefined;
		const timestamp = parseDate(item.timestamp);
		const turnKey = asString(item.turnKey);
		if (!skill || !timestamp || !turnKey || !source || !VALID_SOURCES.has(source))
			return [];
		return [{
			skill,
			source,
			timestamp,
			turnKey,
			candidate: item.candidate === true,
		}];
	});
}

function decodeRow(row: Record<string, unknown>): SessionAnalyticsEvent | null {
	const sessionId = asString(row.session_id);
	const eventId = asString(row.event_id);
	const timestamp = parseDate(row.timestamp);
	if (!sessionId || !eventId || !timestamp) return null;
	let encoded: EncodedSessionEvent = { startedAt: null };
	if (typeof row.event_name === "string") {
		try {
			const parsed = JSON.parse(row.event_name) as unknown;
			if (isRecord(parsed)) encoded = parsed as unknown as EncodedSessionEvent;
		} catch {
			return null;
		}
	}
	const startedAt = parseDate(encoded.sessionStartedAt) ?? parseDate(encoded.startedAt) ?? timestamp;
	const toolNames = Array.isArray(encoded.toolNames)
		? encoded.toolNames.filter((name): name is string => typeof name === "string")
		: [];
	const lineMatch = eventId.match(/:([0-9]+)$/);
	return {
		sessionId,
		eventId,
		line: lineMatch ? Number(lineMatch[1]) : 0,
		timestamp,
		startedAt,
		eventType: asString(row.event_type),
		customType: encoded.customType,
		slashCommand: encoded.slashCommand,
		customMessageTokens: finiteNumber(encoded.customMessageTokens),
		role: encoded.role,
		toolNames,
		usageTokens: finiteNumber(encoded.usageTokens) || finiteNumber(row.input_tokens),
		skillEvidence: decodeEvidence(encoded.skillEvidence),
	};
}

async function readAllRows(
	store: Awaited<ReturnType<typeof openAnalyticsStore>>,
	options: AnalyticsOperationOptions,
): Promise<Record<string, unknown>[]> {
	const rows: Record<string, unknown>[] = [];
	let cursor: string | undefined;
	while (true) {
		const page = await selectAnalytics(
			store,
			{
				source: "session_events",
				columns: SESSION_COLUMNS,
				filters: cursor
					? [{ column: "event_id", op: "gt", value: cursor }]
					: undefined,
				orderBy: [{ column: "event_id", direction: "asc" }],
				limit: SESSION_PAGE_SIZE,
			},
			options,
		);
		rows.push(...page);
		if (page.length < SESSION_PAGE_SIZE) return rows;
		const next = asString(page[page.length - 1]?.event_id);
		if (!next || next === cursor) return rows;
		cursor = next;
	}
}

export async function readSessionAnalytics(
	options: ReadSessionAnalyticsOptions,
): Promise<SessionAnalyticsEvent[]> {
	if (options.signal?.aborted) return [];
	const files = options.files
		? [...options.files]
		: await enumerateJsonlFiles(options.sessionRoot, options.signal);
	if (options.signal?.aborted) return [];
	await countMalformedJsonLines(files, options.diagnostics);
	const store = await openAnalyticsStore(
		defaultAnalyticsDatabase(options.databaseRoot ?? resolveAgentDir()),
	);
	try {
		try {
			await store.refresh(sessionDefinition(options.sessionRoot), files, {
				signal: options.signal,
			});
		} catch (error) {
			if (!(error instanceof Error) || !error.message.includes("malformed analytics JSONL"))
				throw error;

		}
		const rows = await readAllRows(store, { signal: options.signal });
		const events = rows
			.map(decodeRow)
			.filter((event): event is SessionAnalyticsEvent => event !== null);
		const sessionStarts = new Map<string, Date>();
		for (const event of events) {
			if (event.eventType === "session") sessionStarts.set(event.sessionId, event.timestamp);
		}
		for (const event of events)
			event.startedAt = sessionStarts.get(event.sessionId) ?? event.startedAt;
		return events;
	} finally {
		await store.close();
	}
}
