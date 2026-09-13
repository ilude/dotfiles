import fs from "node:fs/promises";
import { createReadStream, type ReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface, type Interface } from "node:readline";
import { canonicalWithin, checkCancelled, selectedProfiles, type ProfileId, type ProfileRegistry } from "./log-analytics/profiles.js";
import { discoverSessions, selectSessions } from "./log-analytics/sessions.js";

export type SessionMessagesInput = { session_id: string; profile?: ProfileId };
export type SessionMessagesResult = {
	local_path: string;
	session_id: string;
	profile: ProfileId;
	user_messages: number;
	assistant_messages: number;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectMessageRecord(value: unknown): { record: JsonObject; role: "user" | "assistant" } | undefined {
	if (!isObject(value) || value.type !== "message" || !isObject(value.message)) return undefined;
	const message = value.message;
	const role = message.role === "user" ? "user" : message.role === "assistant" || message.role === "model" ? "assistant" : undefined;
	if (!role) return undefined;

	// Keep the native record and message metadata, but remove assistant tool-call
	// blocks so the projection remains a conversation rather than an instruction
	// to replay tools. User content is copied unchanged.
	const projectedMessage = role === "assistant" && Array.isArray(message.content)
		? { ...message, content: message.content.filter((block) => !isObject(block) || block.type !== "toolCall") }
		: { ...message };
	if (role === "assistant" && Array.isArray(projectedMessage.content) && projectedMessage.content.length === 0) return undefined;
	return { record: { ...value, message: projectedMessage }, role };
}

/**
 * Read one registered native session and leave a caller-readable projection in
 * an extension-owned temporary directory. Corrupt body lines are skipped: the
 * native header has already been validated during discovery, and one unrelated
 * malformed entry should not prevent retrieving the valid conversation. There
 * is intentionally no line or output-size limit; cancellation is the boundary.
 */
export async function createSessionMessages(
	registry: ProfileRegistry,
	request: SessionMessagesInput,
	signal?: AbortSignal,
): Promise<SessionMessagesResult> {
	const effectiveSignal = signal ?? new AbortController().signal;
	checkCancelled(effectiveSignal);
	if (typeof request.session_id !== "string" || !request.session_id || request.session_id.length > 256) throw new Error("invalid session_messages session_id");
	const profile = request.profile ?? registry.active;
	const profiles = selectedProfiles(registry, [profile]);
	const discovered = await discoverSessions(registry, profiles, effectiveSignal);
	const selected = selectSessions(discovered, [{ profile, sessionId: request.session_id }], profiles)[0];
	const root = await fs.realpath(registry.roots[profile]);
	const source = await canonicalWithin(root, selected.file);
	if (source !== selected.file) throw new Error("session_messages input changed during discovery");

	let ownedDirectory: string | undefined;
	try {
		ownedDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "pi-session-messages-"));
		const output = path.join(ownedDirectory, "messages.jsonl");
		const outputHandle = await fs.open(output, "w");
		let stream: ReadStream | undefined;
		let lines: Interface | undefined;
		const cancel = () => {
			lines?.close();
			stream?.destroy();
		};
		effectiveSignal.addEventListener("abort", cancel, { once: true });
		let userMessages = 0;
		let assistantMessages = 0;
		try {
			checkCancelled(effectiveSignal);
			stream = createReadStream(source, { encoding: "utf8" });
			lines = createInterface({ input: stream, crlfDelay: Infinity });
			for await (const line of lines) {
				checkCancelled(effectiveSignal);
				if (!line.trim()) continue;
				let parsed: unknown;
				try { parsed = JSON.parse(line); } catch { continue; }
				const projected = projectMessageRecord(parsed);
				if (!projected) continue;
				checkCancelled(effectiveSignal);
				await outputHandle.write(`${JSON.stringify(projected.record)}\n`);
				if (projected.role === "user") userMessages++;
				else assistantMessages++;
			}
			checkCancelled(effectiveSignal);
		} catch (error) {
			if (effectiveSignal.aborted) throw new Error("session_messages was cancelled");
			throw error;
		} finally {
			effectiveSignal.removeEventListener("abort", cancel);
			lines?.close();
			stream?.destroy();
			await outputHandle.close();
		}
		return { local_path: output, session_id: request.session_id, profile, user_messages: userMessages, assistant_messages: assistantMessages };
	} catch (error) {
		if (ownedDirectory) await fs.rm(ownedDirectory, { recursive: true, force: true });
		throw error;
	}
}
