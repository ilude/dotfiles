import { createReadStream, type Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { getAgentDir } from "./settings-file.ts";

export interface JsonlEntry {
	line: number;
	value: unknown;
}

export interface ReadJsonlOptions {
	signal?: AbortSignal;
	onMalformedLine?: (line: number) => void;
}

export interface PromptAssistantJoin {
	userText: string;
	userEntry: Record<string, unknown>;
	assistantEntry: Record<string, unknown>;
	usageTokens: number;
}

export function resolveAgentDir(): string {
	return getAgentDir();
}

export function resolveSessionRoot(): string {
	return path.join(getAgentDir(), "sessions");
}

export async function enumerateJsonlFiles(
	root: string,
	signal?: AbortSignal,
): Promise<string[]> {
	const files: string[] = [];
	const stack = [root];

	while (stack.length > 0 && !signal?.aborted) {
		const dir = stack.pop();
		if (!dir) continue;

		let entries: Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch (error) {
			if (signal?.aborted) return files;
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}

		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			if (signal?.aborted) break;
			const entryPath = path.join(dir, entry.name);
			if (entry.isDirectory()) stack.push(entryPath);
			else if (entry.isFile() && entry.name.endsWith(".jsonl"))
				files.push(entryPath);
		}
	}

	return files.sort((a, b) => a.localeCompare(b));
}

export async function* readJsonlFile(
	filePath: string,
	options: ReadJsonlOptions = {},
): AsyncGenerator<JsonlEntry> {
	if (options.signal?.aborted) return;

	const stream = createReadStream(filePath, { encoding: "utf8" });
	const lines = readline.createInterface({
		input: stream,
		crlfDelay: Infinity,
	});
	const abort = (): void => {
		lines.close();
		stream.destroy();
	};
	options.signal?.addEventListener("abort", abort, { once: true });

	let line = 0;
	try {
		for await (const raw of lines) {
			if (options.signal?.aborted) return;
			line += 1;
			if (!raw.trim()) continue;
			let value: unknown;
			try {
				value = JSON.parse(raw) as unknown;
			} catch {
				options.onMalformedLine?.(line);
				continue;
			}
			yield { line, value };
		}
	} catch (error) {
		if (options.signal?.aborted) return;
		throw error;
	} finally {
		options.signal?.removeEventListener("abort", abort);
		lines.close();
		stream.destroy();
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number {
	if (typeof value !== "number" && typeof value !== "string") return 0;
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}

export function extractUsageTokens(usage: unknown): number {
	if (!isRecord(usage)) return 0;
	return [
		usage.input,
		usage.output,
		usage.cacheRead,
		usage.cacheWrite,
		usage["gen_ai.usage.input_tokens"],
		usage["gen_ai.usage.output_tokens"],
		usage["gen_ai.usage.cache_read_tokens"],
		usage["gen_ai.usage.cache_write_tokens"],
	].reduce<number>((total, value) => total + finiteNumber(value), 0);
}

export function extractEntryUsageTokens(entry: unknown): number {
	if (!isRecord(entry)) return 0;
	const message = isRecord(entry.message) ? entry.message : undefined;
	return extractUsageTokens(entry.usage ?? message?.usage);
}

export function extractUserText(message: unknown): string | null {
	if (!isRecord(message) || message.role !== "user") return null;
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return null;
	const text = message.content
		.filter((block): block is Record<string, unknown> => isRecord(block))
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => String(block.text))
		.join("\n");
	return text.length > 0 ? text : null;
}

export async function* joinPromptsToNextAssistant(
	filePath: string,
	options: ReadJsonlOptions = {},
): AsyncGenerator<PromptAssistantJoin> {
	let pending: { text: string; entry: Record<string, unknown> } | null = null;
	for await (const { value } of readJsonlFile(filePath, options)) {
		if (
			!isRecord(value) ||
			value.type !== "message" ||
			!isRecord(value.message)
		)
			continue;
		const userText = extractUserText(value.message);
		if (userText !== null) {
			pending = { text: userText, entry: value };
			continue;
		}
		if (!pending || value.message.role !== "assistant") continue;
		const joined = pending;
		pending = null;
		yield {
			userText: joined.text,
			userEntry: joined.entry,
			assistantEntry: value,
			usageTokens: extractEntryUsageTokens(value),
		};
	}
}
