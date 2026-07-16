/**
 * /extension-stats
 *
 * Local copy adapted from:
 * https://github.com/w-winter/dot314/blob/main/extensions/extension-stats.ts
 *
 * Extension & tool usage metrics widget built from Pi session logs (JSONL)
 *
 * Shows rolling lookback windows (1/7/30/90d) with two sections:
 * - aggregates by extension
 * - aggregates by extension/tool or extension/command (native tools are annotated as Pi/<tool>)
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	enumerateJsonlFiles,
	extractEntryUsageTokens,
	extractUsageTokens,
	joinPromptsToNextAssistant,
	readJsonlFile,
	resolveAgentDir,
} from "../lib/session-jsonl.ts";
import { wrapCommandRegistration } from "../lib/slash-command-echo.js";

type MetricMode = "calls" | "tokens";

interface ParsedSession {
	startedAt: Date;
	dayKeyLocal: string;
	toolCalls: number;
	estimatedToolTokens: number;
	callsByToolKey: Map<string, number>; // "owner/tool"
	tokensByToolKey: Map<string, number>; // "owner/tool"
	callsByExtension: Map<string, number>; // "owner"
	tokensByExtension: Map<string, number>; // "owner"
	sessionsByToolKey: Set<string>; // session-level presence
	sessionsByExtension: Set<string>; // session-level presence
}

interface DayAgg {
	date: Date;
	dayKeyLocal: string;
	sessions: number;
	toolCalls: number;
	estimatedToolTokens: number;
	callsByToolKey: Map<string, number>;
	tokensByToolKey: Map<string, number>;
	callsByExtension: Map<string, number>;
	tokensByExtension: Map<string, number>;
	sessionsByToolKey: Map<string, number>;
	sessionsByExtension: Map<string, number>;
}

interface RangeAgg {
	days: DayAgg[];
	dayByKey: Map<string, DayAgg>;
	sessions: number;
	toolCalls: number;
	estimatedToolTokens: number;
	callsByToolKey: Map<string, number>;
	tokensByToolKey: Map<string, number>;
	callsByExtension: Map<string, number>;
	tokensByExtension: Map<string, number>;
	sessionsByToolKey: Map<string, number>;
	sessionsByExtension: Map<string, number>;
}

interface BreakdownData {
	generatedAt: Date;
	ranges: Map<number, RangeAgg>;
	sessionRoot: string;
	ownership: ToolOwnershipDiscovery;
	discoveredOwnerNames: string[];
	ownerDiagnostics: {
		discoveredOwners: number;
		unattributedTools: number;
		packageScanRoots: number;
		unkeyedRouterTraceTurns: number;
	};
}

interface UsageRow {
	name: string;
	calls: number;
	tokens: number;
	sessions: number;
	metricValue: number;
	sharePct: number;
}

interface ToolOwnershipDiscovery {
	ownersByTool: Map<string, Set<string>>;
	ownersByCommand: Map<string, Set<string>>;
	ownerNames: string[];
	packageScanRoots: number;
}

export interface ExtensionUsageSnapshot {
	generatedAt: Date;
	extensions: Map<string, number>;
	commands: Map<string, number>;
	tools: Map<string, number>;
}

const execFileAsync = promisify(execFile);

const RANGE_DAYS = [1, 7, 30, 60, 90] as const;
const DEFAULT_REPORT_DAYS = [1, 7, 30] as const;

const BUILTIN_TOOL_NAMES = new Set([
	"bash",
	"read",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
]);
const LEGACY_TOOL_OWNERS = new Map([
	["search", "Pi"],
	["think", "Pi"],
]);

function requiredRange(
	ranges: ReadonlyMap<number, RangeAgg>,
	days: number,
): RangeAgg {
	const range = ranges.get(days);
	if (!range) throw new Error(`Missing ${days}-day extension stats range`);
	return range;
}

function getExtensionRoot(): string {
	return path.join(resolveAgentDir(), "extensions");
}

function getGlobalSettingsPath(): string {
	return path.join(resolveAgentDir(), "settings.json");
}

function getProjectSettingsPath(cwd: string): string {
	return path.join(cwd, ".pi", "settings.json");
}

function toLocalDayKey(d: Date): string {
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

function localMidnight(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDaysLocal(d: Date, days: number): Date {
	const x = new Date(d);
	x.setDate(x.getDate() + days);
	return x;
}

function parseSessionStartFromFilename(name: string): Date | null {
	const m = name.match(
		/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_/,
	);
	if (!m) return null;
	const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
	const d = new Date(iso);
	return Number.isFinite(d.getTime()) ? d : null;
}

function formatPercent(pct: number): string {
	if (!Number.isFinite(pct) || pct <= 0) return "0%";
	if (pct >= 10) return `${pct.toFixed(0)}%`;
	if (pct >= 1) return `${pct.toFixed(1)}%`;
	return `${pct.toFixed(2)}%`;
}

function formatInt(value: number): string {
	return Math.round(value).toLocaleString("en-US");
}

function formatCompact(value: number): string {
	const n = Math.round(value);
	if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
	if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

function normalizeOwnerName(name: string): string {
	const trimmed = name.trim();
	return trimmed.length > 0 ? trimmed : "unknown-extension";
}

function ownerFromExtensionFilePath(
	filePath: string,
	extensionRoot: string,
): string {
	const relative = path.relative(extensionRoot, filePath).split(path.sep);
	if (relative.length === 0) return "unknown-extension";
	if (relative.length === 1) {
		return normalizeOwnerName(
			path.basename(relative[0], path.extname(relative[0])),
		);
	}
	return normalizeOwnerName(relative[0]);
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCodeFile(fileName: string): boolean {
	return /\.[cm]?[jt]s$/i.test(fileName);
}

function isTestCodeFile(fileName: string): boolean {
	return /\.(test|spec)\.[cm]?[jt]s$/i.test(fileName);
}

function addExtractedToolName(
	names: Set<string>,
	maybeName: string | undefined,
): void {
	if (typeof maybeName !== "string") return;
	const toolName = maybeName.trim();
	if (toolName.length === 0) return;
	names.add(toolName);
}

function extractNameProperty(source: string): string | undefined {
	const m = source.match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/);
	return m?.[1];
}

function extractRegisteredToolNames(source: string): string[] {
	const names = new Set<string>();

	for (const match of source.matchAll(/registerTool\s*\(\s*{[\s\S]*?}\s*\)/g)) {
		addExtractedToolName(names, extractNameProperty(match[0]));
	}

	for (const match of source.matchAll(
		/registerTool\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g,
	)) {
		const variableName = match[1];
		if (!variableName) continue;

		const declarationPattern = new RegExp(
			`(?:const|let|var)\\s+${escapeRegex(variableName)}\\b[\\s\\S]{0,300}?=\\s*{[\\s\\S]{0,12000}?};`,
			"g",
		);
		for (const declaration of source.matchAll(declarationPattern)) {
			addExtractedToolName(names, extractNameProperty(declaration[0]));
		}
	}

	for (const match of source.matchAll(
		/registerTool[\s\S]{0,1800}?\bname\s*:\s*["'`]([^"'`]+)["'`]/g,
	)) {
		addExtractedToolName(names, match[1]);
	}

	return [...names];
}

function extractRegisteredCommandNames(source: string): string[] {
	const names = new Set<string>();
	for (const match of source.matchAll(
		/registerCommand\s*\(\s*["'`]([^"'`]+)["'`]/g,
	)) {
		addExtractedToolName(names, match[1]);
	}
	return [...names];
}

async function walkCodeFiles(
	rootPath: string,
	signal?: AbortSignal,
): Promise<string[]> {
	const files: string[] = [];
	const stack = [rootPath];
	const ignoredNames = new Set([
		"node_modules",
		".git",
		"dist",
		"build",
		"coverage",
		"tmp",
		"tmp-build",
	]);

	while (stack.length > 0) {
		if (signal?.aborted) break;
		const dir = stack.pop();
		if (!dir) continue;
		let entries: Dirent[] = [];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (signal?.aborted) break;
			if (ignoredNames.has(entry.name)) continue;

			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				stack.push(fullPath);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!isCodeFile(entry.name) || isTestCodeFile(entry.name)) continue;
			files.push(fullPath);
		}
	}

	return files;
}

async function pathExists(p: string): Promise<boolean> {
	try {
		await fs.stat(p);
		return true;
	} catch {
		return false;
	}
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
}

function extractPackageSources(settings: unknown): string[] {
	const settingsRecord = asRecord(settings);
	if (!settingsRecord || !Array.isArray(settingsRecord.packages)) return [];
	const out: string[] = [];
	for (const entry of settingsRecord.packages) {
		if (typeof entry === "string") {
			out.push(entry);
			continue;
		}
		const entryRecord = asRecord(entry);
		if (typeof entryRecord?.source === "string") out.push(entryRecord.source);
	}
	return out;
}

function parseNpmPackageNameFromSource(source: string): string | null {
	if (!source.startsWith("npm:")) return null;
	const spec = source.slice("npm:".length).trim();
	if (spec.length === 0) return null;
	const match = spec.match(/^(@?[^@]+(?:\/[^@]+)?)(?:@(.+))?$/);
	if (!match) return spec;
	return match[1] ?? spec;
}

async function resolveGlobalNpmRoot(): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync("npm", ["root", "-g"], {
			timeout: 4000,
		});
		const resolved = stdout.trim();
		return resolved.length > 0 ? resolved : null;
	} catch {
		return null;
	}
}

async function resolvePackageScanRoots(packageRoot: string): Promise<string[]> {
	const packageJsonPath = path.join(packageRoot, "package.json");
	const packageJson = await readJsonFile(packageJsonPath);
	const scanRoots: string[] = [];

	const manifestExtensions = asRecord(packageJson)?.pi;
	const extensionEntries = asRecord(manifestExtensions)?.extensions;
	if (Array.isArray(extensionEntries)) {
		for (const extEntry of extensionEntries) {
			if (typeof extEntry !== "string") continue;
			const resolved = path.resolve(packageRoot, extEntry);
			if (await pathExists(resolved)) scanRoots.push(resolved);
		}
	}

	if (scanRoots.length > 0) {
		return [...new Set(scanRoots)];
	}

	const extensionsDir = path.join(packageRoot, "extensions");
	if (await pathExists(extensionsDir)) {
		return [extensionsDir];
	}

	const fallbackEntries = ["index.ts", "index.js", "main.ts", "main.js"];
	for (const entry of fallbackEntries) {
		const resolved = path.join(packageRoot, entry);
		if (await pathExists(resolved)) {
			scanRoots.push(resolved);
		}
	}

	if (scanRoots.length > 0) {
		return [...new Set(scanRoots)];
	}

	return [packageRoot];
}

async function collectConfiguredNpmPackageTargets(
	cwd: string,
	signal?: AbortSignal,
): Promise<Array<{ owner: string; rootPath: string }>> {
	const globalSettings = await readJsonFile(getGlobalSettingsPath());
	const projectSettings = await readJsonFile(getProjectSettingsPath(cwd));
	const packageSources = [
		...extractPackageSources(globalSettings),
		...extractPackageSources(projectSettings),
	];

	const npmPackageNames = [
		...new Set(
			packageSources
				.map(parseNpmPackageNameFromSource)
				.filter((x): x is string => !!x),
		),
	];
	if (npmPackageNames.length === 0) return [];

	const globalNpmRoot = await resolveGlobalNpmRoot();
	const projectNpmRoot = path.join(cwd, ".pi", "npm", "node_modules");

	const targets: Array<{ owner: string; rootPath: string }> = [];
	for (const packageName of npmPackageNames) {
		if (signal?.aborted) break;

		const candidateRoots = [
			globalNpmRoot ? path.join(globalNpmRoot, packageName) : null,
			path.join(projectNpmRoot, packageName),
		].filter((x): x is string => !!x);

		for (const packageRoot of candidateRoots) {
			if (signal?.aborted) break;
			if (!(await pathExists(packageRoot))) continue;

			const scanRoots = await resolvePackageScanRoots(packageRoot);
			for (const scanRoot of scanRoots) {
				targets.push({ owner: packageName, rootPath: scanRoot });
			}
		}
	}

	const deduped = new Map<string, { owner: string; rootPath: string }>();
	for (const target of targets) {
		deduped.set(`${target.owner}::${target.rootPath}`, target);
	}
	return [...deduped.values()];
}

async function collectOwnersFromRoot(
	ownersByTool: Map<string, Set<string>>,
	ownersByCommand: Map<string, Set<string>>,
	rootPath: string,
	resolveOwner: (filePath: string) => string,
	signal?: AbortSignal,
): Promise<void> {
	if (!(await pathExists(rootPath))) return;

	const stat = await fs.stat(rootPath).catch(() => null);
	if (!stat) return;

	const files = stat.isFile()
		? [rootPath]
		: await walkCodeFiles(rootPath, signal);
	for (const filePath of files) {
		if (signal?.aborted) break;

		let source = "";
		try {
			source = await fs.readFile(filePath, "utf8");
		} catch {
			continue;
		}

		const owner = normalizeOwnerName(resolveOwner(filePath));
		for (const toolName of extractRegisteredToolNames(source)) {
			const set = ownersByTool.get(toolName) ?? new Set<string>();
			set.add(owner);
			ownersByTool.set(toolName, set);
		}
		for (const commandName of extractRegisteredCommandNames(source)) {
			const set = ownersByCommand.get(commandName) ?? new Set<string>();
			set.add(owner);
			ownersByCommand.set(commandName, set);
		}
	}
}

async function discoverExtensionToolOwners(
	cwd: string,
	signal?: AbortSignal,
): Promise<ToolOwnershipDiscovery> {
	const ownersByTool = new Map<string, Set<string>>();
	const ownersByCommand = new Map<string, Set<string>>();

	const extensionRoot = getExtensionRoot();
	await collectOwnersFromRoot(
		ownersByTool,
		ownersByCommand,
		extensionRoot,
		(filePath) => ownerFromExtensionFilePath(filePath, extensionRoot),
		signal,
	);

	const packageTargets = await collectConfiguredNpmPackageTargets(cwd, signal);
	for (const target of packageTargets) {
		if (signal?.aborted) break;
		await collectOwnersFromRoot(
			ownersByTool,
			ownersByCommand,
			target.rootPath,
			() => target.owner,
			signal,
		);
	}

	for (const nativeTool of BUILTIN_TOOL_NAMES) {
		const existing = ownersByTool.get(nativeTool) ?? new Set<string>();
		existing.add("Pi");
		ownersByTool.set(nativeTool, existing);
	}

	const ownerNames = [
		...new Set(
			[...ownersByTool.values(), ...ownersByCommand.values()].flatMap((s) => [
				...s,
			]),
		),
	].sort((a, b) => a.localeCompare(b));

	return {
		ownersByTool,
		ownersByCommand,
		ownerNames,
		packageScanRoots: packageTargets.length,
	};
}

function firstSortedOwner(owners: Set<string> | undefined): string | undefined {
	if (!owners || owners.size === 0) return undefined;
	return [...owners].sort((a, b) => a.localeCompare(b))[0];
}

function resolveToolOwner(
	toolName: string,
	ownersByTool: Map<string, Set<string>>,
): string {
	const directOwner = firstSortedOwner(ownersByTool.get(toolName));
	if (directOwner) return directOwner;

	if (BUILTIN_TOOL_NAMES.has(toolName)) return "Pi";

	const legacyOwner = LEGACY_TOOL_OWNERS.get(toolName);
	if (legacyOwner) return legacyOwner;

	if (toolName.startsWith("mcp__") || toolName.startsWith("server__")) {
		const mcpOwner = firstSortedOwner(ownersByTool.get("mcp"));
		return mcpOwner ?? "pi-mcp-adapter";
	}

	return "unknown-extension";
}

function resolveCommandOwner(
	commandName: string,
	ownersByCommand: Map<string, Set<string>>,
): string {
	return (
		firstSortedOwner(ownersByCommand.get(commandName)) ?? "unknown-extension"
	);
}

function normalizeHistoricalCommandName(commandName: string): string {
	return commandName === "status" ? "usage" : commandName;
}

function parseSlashEchoCommand(content: unknown): string | null {
	if (typeof content !== "string" || !content.startsWith("/")) return null;
	const command = content.slice(1).trim().split(/\s+/, 1)[0];
	return command && command.length > 0
		? normalizeHistoricalCommandName(command)
		: null;
}

function addCommandUsage(
	commandName: string,
	ownersByCommand: Map<string, Set<string>>,
	callsByToolKey: Map<string, number>,
	tokensByToolKey: Map<string, number>,
	callsByExtension: Map<string, number>,
	tokensByExtension: Map<string, number>,
	sessionsByToolKey: Set<string>,
	sessionsByExtension: Set<string>,
	tokens = 0,
): { owner: string; commandKey: string } {
	const owner = resolveCommandOwner(commandName, ownersByCommand);
	const commandKey = `${owner}/${commandName}`;
	callsByToolKey.set(commandKey, (callsByToolKey.get(commandKey) ?? 0) + 1);
	callsByExtension.set(owner, (callsByExtension.get(owner) ?? 0) + 1);
	if (tokens > 0) {
		tokensByToolKey.set(
			commandKey,
			(tokensByToolKey.get(commandKey) ?? 0) + tokens,
		);
		tokensByExtension.set(owner, (tokensByExtension.get(owner) ?? 0) + tokens);
	}
	sessionsByToolKey.add(commandKey);
	sessionsByExtension.add(owner);
	return { owner, commandKey };
}

function toFiniteNumber(value: unknown): number {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}
	if (typeof value === "string") {
		const n = Number(value);
		return Number.isFinite(n) ? n : 0;
	}
	return 0;
}

function estimateTextTokens(text: unknown): number {
	return typeof text === "string" && text.length > 0
		? Math.ceil(text.length / 4)
		: 0;
}

function sha256Hex(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

async function parseSessionFile(
	filePath: string,
	ownersByTool: Map<string, Set<string>>,
	ownersByCommand: Map<string, Set<string>>,
	signal?: AbortSignal,
): Promise<ParsedSession | null> {
	const fileName = path.basename(filePath);
	let startedAt = parseSessionStartFromFilename(fileName);

	const callsByToolKey = new Map<string, number>();
	const tokensByToolKey = new Map<string, number>();
	const callsByExtension = new Map<string, number>();
	const tokensByExtension = new Map<string, number>();
	const sessionsByToolKey = new Set<string>();
	const sessionsByExtension = new Set<string>();
	let toolCalls = 0;
	let estimatedToolTokens = 0;
	const pendingCommandKeys: string[] = [];

	try {
		for await (const { value } of readJsonlFile(filePath, { signal })) {
			if (signal?.aborted) return null;
			const obj = asRecord(value);
			if (!obj) continue;

			if (
				!startedAt &&
				obj.type === "session" &&
				typeof obj.timestamp === "string"
			) {
				const d = new Date(obj.timestamp);
				if (Number.isFinite(d.getTime())) startedAt = d;
				continue;
			}

			if (
				obj.type === "custom_message" &&
				typeof obj.customType === "string" &&
				ownersByCommand.has(obj.customType)
			) {
				const commandName = obj.customType;
				const tokens = estimateTextTokens(obj.content);
				toolCalls += 1;
				estimatedToolTokens += tokens;
				addCommandUsage(
					commandName,
					ownersByCommand,
					callsByToolKey,
					tokensByToolKey,
					callsByExtension,
					tokensByExtension,
					sessionsByToolKey,
					sessionsByExtension,
					tokens,
				);
				continue;
			}

			if (obj.type === "custom_message" && obj.customType === "slash-echo") {
				const commandName = parseSlashEchoCommand(obj.content);
				if (!commandName) continue;
				const { commandKey } = addCommandUsage(
					commandName,
					ownersByCommand,
					callsByToolKey,
					tokensByToolKey,
					callsByExtension,
					tokensByExtension,
					sessionsByToolKey,
					sessionsByExtension,
				);

				toolCalls += 1;
				pendingCommandKeys.push(commandKey);
				continue;
			}

			if (obj.type !== "message") continue;
			const message = asRecord(obj.message);
			if (message?.role !== "assistant" || !Array.isArray(message.content))
				continue;

			const toolNames = message.content
				.map(asRecord)
				.filter(
					(block): block is Record<string, unknown> =>
						block?.type === "toolCall" && typeof block.name === "string",
				)
				.map((block) => String(block.name).trim())
				.filter((name) => name.length > 0);
			if (toolNames.length === 0) continue;

			const usageTokens = extractEntryUsageTokens(obj);
			if (usageTokens > 0 && pendingCommandKeys.length > 0) {
				const tokensPerCommand = usageTokens / pendingCommandKeys.length;
				for (const commandKey of pendingCommandKeys.splice(0)) {
					const owner = commandKey.split("/", 1)[0] || "unknown-extension";
					estimatedToolTokens += tokensPerCommand;
					tokensByToolKey.set(
						commandKey,
						(tokensByToolKey.get(commandKey) ?? 0) + tokensPerCommand,
					);
					tokensByExtension.set(
						owner,
						(tokensByExtension.get(owner) ?? 0) + tokensPerCommand,
					);
				}
			}
			const tokensPerToolCall =
				usageTokens > 0 ? usageTokens / toolNames.length : 0;

			for (const toolName of toolNames) {
				const owner = resolveToolOwner(toolName, ownersByTool);
				const toolKey = `${owner}/${toolName}`;

				toolCalls += 1;
				estimatedToolTokens += tokensPerToolCall;

				callsByToolKey.set(toolKey, (callsByToolKey.get(toolKey) ?? 0) + 1);
				tokensByToolKey.set(
					toolKey,
					(tokensByToolKey.get(toolKey) ?? 0) + tokensPerToolCall,
				);

				callsByExtension.set(owner, (callsByExtension.get(owner) ?? 0) + 1);
				tokensByExtension.set(
					owner,
					(tokensByExtension.get(owner) ?? 0) + tokensPerToolCall,
				);

				sessionsByToolKey.add(toolKey);
				sessionsByExtension.add(owner);
			}
		}
	} catch {
		return null;
	}

	if (!startedAt) return null;

	return {
		startedAt,
		dayKeyLocal: toLocalDayKey(startedAt),
		toolCalls,
		estimatedToolTokens,
		callsByToolKey,
		tokensByToolKey,
		callsByExtension,
		tokensByExtension,
		sessionsByToolKey,
		sessionsByExtension,
	};
}

function buildRangeAgg(days: number, now: Date): RangeAgg {
	const end = localMidnight(now);
	const start = addDaysLocal(end, -(days - 1));
	const outDays: DayAgg[] = [];
	const dayByKey = new Map<string, DayAgg>();

	for (let i = 0; i < days; i++) {
		const d = addDaysLocal(start, i);
		const dayKeyLocal = toLocalDayKey(d);
		const day: DayAgg = {
			date: d,
			dayKeyLocal,
			sessions: 0,
			toolCalls: 0,
			estimatedToolTokens: 0,
			callsByToolKey: new Map(),
			tokensByToolKey: new Map(),
			callsByExtension: new Map(),
			tokensByExtension: new Map(),
			sessionsByToolKey: new Map(),
			sessionsByExtension: new Map(),
		};
		outDays.push(day);
		dayByKey.set(dayKeyLocal, day);
	}

	return {
		days: outDays,
		dayByKey,
		sessions: 0,
		toolCalls: 0,
		estimatedToolTokens: 0,
		callsByToolKey: new Map(),
		tokensByToolKey: new Map(),
		callsByExtension: new Map(),
		tokensByExtension: new Map(),
		sessionsByToolKey: new Map(),
		sessionsByExtension: new Map(),
	};
}

function addSessionToRange(range: RangeAgg, session: ParsedSession): void {
	const day = range.dayByKey.get(session.dayKeyLocal);
	if (!day) return;

	range.sessions += 1;
	range.toolCalls += session.toolCalls;
	range.estimatedToolTokens += session.estimatedToolTokens;
	day.sessions += 1;
	day.toolCalls += session.toolCalls;
	day.estimatedToolTokens += session.estimatedToolTokens;

	for (const [toolKey, calls] of session.callsByToolKey.entries()) {
		range.callsByToolKey.set(
			toolKey,
			(range.callsByToolKey.get(toolKey) ?? 0) + calls,
		);
		day.callsByToolKey.set(
			toolKey,
			(day.callsByToolKey.get(toolKey) ?? 0) + calls,
		);
	}

	for (const [toolKey, tokens] of session.tokensByToolKey.entries()) {
		range.tokensByToolKey.set(
			toolKey,
			(range.tokensByToolKey.get(toolKey) ?? 0) + tokens,
		);
		day.tokensByToolKey.set(
			toolKey,
			(day.tokensByToolKey.get(toolKey) ?? 0) + tokens,
		);
	}

	for (const [owner, calls] of session.callsByExtension.entries()) {
		range.callsByExtension.set(
			owner,
			(range.callsByExtension.get(owner) ?? 0) + calls,
		);
		day.callsByExtension.set(
			owner,
			(day.callsByExtension.get(owner) ?? 0) + calls,
		);
	}

	for (const [owner, tokens] of session.tokensByExtension.entries()) {
		range.tokensByExtension.set(
			owner,
			(range.tokensByExtension.get(owner) ?? 0) + tokens,
		);
		day.tokensByExtension.set(
			owner,
			(day.tokensByExtension.get(owner) ?? 0) + tokens,
		);
	}

	for (const toolKey of session.sessionsByToolKey) {
		range.sessionsByToolKey.set(
			toolKey,
			(range.sessionsByToolKey.get(toolKey) ?? 0) + 1,
		);
		day.sessionsByToolKey.set(
			toolKey,
			(day.sessionsByToolKey.get(toolKey) ?? 0) + 1,
		);
	}

	for (const owner of session.sessionsByExtension) {
		range.sessionsByExtension.set(
			owner,
			(range.sessionsByExtension.get(owner) ?? 0) + 1,
		);
		day.sessionsByExtension.set(
			owner,
			(day.sessionsByExtension.get(owner) ?? 0) + 1,
		);
	}
}

function addTokensToRange(
	range: RangeAgg,
	dayKeyLocal: string,
	owner: string,
	toolKey: string,
	tokens: number,
): void {
	const day = range.dayByKey.get(dayKeyLocal);
	if (!day || tokens <= 0) return;
	range.estimatedToolTokens += tokens;
	day.estimatedToolTokens += tokens;
	range.tokensByToolKey.set(
		toolKey,
		(range.tokensByToolKey.get(toolKey) ?? 0) + tokens,
	);
	day.tokensByToolKey.set(
		toolKey,
		(day.tokensByToolKey.get(toolKey) ?? 0) + tokens,
	);
	range.tokensByExtension.set(
		owner,
		(range.tokensByExtension.get(owner) ?? 0) + tokens,
	);
	day.tokensByExtension.set(
		owner,
		(day.tokensByExtension.get(owner) ?? 0) + tokens,
	);
}

interface TraceTokenAttribution {
	promptHashTimes: Map<string, number[]>;
	unkeyedTurns: number;
}

async function addPromptRouterTraceTokensToRanges(
	ranges: Map<number, RangeAgg>,
	signal?: AbortSignal,
): Promise<TraceTokenAttribution> {
	const result: TraceTokenAttribution = {
		promptHashTimes: new Map(),
		unkeyedTurns: 0,
	};
	const traceRoot = path.join(resolveAgentDir(), "traces");
	if (!(await pathExists(traceRoot))) return result;
	const traceFiles = await enumerateJsonlFiles(traceRoot, signal);
	for (const filePath of traceFiles) {
		if (signal?.aborted) return result;
		const byTurn = new Map<
			string,
			{ routedAt?: Date; tokens: number; promptHash?: string }
		>();
		for await (const { value } of readJsonlFile(filePath, { signal })) {
			const obj = asRecord(value);
			if (!obj) continue;
			const turnId =
				typeof obj.turn_id === "string" ? obj.turn_id : "turn-unknown";
			const current = byTurn.get(turnId) ?? { tokens: 0 };
			if (obj.event_type === "routing_decision") {
				const routedAt = new Date(String(obj.timestamp ?? ""));
				if (Number.isFinite(routedAt.getTime())) current.routedAt = routedAt;
				const promptHash = asRecord(obj.payload)?.prompt_hash;
				if (typeof promptHash === "string") current.promptHash = promptHash;
			}
			if (obj.event_type === "assistant_message")
				current.tokens += extractUsageTokens(asRecord(obj.payload)?.usage);
			byTurn.set(turnId, current);
		}
		for (const { routedAt, tokens, promptHash } of byTurn.values()) {
			if (!routedAt || tokens <= 0) continue;
			if (!promptHash) {
				result.unkeyedTurns += 1;
				continue;
			}
			const times = result.promptHashTimes.get(promptHash) ?? [];
			times.push(routedAt.getTime());
			result.promptHashTimes.set(promptHash, times);
			const sessionDay = localMidnight(routedAt);
			const dayKey = toLocalDayKey(routedAt);
			for (const d of RANGE_DAYS) {
				const range = ranges.get(d);
				if (!range) continue;
				const start = range.days[0].date;
				const end = range.days[range.days.length - 1].date;
				if (sessionDay < start || sessionDay > end) continue;
				addTokensToRange(
					range,
					dayKey,
					"prompt-router",
					"prompt-router/route",
					tokens,
				);
			}
		}
	}
	return result;
}

async function readPromptRouterHashes(
	cwd: string,
	signal?: AbortSignal,
): Promise<Set<string>> {
	const logPath = path.join(
		cwd,
		"pi",
		"prompt-routing",
		"logs",
		"routing_log.jsonl",
	);
	const hashes = new Set<string>();
	if (!(await pathExists(logPath))) return hashes;
	for await (const { value } of readJsonlFile(logPath, { signal })) {
		const obj = asRecord(value);
		if (typeof obj?.prompt_hash === "string") hashes.add(obj.prompt_hash);
	}
	return hashes;
}

async function addPromptRouterSessionTokensToRanges(
	ranges: Map<number, RangeAgg>,
	cwd: string,
	sessionFiles: string[],
	excludedPromptHashTimes: ReadonlyMap<string, number[]> = new Map(),
	signal?: AbortSignal,
): Promise<void> {
	const hashes = await readPromptRouterHashes(cwd, signal);
	if (hashes.size === 0) return;
	const remainingExcluded = new Map(
		[...excludedPromptHashTimes].map(([hash, times]) => [hash, [...times]]),
	);
	for (const filePath of sessionFiles) {
		if (signal?.aborted) return;
		for await (const joined of joinPromptsToNextAssistant(filePath, {
			signal,
		})) {
			const hash = sha256Hex(joined.userText.trim());
			if (!hashes.has(hash) || joined.usageTokens <= 0) continue;
			const timestamp = joined.userEntry.timestamp;
			const routedAt =
				typeof timestamp === "string" ? new Date(timestamp) : null;
			const remaining = remainingExcluded.get(hash) ?? [];
			if (
				routedAt &&
				Number.isFinite(routedAt.getTime()) &&
				remaining.length > 0
			) {
				let nearestIndex = 0;
				for (let index = 1; index < remaining.length; index += 1)
					if (
						Math.abs(remaining[index] - routedAt.getTime()) <
						Math.abs(remaining[nearestIndex] - routedAt.getTime())
					)
						nearestIndex = index;
				if (Math.abs(remaining[nearestIndex] - routedAt.getTime()) <= 600_000) {
					remaining.splice(nearestIndex, 1);
					remainingExcluded.set(hash, remaining);
					continue;
				}
			}
			if (!routedAt || !Number.isFinite(routedAt.getTime())) continue;
			const sessionDay = localMidnight(routedAt);
			const dayKey = toLocalDayKey(routedAt);
			for (const d of RANGE_DAYS) {
				const range = requiredRange(ranges, d);
				const start = range.days[0].date;
				const end = range.days[range.days.length - 1].date;
				if (sessionDay < start || sessionDay > end) continue;
				addTokensToRange(
					range,
					dayKey,
					"prompt-router",
					"prompt-router/route",
					joined.usageTokens,
				);
			}
		}
	}
}

async function addPromptRouterEventsToRanges(
	ranges: Map<number, RangeAgg>,
	cwd: string,
	signal?: AbortSignal,
): Promise<void> {
	const logPath = path.join(
		cwd,
		"pi",
		"prompt-routing",
		"logs",
		"routing_log.jsonl",
	);
	if (!(await pathExists(logPath))) return;

	for await (const { value } of readJsonlFile(logPath, { signal })) {
		const ts = toFiniteNumber(asRecord(value)?.ts);
		if (ts <= 0) continue;
		const startedAt = new Date(ts * 1000);
		if (!Number.isFinite(startedAt.getTime())) continue;
		const session: ParsedSession = {
			startedAt,
			dayKeyLocal: toLocalDayKey(startedAt),
			toolCalls: 1,
			estimatedToolTokens: 0,
			callsByToolKey: new Map([["prompt-router/route", 1]]),
			tokensByToolKey: new Map(),
			callsByExtension: new Map([["prompt-router", 1]]),
			tokensByExtension: new Map(),
			sessionsByToolKey: new Set(["prompt-router/route"]),
			sessionsByExtension: new Set(["prompt-router"]),
		};
		const sessionDay = localMidnight(startedAt);
		for (const d of RANGE_DAYS) {
			const range = requiredRange(ranges, d);
			const start = range.days[0].date;
			const end = range.days[range.days.length - 1].date;
			if (sessionDay < start || sessionDay > end) continue;
			addSessionToRange(range, session);
		}
	}
}

function resolveEffectiveMetric(
	mode: MetricMode,
	totalTokens: number,
): MetricMode {
	if (mode === "tokens" && totalTokens <= 0) return "calls";
	return mode;
}

function sumValues(map: Map<string, number>): number {
	let total = 0;
	for (const value of map.values()) total += value;
	return total;
}

function buildUsageRows(
	callsMap: Map<string, number>,
	tokensMap: Map<string, number>,
	sessionsMap: Map<string, number>,
	metric: MetricMode,
): UsageRow[] {
	const keys = new Set([
		...callsMap.keys(),
		...tokensMap.keys(),
		...sessionsMap.keys(),
	]);
	const totalCalls = sumValues(callsMap);
	const totalTokens = sumValues(tokensMap);
	const effectiveMetric = resolveEffectiveMetric(metric, totalTokens);
	const metricTotal = effectiveMetric === "tokens" ? totalTokens : totalCalls;

	const rows: UsageRow[] = [];
	for (const key of keys) {
		const calls = callsMap.get(key) ?? 0;
		const tokens = tokensMap.get(key) ?? 0;
		const sessions = sessionsMap.get(key) ?? 0;
		const metricValue = effectiveMetric === "tokens" ? tokens : calls;
		rows.push({
			name: key,
			calls,
			tokens,
			sessions,
			metricValue,
			sharePct: metricTotal > 0 ? (metricValue / metricTotal) * 100 : 0,
		});
	}

	rows.sort((a, b) => {
		if (b.metricValue !== a.metricValue) return b.metricValue - a.metricValue;
		if (b.calls !== a.calls) return b.calls - a.calls;
		return a.name.localeCompare(b.name);
	});

	return rows;
}

function rangeSummary(range: RangeAgg, days: number): string {
	const extCount = [...range.callsByExtension.values()].filter(
		(x) => x > 0,
	).length;
	const toolCount = [...range.callsByToolKey.values()].filter(
		(x) => x > 0,
	).length;
	return `Last ${days} days: ${range.sessions} sessions; ${range.toolCalls} tool calls; ~${formatCompact(range.estimatedToolTokens)} tool-call tokens; ${extCount} extensions; ${toolCount} extension/tools`;
}

async function computeBreakdown(
	pi: ExtensionAPI,
	cwd: string,
	sessionRoot: string,
	signal?: AbortSignal,
): Promise<BreakdownData> {
	const now = new Date();
	const ranges = new Map<number, RangeAgg>();
	for (const d of RANGE_DAYS) ranges.set(d, buildRangeAgg(d, now));

	const maxRange = Math.max(...RANGE_DAYS);
	const maxRangeAgg = requiredRange(ranges, maxRange);
	const startMaxRange = maxRangeAgg.days[0].date;

	const ownership = await discoverExtensionToolOwners(cwd, signal);
	const ownersByTool = ownership.ownersByTool;

	const files = await enumerateJsonlFiles(sessionRoot, signal);

	const candidates: string[] = [];
	for (const filePath of files) {
		if (signal?.aborted) break;

		const startedAt = parseSessionStartFromFilename(path.basename(filePath));
		if (startedAt) {
			if (localMidnight(startedAt) < startMaxRange) continue;
			candidates.push(filePath);
			continue;
		}

		try {
			const st = await fs.stat(filePath);
			const approx = new Date(st.mtimeMs);
			if (localMidnight(approx) < startMaxRange) continue;
			candidates.push(filePath);
		} catch {
			// noop
		}
	}

	for (const filePath of candidates) {
		if (signal?.aborted) break;
		const session = await parseSessionFile(
			filePath,
			ownersByTool,
			ownership.ownersByCommand,
			signal,
		);
		if (!session) continue;

		const sessionDay = localMidnight(session.startedAt);
		for (const d of RANGE_DAYS) {
			const range = requiredRange(ranges, d);
			const start = range.days[0].date;
			const end = range.days[range.days.length - 1].date;
			if (sessionDay < start || sessionDay > end) continue;
			addSessionToRange(range, session);
		}
	}

	await addPromptRouterEventsToRanges(ranges, cwd, signal);
	const traceTokens = await addPromptRouterTraceTokensToRanges(ranges, signal);
	await addPromptRouterSessionTokensToRanges(
		ranges,
		cwd,
		candidates,
		traceTokens.promptHashTimes,
		signal,
	);

	const allToolNames = new Set(pi.getAllTools().map((t) => t.name));
	const unattributedTools = [...allToolNames].filter(
		(name) => resolveToolOwner(name, ownersByTool) === "unknown-extension",
	).length;

	return {
		generatedAt: now,
		ranges,
		sessionRoot,
		ownership,
		discoveredOwnerNames: ownership.ownerNames,
		ownerDiagnostics: {
			discoveredOwners: ownership.ownerNames.length,
			unattributedTools,
			packageScanRoots: ownership.packageScanRoots,
			unkeyedRouterTraceTurns: traceTokens.unkeyedTurns,
		},
	};
}

export async function collectExtensionUsageSnapshot(
	pi: ExtensionAPI,
	cwd: string,
	sessionRoot: string,
	signal?: AbortSignal,
): Promise<ExtensionUsageSnapshot> {
	const data = await computeBreakdown(pi, cwd, sessionRoot, signal);
	const range = requiredRange(data.ranges, 30);
	const commands = new Map<string, number>();
	for (const commandName of data.ownership.ownersByCommand.keys()) {
		const owner = resolveCommandOwner(
			commandName,
			data.ownership.ownersByCommand,
		);
		const key = `${owner}/${commandName}`;
		commands.set(key, range.callsByToolKey.get(key) ?? 0);
	}
	const tools = new Map<string, number>();
	for (const toolName of data.ownership.ownersByTool.keys()) {
		const owner = resolveToolOwner(toolName, data.ownership.ownersByTool);
		const key = `${owner}/${toolName}`;
		tools.set(key, range.callsByToolKey.get(key) ?? 0);
	}
	const extensions = new Map<string, number>();
	for (const owner of data.ownership.ownerNames)
		extensions.set(owner, range.callsByExtension.get(owner) ?? 0);
	for (const [owner, calls] of range.callsByExtension)
		if (!extensions.has(owner)) extensions.set(owner, calls);
	return {
		generatedAt: data.generatedAt,
		extensions,
		commands,
		tools,
	};
}

function displayOwnerName(owner: string): string {
	return owner === "codex-status" ? "usage" : owner;
}

function displayUsageName(name: string): string {
	const withoutNativePrefix = name.startsWith("Pi/")
		? name.slice("Pi/".length)
		: name;
	const slashIndex = withoutNativePrefix.indexOf("/");
	if (slashIndex < 0) return displayOwnerName(withoutNativePrefix);
	return `${displayOwnerName(withoutNativePrefix.slice(0, slashIndex))}${withoutNativePrefix.slice(slashIndex)}`;
}

function markdownUsageTable(rows: UsageRow[]): string[] {
	if (rows.length === 0) return ["_No usage found._"];
	return [
		"| Name | Calls | Est. tool-call tokens | Sessions | Share |",
		"|---|---:|---:|---:|---:|",
		...rows.map(
			(row) =>
				`| ${displayUsageName(row.name)} | ${formatInt(row.calls)} | ${formatInt(row.tokens)} | ${formatInt(row.sessions)} | ${formatPercent(row.sharePct)} |`,
		),
	];
}

function isHiddenCoreToolRow(row: UsageRow): boolean {
	return ["Pi/bash", "Pi/read", "Pi/edit", "Pi/write"].includes(row.name);
}

function hiddenCoreToolNote(rows: UsageRow[]): string {
	const hiddenRows = rows.filter(isHiddenCoreToolRow);
	const hiddenCalls = hiddenRows.reduce((sum, row) => sum + row.calls, 0);
	const hiddenSharePct = hiddenRows.reduce((sum, row) => sum + row.sharePct, 0);
	const hiddenNames = hiddenRows
		.map((row) => displayUsageName(row.name))
		.join(", ");
	return hiddenRows.length > 0
		? `Note: ${hiddenNames} calls are not displayed but are ${formatPercent(hiddenSharePct)} of calls (${formatInt(hiddenCalls)} calls).`
		: "";
}

function parseReportDays(args: string): number[] {
	const requested = new Set<number>(DEFAULT_REPORT_DAYS);
	const tokens = args
		.trim()
		.split(/\s+/)
		.map((token) => token.replace(/^--?/, ""))
		.filter((token) => token.length > 0);

	for (const token of tokens) {
		if (token === "60") requested.add(60);
		if (token === "90") requested.add(90);
		if (token === "all") {
			requested.add(60);
			requested.add(90);
		}
	}

	return RANGE_DAYS.filter((days) => requested.has(days));
}

function renderMarkdownReport(
	data: BreakdownData,
	reportDays: number[],
): string {
	const lines = [
		`Generated: ${data.generatedAt.toISOString()}`,
		`Sessions directory: ${data.sessionRoot}`,
		`Attribution: extension/tool for extension-registered tools, Pi/tool for native tools (${data.ownerDiagnostics.unattributedTools} unattributed active tools, ${data.ownerDiagnostics.packageScanRoots} package scan roots).`,
		`Router token fallback: ${data.ownerDiagnostics.unkeyedRouterTraceTurns} unkeyed trace turn${data.ownerDiagnostics.unkeyedRouterTraceTurns === 1 ? "" : "s"} excluded from trace-token attribution and reconciled from session evidence when available.`,
	];

	for (const days of reportDays) {
		const range = requiredRange(data.ranges, days);
		const effectiveMetric: MetricMode = "calls";
		const extensionRows = buildUsageRows(
			range.callsByExtension,
			range.tokensByExtension,
			range.sessionsByExtension,
			effectiveMetric,
		);
		const toolRows = buildUsageRows(
			range.callsByToolKey,
			range.tokensByToolKey,
			range.sessionsByToolKey,
			effectiveMetric,
		);

		const visibleToolRows = toolRows.filter((row) => !isHiddenCoreToolRow(row));
		const coreToolNote = hiddenCoreToolNote(toolRows);
		lines.push(
			`\n## Last ${days} days`,
			rangeSummary(range, days),
			"\n### By extension",
			...markdownUsageTable(extensionRows),
			"\n### By extension/tool or command",
			...markdownUsageTable(visibleToolRows),
			...(coreToolNote ? ["", coreToolNote] : []),
		);
	}

	const maxRange = Math.max(...reportDays);
	const maxRangeAgg = requiredRange(data.ranges, maxRange);
	const usedOwners = new Set(maxRangeAgg.callsByExtension.keys());
	const unusedOwners = data.discoveredOwnerNames.filter(
		(owner) => owner !== "Pi" && !usedOwners.has(owner),
	);
	lines.push(
		"\n## Unused extensions",
		unusedOwners.length > 0
			? unusedOwners.map((owner) => `- ${displayOwnerName(owner)}`).join("\n")
			: "_None discovered._",
	);

	return lines.join("\n");
}

export default function extensionStatsExtension(pi: ExtensionAPI) {
	wrapCommandRegistration(pi);
	pi.registerCommand("extension-stats", {
		description:
			"Dump last 1/7/30 days of ~/.pi session tool/command usage; pass 60, 90, or all to include longer windows",
		handler: async (args, ctx: ExtensionContext) => {
			const reportDays = parseReportDays(args);
			const data = await computeBreakdown(
				pi,
				ctx.cwd,
				ctx.sessionManager.getSessionDir(),
			);
			pi.sendMessage(
				{
					customType: "extension-stats",
					content: renderMarkdownReport(data, reportDays),
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});
}
