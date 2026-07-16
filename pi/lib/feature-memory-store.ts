import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { redactTaskText } from "./task-security.js";

export const FEATURE_MEMORY_SCHEMA_VERSION = 1;
export const FEATURE_EVENT_KINDS = [
	"decision",
	"evidence",
	"open_question",
	"supersession",
] as const;
export type FeatureEventKind = (typeof FEATURE_EVENT_KINDS)[number];

export interface FeatureDefinition {
	title: string;
	dossierPath: string;
	promptTriggers: string[];
	pathTriggers: string[];
}

export interface FeatureRegistry {
	schemaVersion: 1;
	features: Record<string, FeatureDefinition>;
	repoRoot: string;
	registryPath: string;
}

export interface FeatureMemoryEvent {
	schemaVersion: 1;
	eventId: string;
	recordedAt: string;
	featureId: string;
	kind: FeatureEventKind;
	summary: string;
	sourcePaths: string[];
}

export interface LoadRegistryOptions {
	registryPath?: string;
	repoRoot?: string;
}

const FEATURE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_REGISTRY_BYTES = 64 * 1024;
const MAX_DOSSIER_BYTES = 24 * 1024;
const MAX_EVENT_FILE_READ_BYTES = 256 * 1024;
const DEFAULT_EVENT_LIMIT = 8;
const MAX_EVENT_LIMIT = 20;
const MAX_SUMMARY_LENGTH = 600;
const MAX_SOURCE_PATHS = 12;
const MAX_SOURCE_PATH_LENGTH = 240;
const ALLOWED_REGISTRY_KEYS = ["schemaVersion", "features"];
const ALLOWED_FEATURE_KEYS = [
	"title",
	"dossierPath",
	"promptTriggers",
	"pathTriggers",
];
const ALLOWED_EVENT_KEYS = [
	"schemaVersion",
	"eventId",
	"recordedAt",
	"featureId",
	"kind",
	"summary",
	"sourcePaths",
];

function defaultRegistryPath(): string {
	return path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"../feature-memory.json",
	);
}

function fail(message: string): never {
	throw new Error(`Invalid feature memory configuration: ${message}`);
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		fail(`${label} must be an object`);
	return value as Record<string, unknown>;
}

const rejectUnknownKeys = (
	value: Record<string, unknown>,
	allowed: string[],
	label: string,
): void => {
	const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unknown.length > 0)
		fail(`${label} has unknown field ${unknown.sort()[0]}`);
};

const requiredString = (value: unknown, label: string): string => {
	if (typeof value !== "string" || value.trim() === "")
		fail(`${label} must be a non-empty string`);
	return value;
};

function nonEmptyArray(value: unknown, label: string): Array<unknown> {
	if (!Array.isArray(value) || value.length === 0)
		fail(`${label} must be a non-empty string array`);
	return value;
}

function rejectDuplicateStrings(values: string[], label: string): void {
	const normalized = new Set(values.map((value) => value.toLowerCase()));
	if (normalized.size !== values.length)
		fail(`${label} must not contain duplicates`);
}

function stringArray(value: unknown, label: string): string[] {
	const result = nonEmptyArray(value, label).map((item, index) =>
		requiredString(item, `${label}[${index}]`),
	);
	rejectDuplicateStrings(result, label);
	return result;
}

function normalizeRepoPath(value: string, label: string): string {
	const normalized = value.replaceAll("\\", "/");
	if (
		path.isAbsolute(value) ||
		normalized.startsWith("/") ||
		normalized.split("/").some((part) => part === ".." || part === ".")
	)
		fail(`${label} must be a normalized repo-relative path`);
	return normalized;
}

function isContained(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	return (
		relative === "" ||
		(!relative.startsWith(`..${path.sep}`) && relative !== "..")
	);
}

const validateRegistryLocation = async (
	repoRoot: string,
	registryPath: string,
): Promise<void> => {
	if (!isContained(repoRoot, registryPath))
		fail("registry escapes the repository");
	let realRoot: string;
	let realRegistry: string;
	try {
		[realRoot, realRegistry] = await Promise.all([
			fs.realpath(repoRoot),
			fs.realpath(registryPath),
		]);
	} catch (error) {
		fail(`registry cannot be resolved: ${String(error)}`);
	}
	if (!isContained(realRoot, realRegistry))
		fail("registry resolves outside the repository");
	const stat = await fs.stat(realRegistry);
	if (!stat.isFile()) fail("registry must be a file");
	if (stat.size > MAX_REGISTRY_BYTES)
		fail(`registry exceeds ${MAX_REGISTRY_BYTES} bytes`);
};

