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
 *
 * Controls:
 * - m: toggle calls vs token-estimate attribution
 * - e/t: focus extensions vs tools table
 * - ↑/↓: page active table
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { BorderedLoader } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, type Component, type TUI, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, type Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";

type MetricMode = "calls" | "tokens";
type TableSection = "extensions" | "tools";

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
	discoveredOwnerNames: string[];
	ownerDiagnostics: {
		discoveredOwners: number;
		unattributedTools: number;
		packageScanRoots: number;
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

interface TableRenderResult {
	lines: string[];
	offset: number;
	totalRows: number;
}

const execFileAsync = promisify(execFile);

const RANGE_DAYS = [1, 7, 30, 60, 90] as const;
const DEFAULT_REPORT_DAYS = [1, 7, 30] as const;
const PAGE_SIZE = 10;

const BUILTIN_TOOL_NAMES = new Set(["bash", "read", "edit", "write", "grep", "find", "ls"]);
const LEGACY_TOOL_OWNERS = new Map([
	["search", "Pi"],
	["think", "Pi"],
]);

function getAgentDir(): string {
	return process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
}

function getSessionRoot(): string {
	return path.join(getAgentDir(), "sessions");
}

function getExtensionRoot(): string {
	return path.join(getAgentDir(), "extensions");
}

function getGlobalSettingsPath(): string {
	return path.join(getAgentDir(), "settings.json");
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
	const m = name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_/);
	if (!m) return null;
	const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
	const d = new Date(iso);
	return Number.isFinite(d.getTime()) ? d : null;
}

function padRight(s: string, n: number): string {
	const delta = n - s.length;
	return delta > 0 ? s + " ".repeat(delta) : s;
}

function padLeft(s: string, n: number): string {
	const delta = n - s.length;
	return delta > 0 ? " ".repeat(delta) + s : s;
}

function dim(text: string): string {
	return `\x1b[2m${text}\x1b[0m`;
}