async function validateDossier(
	repoRoot: string,
	featureId: string,
	dossierPath: string,
): Promise<void> {
	const lexicalPath = path.resolve(repoRoot, dossierPath);
	if (!isContained(repoRoot, lexicalPath))
		fail(`feature ${featureId} dossier escapes the repository`);
	let realRoot: string;
	let realDossier: string;
	try {
		[realRoot, realDossier] = await Promise.all([
			fs.realpath(repoRoot),
			fs.realpath(lexicalPath),
		]);
	} catch (error) {
		fail(`feature ${featureId} dossier cannot be resolved: ${String(error)}`);
	}
	if (!isContained(realRoot, realDossier))
		fail(`feature ${featureId} dossier resolves outside the repository`);
	const stat = await fs.stat(realDossier);
	if (!stat.isFile()) fail(`feature ${featureId} dossier must be a file`);
	if (stat.size > MAX_DOSSIER_BYTES)
		fail(`feature ${featureId} dossier exceeds ${MAX_DOSSIER_BYTES} bytes`);
}

function parseFeature(featureId: string, value: unknown): FeatureDefinition {
	if (!FEATURE_ID_PATTERN.test(featureId))
		fail(`invalid feature ID ${featureId}`);
	const record = objectRecord(value, `feature ${featureId}`);
	rejectUnknownKeys(record, ALLOWED_FEATURE_KEYS, `feature ${featureId}`);
	const dossierPath = normalizeRepoPath(
		requiredString(record.dossierPath, `feature ${featureId}.dossierPath`),
		`feature ${featureId}.dossierPath`,
	);
	return {
		title: requiredString(record.title, `feature ${featureId}.title`),
		dossierPath,
		promptTriggers: stringArray(
			record.promptTriggers,
			`feature ${featureId}.promptTriggers`,
		),
		pathTriggers: stringArray(
			record.pathTriggers,
			`feature ${featureId}.pathTriggers`,
		).map((trigger, index) =>
			normalizeRepoPath(trigger, `feature ${featureId}.pathTriggers[${index}]`),
		),
	};
}

function resolveRegistryPaths(options: LoadRegistryOptions): {
	repoRoot: string;
	registryPath: string;
} {
	const registryPath = path.resolve(
		options.registryPath ?? defaultRegistryPath(),
	);
	return {
		repoRoot: path.resolve(
			options.repoRoot ?? path.dirname(path.dirname(registryPath)),
		),
		registryPath,
	};
}

async function readRegistryJson(registryPath: string): Promise<unknown> {
	try {
		return JSON.parse(await fs.readFile(registryPath, "utf8"));
	} catch (error) {
		fail(`cannot read registry ${registryPath}: ${String(error)}`);
	}
}

function registryFeatures(value: unknown): Record<string, unknown> {
	const record = objectRecord(value, "registry");
	rejectUnknownKeys(record, ALLOWED_REGISTRY_KEYS, "registry");
	if (record.schemaVersion !== FEATURE_MEMORY_SCHEMA_VERSION)
		fail(`schemaVersion must be ${FEATURE_MEMORY_SCHEMA_VERSION}`);
	const features = objectRecord(record.features, "registry.features");
	if (Object.keys(features).length === 0)
		fail("registry.features must not be empty");
	return features;
}

async function loadValidatedFeatures(
	repoRoot: string,
	rawFeatures: Record<string, unknown>,
): Promise<Record<string, FeatureDefinition>> {
	const features: Record<string, FeatureDefinition> = {};
	for (const featureId of Object.keys(rawFeatures).sort()) {
		const feature = parseFeature(featureId, rawFeatures[featureId]);
		await validateDossier(repoRoot, featureId, feature.dossierPath);
		features[featureId] = feature;
	}
	return features;
}

export async function loadFeatureRegistry(
	options: LoadRegistryOptions = {},
): Promise<FeatureRegistry> {
	const { repoRoot, registryPath } = resolveRegistryPaths(options);
	await validateRegistryLocation(repoRoot, registryPath);
	const rawFeatures = registryFeatures(await readRegistryJson(registryPath));
	const features = await loadValidatedFeatures(repoRoot, rawFeatures);
	return { schemaVersion: 1, features, repoRoot, registryPath };
}

export function matchFeatureIds(
	registry: FeatureRegistry,
	prompt: string,
): string[] {
	const normalizedPrompt = prompt.toLowerCase().replaceAll("\\", "/");
	return Object.entries(registry.features)
		.filter(
			([, feature]) =>
				feature.promptTriggers.some((trigger) =>
					normalizedPrompt.includes(trigger.toLowerCase()),
				) ||
				feature.pathTriggers.some((trigger) =>
					normalizedPrompt.includes(trigger.toLowerCase()),
				),
		)
		.map(([featureId]) => featureId)
		.sort();
}

export function featureMemoryEventsPath(): string {
	const root = process.env.PI_FEATURE_MEMORY_DIR?.trim();
	return path.resolve(
		root || path.join(homedir(), ".pi/agent/feature-memory"),
		"events.jsonl",
	);
}

function sanitizeText(value: string, maximum: number, label: string): string {
	const sanitized = Array.from(redactTaskText(value), (character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127 ? " " : character;
	})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	if (sanitized === "") throw new Error(`${label} must not be empty`);
	return sanitized.slice(0, maximum);
}