function bold(text: string): string {
	return `\x1b[1m${text}\x1b[0m`;
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

function sortMapByValueDesc<K extends string>(m: Map<K, number>): Array<{ key: K; value: number }> {
	return [...m.entries()]
		.map(([key, value]) => ({ key, value }))
		.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}

function normalizeOwnerName(name: string): string {
	const trimmed = name.trim();
	return trimmed.length > 0 ? trimmed : "unknown-extension";
}

function ownerFromExtensionFilePath(filePath: string, extensionRoot: string): string {
	const relative = path.relative(extensionRoot, filePath).split(path.sep);
	if (relative.length === 0) return "unknown-extension";
	if (relative.length === 1) {
		return normalizeOwnerName(path.basename(relative[0], path.extname(relative[0])));
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

function addExtractedToolName(names: Set<string>, maybeName: string | undefined): void {
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

	for (const match of source.matchAll(/registerTool\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
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

	for (const match of source.matchAll(/registerTool[\s\S]{0,1800}?\bname\s*:\s*["'`]([^"'`]+)["'`]/g)) {
		addExtractedToolName(names, match[1]);
	}

	return [...names];
}

function extractRegisteredCommandNames(source: string): string[] {
	const names = new Set<string>();
	for (const match of source.matchAll(/registerCommand\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
		addExtractedToolName(names, match[1]);
	}
	return [...names];
}

async function walkCodeFiles(rootPath: string, signal?: AbortSignal): Promise<string[]> {
	const files: string[] = [];
	const stack = [rootPath];
	const ignoredNames = new Set(["node_modules", ".git", "dist", "build", "coverage", "tmp", "tmp-build"]);

	while (stack.length > 0) {
		if (signal?.aborted) break;
		const dir = stack.pop()!;
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

async function readJsonFile(filePath: string): Promise<any | null> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function extractPackageSources(settings: any): string[] {
	if (!settings || !Array.isArray(settings.packages)) return [];
	const out: string[] = [];
	for (const entry of settings.packages) {
		if (typeof entry === "string") {
			out.push(entry);
			continue;
		}
		if (entry && typeof entry === "object" && typeof entry.source === "string") {
			out.push(entry.source);
		}
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
		const { stdout } = await execFileAsync("npm", ["root", "-g"], { timeout: 4000 });
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

	const manifestExtensions = packageJson?.pi?.extensions;
	if (Array.isArray(manifestExtensions)) {
		for (const extEntry of manifestExtensions) {
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
	const packageSources = [...extractPackageSources(globalSettings), ...extractPackageSources(projectSettings)];

	const npmPackageNames = [...new Set(packageSources.map(parseNpmPackageNameFromSource).filter((x): x is string => !!x))];
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

	const files = stat.isFile() ? [rootPath] : await walkCodeFiles(rootPath, signal);
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

async function discoverExtensionToolOwners(cwd: string, signal?: AbortSignal): Promise<ToolOwnershipDiscovery> {
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
		await collectOwnersFromRoot(ownersByTool, ownersByCommand, target.rootPath, () => target.owner, signal);
	}

	for (const nativeTool of BUILTIN_TOOL_NAMES) {
		const existing = ownersByTool.get(nativeTool) ?? new Set<string>();
		existing.add("Pi");
		ownersByTool.set(nativeTool, existing);
	}

	const ownerNames = [...new Set([...ownersByTool.values(), ...ownersByCommand.values()].flatMap((s) => [...s]))].sort((a, b) =>
		a.localeCompare(b),
	);

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

function resolveToolOwner(toolName: string, ownersByTool: Map<string, Set<string>>): string {
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

function resolveCommandOwner(commandName: string, ownersByCommand: Map<string, Set<string>>): string {
	return firstSortedOwner(ownersByCommand.get(commandName)) ?? "unknown-extension";
}

function normalizeHistoricalCommandName(commandName: string): string {
	if (commandName === "status") return "usage";
	if (commandName === "usage") return "usage-stats";
	return commandName;
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
		tokensByToolKey.set(commandKey, (tokensByToolKey.get(commandKey) ?? 0) + tokens);
		tokensByExtension.set(owner, (tokensByExtension.get(owner) ?? 0) + tokens);
	}
	sessionsByToolKey.add(commandKey);
	sessionsByExtension.add(owner);
	return { owner, commandKey };
}

async function walkSessionFiles(root: string, signal?: AbortSignal): Promise<string[]> {
	const out: string[] = [];
	const stack: string[] = [root];
	while (stack.length) {
		if (signal?.aborted) break;
		const dir = stack.pop()!;
		let entries: Dirent[] = [];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const ent of entries) {
			if (signal?.aborted) break;
			const p = path.join(dir, ent.name);
			if (ent.isDirectory()) {
				stack.push(p);
			} else if (ent.isFile() && ent.name.endsWith(".jsonl")) {
				out.push(p);
			}
		}
	}
	return out;
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

function extractMessageUsage(obj: any): any {
	return obj?.usage ?? obj?.message?.usage;
}

function extractUsageTokens(usage: any): number {
	if (!usage) return 0;
	const input = toFiniteNumber(usage.input);
	const output = toFiniteNumber(usage.output);
	const cacheRead = toFiniteNumber(usage.cacheRead);
	const cacheWrite = toFiniteNumber(usage.cacheWrite);
	const otelInput = toFiniteNumber(usage["gen_ai.usage.input_tokens"]);
	const otelOutput = toFiniteNumber(usage["gen_ai.usage.output_tokens"]);
	const otelCacheRead = toFiniteNumber(usage["gen_ai.usage.cache_read_tokens"]);
	const otelCacheWrite = toFiniteNumber(usage["gen_ai.usage.cache_write_tokens"]);
	return input + output + cacheRead + cacheWrite + otelInput + otelOutput + otelCacheRead + otelCacheWrite;
}

function estimateTextTokens(text: unknown): number {
	return typeof text === "string" && text.length > 0 ? Math.ceil(text.length / 4) : 0;
}

function sha256Hex(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function extractUserText(message: any): string | null {
	if (message?.role !== "user") return null;
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return null;
	const text = message.content
		.filter((block: any) => block?.type === "text" && typeof block?.text === "string")
		.map((block: any) => block.text)
		.join("\n");
	return text.length > 0 ? text : null;
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

	const stream = createReadStream(filePath, { encoding: "utf8" });
	const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

	try {
		for await (const line of rl) {
			if (signal?.aborted) {
				rl.close();
				stream.destroy();
				return null;
			}
			if (!line) continue;

			let obj: any;
			try {
				obj = JSON.parse(line);
			} catch {
				continue;
			}

			if (!startedAt && obj?.type === "session" && typeof obj?.timestamp === "string") {
				const d = new Date(obj.timestamp);
				if (Number.isFinite(d.getTime())) startedAt = d;
				continue;
			}

			if (
				obj?.type === "custom_message" &&
				typeof obj?.customType === "string" &&
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

			if (obj?.type === "custom_message" && obj?.customType === "slash-echo") {
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

			if (obj?.type !== "message") continue;
			const message = obj?.message;
			if (message?.role !== "assistant" || !Array.isArray(message?.content)) continue;

			const toolNames = message.content
				.filter((block: any) => block?.type === "toolCall" && typeof block?.name === "string")
				.map((block: any) => String(block.name).trim())
				.filter((name: string) => name.length > 0);
			if (toolNames.length === 0) continue;

			const usageTokens = extractUsageTokens(extractMessageUsage(obj));
			if (usageTokens > 0 && pendingCommandKeys.length > 0) {
				const tokensPerCommand = usageTokens / pendingCommandKeys.length;
				for (const commandKey of pendingCommandKeys.splice(0)) {
					const owner = commandKey.split("/", 1)[0] || "unknown-extension";
					estimatedToolTokens += tokensPerCommand;
					tokensByToolKey.set(commandKey, (tokensByToolKey.get(commandKey) ?? 0) + tokensPerCommand);
					tokensByExtension.set(owner, (tokensByExtension.get(owner) ?? 0) + tokensPerCommand);
				}
			}
			const tokensPerToolCall = usageTokens > 0 ? usageTokens / toolNames.length : 0;

			for (const toolName of toolNames) {
				const owner = resolveToolOwner(toolName, ownersByTool);
				const toolKey = `${owner}/${toolName}`;

				toolCalls += 1;
				estimatedToolTokens += tokensPerToolCall;

				callsByToolKey.set(toolKey, (callsByToolKey.get(toolKey) ?? 0) + 1);
				tokensByToolKey.set(toolKey, (tokensByToolKey.get(toolKey) ?? 0) + tokensPerToolCall);

				callsByExtension.set(owner, (callsByExtension.get(owner) ?? 0) + 1);
				tokensByExtension.set(owner, (tokensByExtension.get(owner) ?? 0) + tokensPerToolCall);

				sessionsByToolKey.add(toolKey);
				sessionsByExtension.add(owner);
			}
		}
	} catch {
		return null;
	} finally {
		rl.close();
		stream.destroy();
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
		range.callsByToolKey.set(toolKey, (range.callsByToolKey.get(toolKey) ?? 0) + calls);
		day.callsByToolKey.set(toolKey, (day.callsByToolKey.get(toolKey) ?? 0) + calls);
	}

	for (const [toolKey, tokens] of session.tokensByToolKey.entries()) {
		range.tokensByToolKey.set(toolKey, (range.tokensByToolKey.get(toolKey) ?? 0) + tokens);
		day.tokensByToolKey.set(toolKey, (day.tokensByToolKey.get(toolKey) ?? 0) + tokens);
	}

	for (const [owner, calls] of session.callsByExtension.entries()) {
		range.callsByExtension.set(owner, (range.callsByExtension.get(owner) ?? 0) + calls);
		day.callsByExtension.set(owner, (day.callsByExtension.get(owner) ?? 0) + calls);
	}

	for (const [owner, tokens] of session.tokensByExtension.entries()) {
		range.tokensByExtension.set(owner, (range.tokensByExtension.get(owner) ?? 0) + tokens);
		day.tokensByExtension.set(owner, (day.tokensByExtension.get(owner) ?? 0) + tokens);
	}

	for (const toolKey of session.sessionsByToolKey) {
		range.sessionsByToolKey.set(toolKey, (range.sessionsByToolKey.get(toolKey) ?? 0) + 1);
		day.sessionsByToolKey.set(toolKey, (day.sessionsByToolKey.get(toolKey) ?? 0) + 1);
	}

	for (const owner of session.sessionsByExtension) {
		range.sessionsByExtension.set(owner, (range.sessionsByExtension.get(owner) ?? 0) + 1);
		day.sessionsByExtension.set(owner, (day.sessionsByExtension.get(owner) ?? 0) + 1);
	}
}

function addTokensToRange(range: RangeAgg, dayKeyLocal: string, owner: string, toolKey: string, tokens: number): void {
	const day = range.dayByKey.get(dayKeyLocal);
	if (!day || tokens <= 0) return;
	range.estimatedToolTokens += tokens;
	day.estimatedToolTokens += tokens;
	range.tokensByToolKey.set(toolKey, (range.tokensByToolKey.get(toolKey) ?? 0) + tokens);
	day.tokensByToolKey.set(toolKey, (day.tokensByToolKey.get(toolKey) ?? 0) + tokens);
	range.tokensByExtension.set(owner, (range.tokensByExtension.get(owner) ?? 0) + tokens);
	day.tokensByExtension.set(owner, (day.tokensByExtension.get(owner) ?? 0) + tokens);
}

async function addPromptRouterTraceTokensToRanges(ranges: Map<number, RangeAgg>, signal?: AbortSignal): Promise<void> {
	const traceRoot = path.join(getAgentDir(), "traces");
	if (!(await pathExists(traceRoot))) return;
	const traceFiles = await walkSessionFiles(traceRoot, signal);
	for (const filePath of traceFiles) {
		if (signal?.aborted) return;
		const byTurn = new Map<string, { routedAt?: Date; tokens: number }>();
		const stream = createReadStream(filePath, { encoding: "utf8" });
		const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
		try {
			for await (const line of rl) {
				if (!line.trim()) continue;
				let obj: any;
				try {
					obj = JSON.parse(line);
				} catch {
					continue;
				}
				const turnId = typeof obj?.turn_id === "string" ? obj.turn_id : "turn-unknown";
				const current = byTurn.get(turnId) ?? { tokens: 0 };
				if (obj?.event_type === "routing_decision") {
					const d = new Date(obj.timestamp);
					if (Number.isFinite(d.getTime())) current.routedAt = d;
				}
				if (obj?.event_type === "assistant_message") {
					current.tokens += extractUsageTokens(obj?.payload?.usage);
				}
				byTurn.set(turnId, current);
			}
		} catch {
			// Ignore malformed or concurrently-rotated trace files.
		} finally {
			rl.close();
			stream.destroy();
		}
		for (const { routedAt, tokens } of byTurn.values()) {
			if (!routedAt || tokens <= 0) continue;
			const sessionDay = localMidnight(routedAt);
			const dayKey = toLocalDayKey(routedAt);
			for (const d of RANGE_DAYS) {
				const range = ranges.get(d)!;
				const start = range.days[0].date;
				const end = range.days[range.days.length - 1].date;
				if (sessionDay < start || sessionDay > end) continue;
				addTokensToRange(range, dayKey, "prompt-router", "prompt-router/route", tokens);
			}
		}
	}
}

async function readPromptRouterHashes(cwd: string): Promise<Set<string>> {
	const logPath = path.join(cwd, "pi", "prompt-routing", "logs", "routing_log.jsonl");
	const hashes = new Set<string>();
	if (!(await pathExists(logPath))) return hashes;
	const stream = createReadStream(logPath, { encoding: "utf8" });
	const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
	try {
		for await (const line of rl) {
			if (!line.trim()) continue;
			try {
				const obj = JSON.parse(line);
				if (typeof obj?.prompt_hash === "string") hashes.add(obj.prompt_hash);
			} catch {
				continue;
			}
		}
	} catch {
		return hashes;
	} finally {
		rl.close();
		stream.destroy();
	}
	return hashes;
}

async function addPromptRouterSessionTokensToRanges(
	ranges: Map<number, RangeAgg>,
	cwd: string,
	sessionFiles: string[],
	signal?: AbortSignal,
): Promise<void> {
	const hashes = await readPromptRouterHashes(cwd);
	if (hashes.size === 0) return;
	for (const filePath of sessionFiles) {
		if (signal?.aborted) return;
		const stream = createReadStream(filePath, { encoding: "utf8" });
		const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
		let pendingRoutedAt: Date | null = null;
		try {
			for await (const line of rl) {
				if (!line.trim()) continue;
				let obj: any;
				try {
					obj = JSON.parse(line);
				} catch {
					continue;
				}
				if (obj?.type !== "message") continue;
				const message = obj?.message;
				const userText = extractUserText(message);
				if (userText !== null) {
					const hash = sha256Hex(userText.trim());
					if (hashes.has(hash)) {
						const d = typeof obj.timestamp === "string" ? new Date(obj.timestamp) : null;
						pendingRoutedAt = d && Number.isFinite(d.getTime()) ? d : null;
					} else {
						pendingRoutedAt = null;
					}
					continue;
				}
				if (!pendingRoutedAt || message?.role !== "assistant") continue;
				const tokens = extractUsageTokens(extractMessageUsage(obj));
				if (tokens <= 0) continue;
				const sessionDay = localMidnight(pendingRoutedAt);
				const dayKey = toLocalDayKey(pendingRoutedAt);
				for (const d of RANGE_DAYS) {
					const range = ranges.get(d)!;
					const start = range.days[0].date;
					const end = range.days[range.days.length - 1].date;
					if (sessionDay < start || sessionDay > end) continue;
					addTokensToRange(range, dayKey, "prompt-router", "prompt-router/route", tokens);
				}
				pendingRoutedAt = null;
			}
		} catch {
			continue;
		} finally {
			rl.close();
			stream.destroy();
		}
	}
}

async function addPromptRouterEventsToRanges(ranges: Map<number, RangeAgg>, cwd: string, signal?: AbortSignal): Promise<void> {
	const logPath = path.join(cwd, "pi", "prompt-routing", "logs", "routing_log.jsonl");
	if (!(await pathExists(logPath))) return;

	const stream = createReadStream(logPath, { encoding: "utf8" });
	const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
	try {
		for await (const line of rl) {
			if (signal?.aborted) return;
			if (!line.trim()) continue;
			let obj: any;
			try {
				obj = JSON.parse(line);
			} catch {
				continue;
			}
			const ts = toFiniteNumber(obj?.ts);
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
				const range = ranges.get(d)!;
				const start = range.days[0].date;
				const end = range.days[range.days.length - 1].date;
				if (sessionDay < start || sessionDay > end) continue;
				addSessionToRange(range, session);
			}
		}
	} catch {
		return;
	} finally {
		rl.close();
		stream.destroy();
	}
}

function resolveEffectiveMetric(mode: MetricMode, totalTokens: number): MetricMode {
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
	const keys = new Set([...callsMap.keys(), ...tokensMap.keys(), ...sessionsMap.keys()]);
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

function clampOffset(offset: number, totalRows: number, pageSize: number): number {
	if (totalRows <= 0) return 0;
	const maxOffset = Math.max(0, totalRows - pageSize);
	return Math.max(0, Math.min(offset, maxOffset));
}

function renderUsageTable(
	title: string,
	rows: UsageRow[],
	width: number,
	offset: number,
	pageSize: number,
	metric: MetricMode,
	active: boolean,
): TableRenderResult {
	const lines: string[] = [];
	lines.push(active ? bold(`${title}  [active]`) : bold(title));

	if (rows.length === 0) {
		lines.push(dim("(no usage found)"));
		return { lines, offset: 0, totalRows: 0 };
	}

	const safeOffset = clampOffset(offset, rows.length, pageSize);
	const pageRows = rows.slice(safeOffset, safeOffset + pageSize);

	const fixedColumns = 2 + 9 + 2 + 9 + 2 + 9 + 2 + 8;
	const minNameWidth = 16;
	const maxNameWidth = 64;
	const nameWidth = Math.max(minNameWidth, Math.min(maxNameWidth, width - fixedColumns));

	const callsLabel = metric === "calls" ? "calls*" : "calls";
	const tokensLabel = metric === "tokens" ? "tokens*" : "tokens";

	const header = `${padRight("name", nameWidth)}  ${padLeft(callsLabel, 9)}  ${padLeft(tokensLabel, 9)}  ${padLeft("sessions", 9)}  ${padLeft("share", 8)}`;
	const rule = `${"-".repeat(nameWidth)}  ${"-".repeat(9)}  ${"-".repeat(9)}  ${"-".repeat(9)}  ${"-".repeat(8)}`;

	lines.push(header);
	lines.push(rule);

	for (const row of pageRows) {
		const rowText = `${padRight(row.name.slice(0, nameWidth), nameWidth)}  ${padLeft(formatInt(row.calls), 9)}  ${padLeft(formatCompact(row.tokens), 9)}  ${padLeft(formatInt(row.sessions), 9)}  ${padLeft(formatPercent(row.sharePct), 8)}`;
		lines.push(rowText);
	}

	const from = safeOffset + 1;
	const to = Math.min(rows.length, safeOffset + pageRows.length);
	const nav = `${from}-${to} of ${rows.length}`;
	const hints = [safeOffset > 0 ? "↑" : null, to < rows.length ? "↓" : null].filter((x): x is string => !!x);
	lines.push(dim(`showing ${nav}${hints.length > 0 ? ` · ${hints.join(" ")}` : ""}`));

	return { lines, offset: safeOffset, totalRows: rows.length };
}

function rangeSummary(range: RangeAgg, days: number): string {
	const extCount = [...range.callsByExtension.values()].filter((x) => x > 0).length;
	const toolCount = [...range.callsByToolKey.values()].filter((x) => x > 0).length;
	return `Last ${days} days: ${range.sessions} sessions · ${range.toolCalls} tool calls · ~${formatCompact(range.estimatedToolTokens)} tool-call tokens · ${extCount} extensions · ${toolCount} extension/tools`;
}

async function computeBreakdown(pi: ExtensionAPI, cwd: string, signal?: AbortSignal): Promise<BreakdownData> {
	const now = new Date();
	const ranges = new Map<number, RangeAgg>();
	for (const d of RANGE_DAYS) ranges.set(d, buildRangeAgg(d, now));

	const maxRange = Math.max(...RANGE_DAYS);
	const maxRangeAgg = ranges.get(maxRange)!;
	const startMaxRange = maxRangeAgg.days[0].date;

	const ownership = await discoverExtensionToolOwners(cwd, signal);
	const ownersByTool = ownership.ownersByTool;

	const sessionRoot = getSessionRoot();
	const files = await walkSessionFiles(sessionRoot, signal);

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
		const session = await parseSessionFile(filePath, ownersByTool, ownership.ownersByCommand, signal);
		if (!session) continue;

		const sessionDay = localMidnight(session.startedAt);
		for (const d of RANGE_DAYS) {
			const range = ranges.get(d)!;
			const start = range.days[0].date;
			const end = range.days[range.days.length - 1].date;
			if (sessionDay < start || sessionDay > end) continue;
			addSessionToRange(range, session);
		}
	}

	await addPromptRouterEventsToRanges(ranges, cwd, signal);
	await addPromptRouterTraceTokensToRanges(ranges, signal);
	await addPromptRouterSessionTokensToRanges(ranges, cwd, candidates, signal);

	const allToolNames = new Set(pi.getAllTools().map((t) => t.name));
	const unattributedTools = [...allToolNames].filter((name) => resolveToolOwner(name, ownersByTool) === "unknown-extension")
		.length;

	return {
		generatedAt: now,
		ranges,
		sessionRoot,
		discoveredOwnerNames: ownership.ownerNames,
		ownerDiagnostics: {
			discoveredOwners: ownership.ownerNames.length,
			unattributedTools,
			packageScanRoots: ownership.packageScanRoots,
		},
	};
}

class ExtensionStatsComponent implements Component {
	private data: BreakdownData;
	private tui: TUI;
	private onDone: () => void;
	private rangeIndex = 1; // default 30d
	private metric: MetricMode = "calls";
	private activeSection: TableSection = "tools";
	private extensionOffset = 0;
	private toolOffset = 0;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(data: BreakdownData, tui: TUI, onDone: () => void) {
		this.data = data;
		this.tui = tui;
		this.onDone = onDone;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private requestRender(): void {
		this.invalidate();
		this.tui.requestRender();
	}

	private resetTableOffsets(): void {
		this.extensionOffset = 0;
		this.toolOffset = 0;
	}

	handleInput(data: string): void {
		const lower = data.toLowerCase();
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || lower === "q") {
			this.onDone();
			return;
		}

		const prevRange = () => {
			this.rangeIndex = (this.rangeIndex + RANGE_DAYS.length - 1) % RANGE_DAYS.length;
			this.resetTableOffsets();
			this.requestRender();
		};
		const nextRange = () => {
			this.rangeIndex = (this.rangeIndex + 1) % RANGE_DAYS.length;
			this.resetTableOffsets();
			this.requestRender();
		};

		if (matchesKey(data, Key.left) || lower === "h") prevRange();
		if (matchesKey(data, Key.right) || lower === "l") nextRange();

		if (data === "1") {
			this.rangeIndex = 0;
			this.resetTableOffsets();
			this.requestRender();
		}
		if (data === "2") {
			this.rangeIndex = 1;
			this.resetTableOffsets();
			this.requestRender();
		}
		if (data === "3") {
			this.rangeIndex = 2;
			this.resetTableOffsets();
			this.requestRender();
		}
		if (data === "4") {
			this.rangeIndex = 3;
			this.resetTableOffsets();
			this.requestRender();
		}

		if (lower === "m") {
			this.metric = this.metric === "calls" ? "tokens" : "calls";
			this.resetTableOffsets();
			this.requestRender();
		}

		if (lower === "e") {
			this.activeSection = "extensions";
			this.requestRender();
		}
		if (lower === "t") {
			this.activeSection = "tools";
			this.requestRender();
		}

		if (matchesKey(data, Key.down)) {
			if (this.activeSection === "extensions") {
				this.extensionOffset += PAGE_SIZE;
			} else {
				this.toolOffset += PAGE_SIZE;
			}
			this.requestRender();
		}
		if (matchesKey(data, Key.up)) {
			if (this.activeSection === "extensions") {
				this.extensionOffset = Math.max(0, this.extensionOffset - PAGE_SIZE);
			} else {
				this.toolOffset = Math.max(0, this.toolOffset - PAGE_SIZE);
			}
			this.requestRender();
		}

		if (lower === "g") {
			if (this.activeSection === "extensions") this.extensionOffset = 0;
			else this.toolOffset = 0;
			this.requestRender();
		}
	}

	render(width: number): string[] {
		if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;

		const selectedDays = RANGE_DAYS[this.rangeIndex];
		const range = this.data.ranges.get(selectedDays)!;
		const effectiveMetric = resolveEffectiveMetric(this.metric, range.estimatedToolTokens);

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

		const tab = (days: number, idx: number): string => {
			const selected = idx === this.rangeIndex;
			const label = `${days}d`;
			return selected ? bold(`[${label}]`) : dim(` ${label} `);
		};

		const header = `${bold("Tool usage stats")}  ${tab(7, 0)} ${tab(30, 1)} ${tab(60, 2)} ${tab(90, 3)}  ${dim("←/→ range · m metric · e/t focus · ↑/↓ page · q close")}`;

		const lines: string[] = [];
		lines.push(truncateToWidth(header, width));
		lines.push(truncateToWidth(dim(`Sessions directory: ${this.data.sessionRoot}`), width));
		lines.push(
			truncateToWidth(
				dim(
					`Attribution: extension/tool for extension-registered tools, Pi/tool for native tools (${this.data.ownerDiagnostics.unattributedTools} unattributed active tools, ${this.data.ownerDiagnostics.packageScanRoots} package scan roots)`
				),
				width,
			),
		);
		lines.push(truncateToWidth(dim(`Metric mode: ${effectiveMetric} ${effectiveMetric === "tokens" ? "(estimated)" : ""}`), width));
		lines.push("");
		lines.push(truncateToWidth(rangeSummary(range, selectedDays), width));
		lines.push("");

		const extensionTable = renderUsageTable(
			`By extension (${effectiveMetric})`,
			extensionRows,
			width,
			this.extensionOffset,
			PAGE_SIZE,
			effectiveMetric,
			this.activeSection === "extensions",
		);
		this.extensionOffset = extensionTable.offset;
		for (const line of extensionTable.lines) lines.push(truncateToWidth(line, width));

		lines.push("");

		const toolTable = renderUsageTable(
			`By extension/tool (${effectiveMetric})`,
			toolRows,
			width,
			this.toolOffset,
			PAGE_SIZE,
			effectiveMetric,
			this.activeSection === "tools",
		);
		this.toolOffset = toolTable.offset;
		for (const line of toolTable.lines) lines.push(truncateToWidth(line, width));

		this.cachedWidth = width;
		this.cachedLines = lines.map((line) => (visibleWidth(line) > width ? truncateToWidth(line, width) : line));
		return this.cachedLines;
	}
}

function displayOwnerName(owner: string): string {
	return owner === "codex-status" ? "usage" : owner;
}

function displayUsageName(name: string): string {
	const withoutNativePrefix = name.startsWith("Pi/") ? name.slice("Pi/".length) : name;
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
	const hiddenNames = hiddenRows.map((row) => displayUsageName(row.name)).join(", ");
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

function renderMarkdownReport(data: BreakdownData, reportDays: number[]): string {
	const lines = [
		`Generated: ${data.generatedAt.toISOString()}`,
		`Sessions directory: ${data.sessionRoot}`,
		`Attribution: extension/tool for extension-registered tools, Pi/tool for native tools (${data.ownerDiagnostics.unattributedTools} unattributed active tools, ${data.ownerDiagnostics.packageScanRoots} package scan roots).`,
	];

	for (const days of reportDays) {
		const range = data.ranges.get(days)!;
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
	const maxRangeAgg = data.ranges.get(maxRange)!;
	const usedOwners = new Set(maxRangeAgg.callsByExtension.keys());
	const unusedOwners = data.discoveredOwnerNames.filter((owner) => owner !== "Pi" && !usedOwners.has(owner));
	lines.push(
		"\n## Unused extensions",
		unusedOwners.length > 0 ? unusedOwners.map((owner) => `- ${displayOwnerName(owner)}`).join("\n") : "_None discovered._",
	);

	return lines.join("\n");
}

export default function extensionStatsExtension(pi: ExtensionAPI) {
	pi.registerCommand("extension-stats", {
		description:
			"Dump last 1/7/30 days of ~/.pi session tool/command usage; pass 60, 90, or all to include longer windows",
		handler: async (args, ctx: ExtensionContext) => {
			const reportDays = parseReportDays(args);
			const data = await computeBreakdown(pi, ctx.cwd, undefined);
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