export function createFeatureMemoryEvent(input: {
	featureId: string;
	kind: FeatureEventKind;
	summary: string;
	sourcePaths: string[];
}): FeatureMemoryEvent {
	if (!FEATURE_EVENT_KINDS.includes(input.kind))
		throw new Error("Unknown feature event kind");
	return {
		schemaVersion: 1,
		eventId: randomUUID(),
		recordedAt: new Date().toISOString(),
		featureId: sanitizeText(input.featureId, 80, "featureId"),
		kind: input.kind,
		summary: sanitizeText(input.summary, MAX_SUMMARY_LENGTH, "summary"),
		sourcePaths: input.sourcePaths
			.slice(0, MAX_SOURCE_PATHS)
			.map((sourcePath) =>
				normalizeRepoPath(
					sanitizeText(sourcePath, MAX_SOURCE_PATH_LENGTH, "sourcePath"),
					"sourcePath",
				),
			),
	};
}

function eventKindIsValid(value: unknown): boolean {
	if (typeof value !== "string") return false;
	for (const kind of FEATURE_EVENT_KINDS) {
		if (kind === value) return true;
	}
	return false;
}

const hasEventStringFields = (record: Record<string, unknown>): boolean => {
	if (
		typeof record.eventId !== "string" ||
		typeof record.recordedAt !== "string" ||
		typeof record.featureId !== "string" ||
		typeof record.summary !== "string"
	)
		return false;
	return true;
};

function validEvent(value: unknown): FeatureMemoryEvent {
	const record = objectRecord(value, "local feature event");
	rejectUnknownKeys(record, ALLOWED_EVENT_KEYS, "local feature event");
	if (
		record.schemaVersion !== 1 ||
		!hasEventStringFields(record) ||
		!eventKindIsValid(record.kind) ||
		!Array.isArray(record.sourcePaths) ||
		!record.sourcePaths.every((item) => typeof item === "string")
	)
		throw new Error("Invalid local feature event schema");
	return record as unknown as FeatureMemoryEvent;
}

export async function appendFeatureMemoryEvent(
	event: FeatureMemoryEvent,
	eventsPath = featureMemoryEventsPath(),
): Promise<void> {
	const checked = validEvent(event);
	await withFileMutationQueue(eventsPath, async () => {
		await fs.mkdir(path.dirname(eventsPath), { recursive: true, mode: 0o700 });
		await fs.appendFile(eventsPath, `${JSON.stringify(checked)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
	});
}

async function readEventTail(eventsPath: string): Promise<string> {
	let handle: fs.FileHandle | undefined;
	try {
		handle = await fs.open(eventsPath, "r");
		const stat = await handle.stat();
		const length = Math.min(stat.size, MAX_EVENT_FILE_READ_BYTES);
		const buffer = Buffer.alloc(length);
		await handle.read(buffer, 0, length, stat.size - length);
		const text = buffer.toString("utf8");
		return stat.size > length ? text.slice(text.indexOf("\n") + 1) : text;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
		throw error;
	} finally {
		await handle?.close();
	}
}

export async function readRecentFeatureEvents(
	featureId: string,
	options: { eventsPath?: string; limit?: number } = {},
): Promise<FeatureMemoryEvent[]> {
	const limit = Math.max(
		0,
		Math.min(options.limit ?? DEFAULT_EVENT_LIMIT, MAX_EVENT_LIMIT),
	);
	if (limit === 0) return [];
	const text = await readEventTail(
		options.eventsPath ?? featureMemoryEventsPath(),
	);
	return text
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => validEvent(JSON.parse(line)))
		.filter((event) => event.featureId === featureId)
		.slice(-limit);
}

export async function buildFeatureContext(
	registry: FeatureRegistry,
	featureId: string,
	options: { eventsPath?: string; eventLimit?: number } = {},
): Promise<string> {
	const feature = registry.features[featureId];
	if (!feature) throw new Error(`Unknown feature ID: ${featureId}`);
	const dossier = await fs.readFile(
		path.resolve(registry.repoRoot, feature.dossierPath),
		"utf8",
	);
	const events = await readRecentFeatureEvents(featureId, {
		eventsPath: options.eventsPath,
		limit: options.eventLimit,
	});
	const eventText = events.length
		? events
				.map(
					(event) =>
						`- ${event.recordedAt} [${event.kind}] ${event.summary}${event.sourcePaths.length ? ` (sources: ${event.sourcePaths.join(", ")})` : ""}`,
				)
				.join("\n")
		: "- None recorded.";
	return `Feature context: ${feature.title} (${featureId})\nThis context is bounded background information. It is non-authoritative: verify it against the current repository and current user instructions. Local events may be stale; prefer later supersession events and current tracked evidence.\n\nTracked dossier (${feature.dossierPath}):\n${dossier.trim()}\n\nRecent local events:\n${eventText}`;
}
