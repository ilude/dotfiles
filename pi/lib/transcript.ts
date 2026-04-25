/**
 * Transcript -- sidecar interaction trace for Pi sessions.
 *
 * Single-module home for:
 *   - Event envelope schema and types
 *   - Three-tier secret redaction (headers, field-name, free-text)
 *   - Append-only writer with rotation, spill files, and POSIX mode bits
 *   - Settings loader (reads ~/.pi/agent/settings.json ONLY -- never repo settings)
 *   - Retention sweep (idempotent)
 *   - Symlink defense against cloud-sync directories
 *   - Circuit breaker (3 EACCES/ENOSPC -> transcript_disabled, stop)
 *
 * Events are JSONL with `schema_version` as the first envelope field.
 * The writer never throws; it degrades gracefully and emits diagnostic
 * records (`payload_unserializable`, `transcript_disabled`) instead.
 *
 * See pi/.specs/pi-full-interaction-trace/plan.md task T1 for the full spec.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Schema constants
// ---------------------------------------------------------------------------

/** Current schema version. Parsers MUST reject unknown major versions. */
export const SCHEMA_VERSION = "1.0.0";

/** Major version derived from SCHEMA_VERSION; used by `isCompatibleSchemaVersion`. */
const SCHEMA_MAJOR = SCHEMA_VERSION.split(".")[0];

/** Default trace location (per-user, outside repo). */
export const DEFAULT_TRACE_DIR = path.join(os.homedir(), ".pi", "agent", "traces");

/** Repo-tracked settings path. Loader MUST NOT read from this file. */
export const REPO_SETTINGS_PATH = path.join(os.homedir(), ".dotfiles", "pi", "settings.json");

/** Per-user runtime settings path. The ONLY allowed source for the toggle. */
export const USER_SETTINGS_PATH = path.join(os.homedir(), ".pi", "agent", "settings.json");

/** Cloud-sync directory name fragments rejected by the symlink defense. */
const BANNED_PATH_SEGMENTS = ["OneDrive", "Dropbox", "iCloudDrive", "Google Drive"];

/** Default maximum size of a single trace JSONL file before rotation. */
const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024;

/** Default maximum inline payload size before spill. */
const DEFAULT_MAX_INLINE_BYTES = 64 * 1024;

/** Default retention window in days for sweep. */
const DEFAULT_RETENTION_DAYS = 14;

/** Number of consecutive write failures that trip the circuit breaker. */
const CIRCUIT_BREAKER_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Envelope and event types
// ---------------------------------------------------------------------------

/**
 * Common envelope. Required: `schema_version` (first), `session_id`, `turn_id`,
 * `trace_id`, `event_type`, `timestamp` (ISO wall-clock), `monotonic_ns` (BigInt
 * stringified for JSON, stable across NTP/VM resume).
 */
export interface TranscriptEnvelope {
	schema_version: string;
	session_id: string;
	turn_id: string;
	message_id?: string;
	tool_call_id?: string;
	trace_id: string;
	parent_trace_id?: string;
	event_type: string;
	timestamp: string;
	/** BigInt monotonic counter; stringified in JSON to preserve precision. */
	monotonic_ns: string;
}

/** Reference written in place of an oversized payload field. */
export interface SpillReference {
	$spill: string;
	sha256: string;
	bytes_uncompressed: number;
}

/**
 * Routing decision contract. Captures enough information to evaluate the
 * prompt-router classifier separately from policy/cap/hysteresis effects.
 */
export interface RoutingDecisionPayload {
	prompt_hash: string;
	prompt_excerpt: string;
	raw_classifier_output: unknown;
	applied_route: string;
	confidence: number | null;
	rule_fired: string | null;
	fallback_metadata: {
		cap?: string | null;
		hysteresis?: string | null;
		[k: string]: unknown;
	} | null;
}

/** Diagnostic emitted when JSON cloning fails. */
export interface PayloadUnserializablePayload {
	field: string;
	error_class: string;
	error_message: string;
}

/** Emitted exactly once per session when the circuit breaker trips. */
export interface TranscriptDisabledPayload {
	reason: string;
	consecutive_failures: number;
	last_error: string;
}

/**
 * Event union for IDE help. Concrete event types are open-ended; the writer
 * accepts any object shape as `payload`. The plan documents the canonical
 * `event_type` values produced by wave 2 (llm_request, routing_decision,
 * assistant_message, tool_call, tool_result, model_select, etc.).
 */
export interface TranscriptEvent {
	envelope: Omit<TranscriptEnvelope, "schema_version" | "monotonic_ns" | "timestamp"> & {
		/** Optional override for the wall-clock timestamp. Writer fills it otherwise. */
		timestamp?: string;
		/** Optional override for monotonic_ns. Writer fills it otherwise. */
		monotonic_ns?: bigint;
	};
	payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Schema version negotiation
// ---------------------------------------------------------------------------

/**
 * Returns true when `version` shares the major component with this build.
 * Parsers should treat records with a different major version as opaque.
 */
export function isCompatibleSchemaVersion(version: unknown): boolean {
	if (typeof version !== "string") return false;
	const major = version.split(".")[0];
	return major === SCHEMA_MAJOR;
}

// ---------------------------------------------------------------------------
// Settings loader
// ---------------------------------------------------------------------------

/**
 * Resolved transcript settings. Defaults are conservative: tracing is OFF
 * and bytes are bounded.
 */
export interface TranscriptSettings {
	enabled: boolean;
	path: string;
	maxInlineBytes: number;
	maxFileBytes: number;
	retentionDays: number;
}

/**
 * Default settings (everything off / safe). Exported for tests so they can
 * construct a TranscriptWriter without round-tripping through the filesystem.
 */
export function defaultSettings(): TranscriptSettings {
	return {
		enabled: false,
		path: DEFAULT_TRACE_DIR,
		maxInlineBytes: DEFAULT_MAX_INLINE_BYTES,
		maxFileBytes: DEFAULT_MAX_FILE_BYTES,
		retentionDays: DEFAULT_RETENTION_DAYS,
	};
}

/**
 * Loads transcript settings from `~/.pi/agent/settings.json` ONLY.
 *
 * The repo-tracked `pi/settings.json` is intentionally not consulted: that
 * would let any dotfiles user accidentally enable tracing for everyone.
 * Missing/invalid files yield defaults (enabled: false).
 */
export function loadSettings(homeDir: string = os.homedir()): TranscriptSettings {
	const defaults = defaultSettings();
	defaults.path = path.join(homeDir, ".pi", "agent", "traces");
	const settingsPath = path.join(homeDir, ".pi", "agent", "settings.json");
	let raw: unknown;
	try {
		raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
	} catch {
		return defaults;
	}
	if (!raw || typeof raw !== "object") return defaults;
	const transcript = (raw as Record<string, unknown>).transcript;
	if (!transcript || typeof transcript !== "object") return defaults;
	const t = transcript as Record<string, unknown>;
	const out: TranscriptSettings = { ...defaults };
	if (typeof t.enabled === "boolean") out.enabled = t.enabled;
	if (typeof t.path === "string" && t.path.length > 0) out.path = t.path;
	if (typeof t.maxInlineBytes === "number" && t.maxInlineBytes > 0) out.maxInlineBytes = t.maxInlineBytes;
	if (typeof t.maxFileBytes === "number" && t.maxFileBytes > 0) out.maxFileBytes = t.maxFileBytes;
	if (typeof t.retentionDays === "number" && t.retentionDays >= 0) out.retentionDays = t.retentionDays;
	return out;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/** Case-insensitive header allowlist of secrets. */
const SECRET_HEADER_NAMES = new Set([
	"authorization",
	"proxy-authorization",
	"cookie",
	"set-cookie",
	"x-api-key",
	"x-auth-token",
	"x-amz-security-token",
	"x-goog-api-key",
	"x-anthropic-api-key",
	"openai-organization",
]);

/**
 * Matches `token` or `auth` only when they stand as a complete segment --
 * i.e., preceded by a separator (or start of string) and followed by a
 * separator (or end of string). This prevents `_tokens` and `authentic`
 * from triggering redaction on OTel-canonical usage fields such as
 * `gen_ai.usage.input_tokens`.
 *
 * Applied AFTER camelCase boundaries are normalised to `_`.
 */
const SECRET_KEY_PATTERN_BOUNDED = /(?:^|[-_.\s])(?:token|auth)(?:[-_.\s]|$)/i;

/**
 * Matches `api-key` / `api_key` / `apikey` variants, `secret`, and `cred`
 * without requiring a right-hand separator. This allows `client_secret` and
 * `aws_credentials` to be caught even though the keyword is a prefix of a
 * longer word segment.
 *
 * Applied AFTER camelCase boundaries are normalised to `_`.
 */
const SECRET_KEY_PATTERN_PREFIX = /(?:^|[-_.\s])(?:api[-_]?key|secret|cred)/i;

/** Sentinel string used in place of redacted values. */
export const REDACTED = "[REDACTED]";

/** Free-text patterns that mask common cloud secrets and bearer tokens. */
const FREE_TEXT_PATTERNS: Array<{ regex: RegExp; replace: string }> = [
	{ regex: /AKIA[0-9A-Z]{16}/g, replace: REDACTED },
	{ regex: /sk-ant-[A-Za-z0-9-]{20,}/g, replace: REDACTED },
	{ regex: /sk-[A-Za-z0-9]{20,}/g, replace: REDACTED },
	{ regex: /ghp_[A-Za-z0-9]{36}/g, replace: REDACTED },
	{ regex: /(Bearer\s+)([A-Za-z0-9_\-.=]{20,})/gi, replace: `$1${REDACTED}` },
	{ regex: /(api[_-]?key["']?\s*[:=]\s*["']?)([A-Za-z0-9_\-]{20,})/gi, replace: `$1${REDACTED}` },
	// PEM private-key blocks. `[\s\S]` avoids the `s` flag for ES2018 compatibility.
	{ regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replace: REDACTED },
];

/**
 * Returns true if `name` is a known secret header or matches the generic
 * secret-key pattern. Case-insensitive.
 *
 * camelCase boundaries (e.g. `authToken`) are normalised to `_` before
 * pattern matching so that boundary-aware patterns work correctly without
 * information loss from lowercasing.
 */
export function isSecretKey(name: string): boolean {
	const lower = name.toLowerCase();
	if (SECRET_HEADER_NAMES.has(lower)) return true;
	// Normalise camelCase to _ so `authToken` -> `auth_token` before testing.
	const normalized = name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
	return SECRET_KEY_PATTERN_BOUNDED.test(normalized) || SECRET_KEY_PATTERN_PREFIX.test(normalized);
}

/**
 * Returns a deep-cloned object with secret-shaped header/field names replaced.
 * The source object is not mutated. Free-text values inside known
 * tool-result fields (`content[*].text`, `details`) are scanned with
 * `redactFreeText`.
 */
export function redact<T>(value: T): T {
	return redactInternal(value, /*depth*/ 0) as T;
}

/**
 * Best-effort free-text redaction. Replaces matches for AWS access keys,
 * `sk-`/`sk-ant-` tokens, GitHub PATs, Bearer-prefixed values, generic
 * `api_key=...` assignments, and PEM private key blocks.
 */
export function redactFreeText(text: string): string {
	if (typeof text !== "string" || text.length === 0) return text;
	let out = text;
	for (const { regex, replace } of FREE_TEXT_PATTERNS) {
		regex.lastIndex = 0;
		out = out.replace(regex, replace);
	}
	return out;
}

const MAX_REDACT_DEPTH = 64;

function redactInternal(value: unknown, depth: number): unknown {
	if (depth > MAX_REDACT_DEPTH) return REDACTED;
	if (value === null || value === undefined) return value;
	if (typeof value === "string") return redactFreeText(value);
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return value;
	if (Array.isArray(value)) return value.map((item) => redactInternal(item, depth + 1));
	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (isSecretKey(k)) {
				out[k] = REDACTED;
			} else {
				out[k] = redactInternal(v, depth + 1);
			}
		}
		return out;
	}
	return value;
}

// ---------------------------------------------------------------------------
// Cloning
// ---------------------------------------------------------------------------

/**
 * Result of `clonePayload`. On success the cloned value is returned; on
 * failure (e.g. circular reference) `error` carries class + message and the
 * caller should emit a `payload_unserializable` event in place of the value.
 */
export type CloneResult<T> = { ok: true; value: T } | { ok: false; error: { errorClass: string; errorMessage: string } };

/**
 * Clones via `JSON.parse(JSON.stringify(...))`. This is intentionally lossy
 * (Maps, Sets, BigInt, functions are dropped/serialized via toJSON) -- the
 * upstream contract for `BeforeProviderRequestEvent.payload` is HTTP request
 * bodies, which are already JSON-shaped. Never throws.
 */
export function clonePayload<T>(value: T): CloneResult<T> {
	try {
		return { ok: true, value: JSON.parse(JSON.stringify(value)) as T };
	} catch (err) {
		const e = err as Error;
		return {
			ok: false,
			error: {
				errorClass: e?.constructor?.name ?? "Error",
				errorMessage: e?.message ?? String(err),
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Symlink defense
// ---------------------------------------------------------------------------

/**
 * Returns true if `resolvedPath` (already passed through `fs.realpath`)
 * contains a path segment that matches a known cloud-sync directory.
 */
export function isCloudSyncedPath(resolvedPath: string): boolean {
	const normalized = resolvedPath.replace(/\\/g, "/");
	const segments = normalized.split("/");
	for (const segment of segments) {
		if (BANNED_PATH_SEGMENTS.includes(segment)) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Retention sweep
// ---------------------------------------------------------------------------

/**
 * Idempotent sweep that deletes trace+spill files whose mtime is older than
 * `retentionDays` days. Errors are swallowed -- sweep is best-effort.
 *
 * When `maxAgeMs` is provided (e.g. `0` for "delete everything") it is used
 * directly and `retentionDays` is ignored. `transcript-purge` uses this knob.
 */
export async function sweepRetention(
	traceDir: string,
	retentionDays: number,
	maxAgeMs?: number,
): Promise<{ removedFiles: number; removedSpillDirs: number }> {
	let removedFiles = 0;
	let removedSpillDirs = 0;
	const cutoff = Date.now() - (typeof maxAgeMs === "number" ? maxAgeMs : retentionDays * 24 * 60 * 60 * 1000);

	let entries: fs.Dirent[];
	try {
		entries = await fs.promises.readdir(traceDir, { withFileTypes: true });
	} catch {
		return { removedFiles, removedSpillDirs };
	}

	for (const entry of entries) {
		const fullPath = path.join(traceDir, entry.name);
		try {
			if (entry.isFile() && entry.name.endsWith(".jsonl")) {
				const stat = await fs.promises.stat(fullPath);
				if (stat.mtimeMs <= cutoff) {
					await fs.promises.unlink(fullPath);
					removedFiles += 1;
				}
			} else if (entry.isDirectory() && entry.name.endsWith(".spill")) {
				const stat = await fs.promises.stat(fullPath);
				if (stat.mtimeMs <= cutoff) {
					await fs.promises.rm(fullPath, { recursive: true, force: true });
					removedSpillDirs += 1;
				}
			}
		} catch {
			// Best-effort. Skip files we cannot stat/remove.
		}
	}

	return { removedFiles, removedSpillDirs };
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Construction options for the writer.
 *
 * `now` and `monotonic` are injectable so tests can pin timestamps and the
 * monotonic counter without resorting to fake timers.
 */
export interface TranscriptWriterOptions {
	sessionId: string;
	settings: TranscriptSettings;
	/** Override timestamp source for tests. Defaults to `() => new Date()`. */
	now?: () => Date;
	/** Override monotonic counter for tests. Defaults to `process.hrtime.bigint()`. */
	monotonic?: () => bigint;
	/** Optional callback for the single warning fired when symlink defense trips. */
	onSecurityWarning?: (message: string) => void;
}

interface WriterRuntimeState {
	disabled: boolean;
	consecutiveFailures: number;
	lastError: string | null;
	disabledEmitted: boolean;
	currentRotation: number;
	traceDir: string;
	jsonlPath: string;
	spillDir: string;
	resolvedDirVerified: boolean;
}

/** Diagnostic information surfaced on writer construction (used by tests). */
export interface WriterDiagnostics {
	reason: "ok" | "disabled" | "cloud_sync_rejected" | "init_failed";
	message?: string;
}

export class TranscriptWriter {
	readonly sessionId: string;
	readonly settings: TranscriptSettings;
	readonly diagnostics: WriterDiagnostics;
	private readonly state: WriterRuntimeState;
	private readonly nowFn: () => Date;
	private readonly monotonicFn: () => bigint;
	private readonly onSecurityWarning?: (message: string) => void;

	constructor(opts: TranscriptWriterOptions) {
		this.sessionId = opts.sessionId;
		this.settings = opts.settings;
		this.nowFn = opts.now ?? (() => new Date());
		this.monotonicFn = opts.monotonic ?? (() => process.hrtime.bigint());
		this.onSecurityWarning = opts.onSecurityWarning;

		const traceDir = path.resolve(opts.settings.path);
		const jsonlPath = path.join(traceDir, `${opts.sessionId}.jsonl`);
		const spillDir = path.join(traceDir, `${opts.sessionId}.spill`);
		this.state = {
			disabled: !opts.settings.enabled,
			consecutiveFailures: 0,
			lastError: null,
			disabledEmitted: false,
			currentRotation: 0,
			traceDir,
			jsonlPath,
			spillDir,
			resolvedDirVerified: false,
		};
		this.diagnostics = !opts.settings.enabled
			? { reason: "disabled", message: "transcript.enabled=false" }
			: { reason: "ok" };
	}

	/** True when writes are currently disabled (default-off or circuit-broken). */
	isDisabled(): boolean {
		return this.state.disabled;
	}

	/**
	 * Append a single event. Never throws. On disabled writers this is a no-op.
	 */
	async write(event: TranscriptEvent): Promise<void> {
		if (this.state.disabled) return;
		try {
			await this.ensureDirectory();
			if (this.state.disabled) return;

			const envelope = this.buildEnvelope(event.envelope);
			const cloneResult = clonePayload(event.payload);
			let serialized: string;
			if (!cloneResult.ok) {
				const diagnostic = this.buildDiagnosticLine(envelope, "payload_unserializable", {
					field: "payload",
					error_class: cloneResult.error.errorClass,
					error_message: cloneResult.error.errorMessage,
				} satisfies PayloadUnserializablePayload);
				await this.appendLine(diagnostic);
				return;
			}

			const redactedPayload = redact(cloneResult.value) as Record<string, unknown>;
			const spilledPayload = await this.spillOversizedFields(envelope, redactedPayload);
			const fullRecord: Record<string, unknown> = { ...envelope, payload: spilledPayload };
			serialized = JSON.stringify(fullRecord) + "\n";
			await this.appendLine(serialized);
		} catch {
			// Already counted in appendLine path; suppress final escape.
		}
	}

	/**
	 * Idempotent retention sweep entry-point. Safe to call from session_start.
	 */
	async sweep(): Promise<{ removedFiles: number; removedSpillDirs: number }> {
		try {
			await fs.promises.mkdir(this.state.traceDir, { recursive: true });
			return await sweepRetention(this.state.traceDir, this.settings.retentionDays);
		} catch {
			return { removedFiles: 0, removedSpillDirs: 0 };
		}
	}

	// -- Internal helpers ----------------------------------------------------

	private buildEnvelope(input: TranscriptEvent["envelope"]): TranscriptEnvelope {
		const ts = input.timestamp ?? this.nowFn().toISOString();
		const monotonic = input.monotonic_ns ?? this.monotonicFn();
		return {
			schema_version: SCHEMA_VERSION,
			session_id: input.session_id ?? this.sessionId,
			turn_id: input.turn_id,
			message_id: input.message_id,
			tool_call_id: input.tool_call_id,
			trace_id: input.trace_id,
			parent_trace_id: input.parent_trace_id,
			event_type: input.event_type,
			timestamp: ts,
			monotonic_ns: monotonic.toString(),
		};
	}

	private buildDiagnosticLine(
		base: TranscriptEnvelope,
		eventType: string,
		payload: Record<string, unknown>,
	): string {
		const record: Record<string, unknown> = {
			...base,
			event_type: eventType,
			payload: redact(payload),
		};
		return JSON.stringify(record) + "\n";
	}

	private async ensureDirectory(): Promise<void> {
		if (this.state.resolvedDirVerified) return;
		try {
			await fs.promises.mkdir(this.state.traceDir, { recursive: true });
			let resolved: string;
			try {
				resolved = await fs.promises.realpath(this.state.traceDir);
			} catch {
				resolved = this.state.traceDir;
			}
			if (isCloudSyncedPath(resolved)) {
				const message = `transcript: refusing to write under cloud-synced path ${resolved}`;
				this.onSecurityWarning?.(message);
				this.state.disabled = true;
				(this.diagnostics as WriterDiagnostics).reason = "cloud_sync_rejected";
				(this.diagnostics as WriterDiagnostics).message = message;
				return;
			}
			if (process.platform !== "win32") {
				try {
					await fs.promises.chmod(this.state.traceDir, 0o700);
				} catch {
					// Non-fatal -- many filesystems (e.g. WSL on /mnt/c) reject chmod.
				}
			}
			this.state.resolvedDirVerified = true;
		} catch (err) {
			this.recordFailure(err);
		}
	}

	private async appendLine(line: string): Promise<void> {
		const targetPath = this.activeJsonlPath();
		try {
			await this.maybeRotate(targetPath, line.length);
		} catch {
			// rotation is best-effort -- if stat fails we still try to write
		}
		const finalPath = this.activeJsonlPath();

		try {
			await withFileMutationQueue(finalPath, async () => {
				await fs.promises.appendFile(finalPath, line, { encoding: "utf-8" });
				if (process.platform !== "win32") {
					try {
						await fs.promises.chmod(finalPath, 0o600);
					} catch {
						// see ensureDirectory note
					}
				}
			});
			this.state.consecutiveFailures = 0;
		} catch (err) {
			this.recordFailure(err);
			if (this.state.disabled && !this.state.disabledEmitted) {
				await this.emitDisabledEvent();
			}
		}
	}

	private activeJsonlPath(): string {
		if (this.state.currentRotation === 0) return this.state.jsonlPath;
		return path.join(
			this.state.traceDir,
			`${this.sessionId}.${this.state.currentRotation}.jsonl`,
		);
	}

	private async maybeRotate(currentPath: string, incomingBytes: number): Promise<void> {
		let stat: fs.Stats;
		try {
			stat = await fs.promises.stat(currentPath);
		} catch {
			return;
		}
		if (stat.size + incomingBytes <= this.settings.maxFileBytes) return;
		this.state.currentRotation += 1;
	}

	private async spillOversizedFields(
		envelope: TranscriptEnvelope,
		payload: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		const out: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(payload)) {
			const serialized = safeStringify(value);
			if (serialized === undefined || serialized.length <= this.settings.maxInlineBytes) {
				out[key] = value;
				continue;
			}
			const reference = await this.writeSpillFile(envelope, key, serialized);
			out[key] = reference ?? value;
		}
		return out;
	}

	private async writeSpillFile(
		envelope: TranscriptEnvelope,
		field: string,
		serialized: string,
	): Promise<SpillReference | null> {
		try {
			await fs.promises.mkdir(this.state.spillDir, { recursive: true });
			if (process.platform !== "win32") {
				try {
					await fs.promises.chmod(this.state.spillDir, 0o700);
				} catch {
					// non-fatal
				}
			}
			const eventId = envelope.message_id ?? envelope.tool_call_id ?? envelope.trace_id;
			const safeField = field.replace(/[^A-Za-z0-9_-]/g, "_");
			const fileName = `${eventId}-${safeField}.json.gz`;
			const fullPath = path.join(this.state.spillDir, fileName);
			const buffer = Buffer.from(serialized, "utf-8");
			const sha = crypto.createHash("sha256").update(buffer).digest("hex");
			const compressed = zlib.gzipSync(buffer);
			await fs.promises.writeFile(fullPath, compressed);
			if (process.platform !== "win32") {
				try {
					await fs.promises.chmod(fullPath, 0o600);
				} catch {
					// non-fatal
				}
			}
			return {
				$spill: `./${path.basename(this.state.spillDir)}/${fileName}`,
				sha256: sha,
				bytes_uncompressed: buffer.length,
			};
		} catch {
			return null;
		}
	}

	private recordFailure(err: unknown): void {
		const code = (err as NodeJS.ErrnoException)?.code;
		const message = (err as Error)?.message ?? String(err);
		this.state.lastError = message;
		if (code === "EACCES" || code === "ENOSPC") {
			this.state.consecutiveFailures += 1;
			if (this.state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
				this.state.disabled = true;
				(this.diagnostics as WriterDiagnostics).reason = "disabled";
				(this.diagnostics as WriterDiagnostics).message = `circuit_breaker:${code}`;
			}
		} else {
			// Non-quota failures (EPERM, EROFS, etc.) also count toward the breaker
			// because the writer cannot make progress. Keep the same threshold.
			this.state.consecutiveFailures += 1;
			if (this.state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
				this.state.disabled = true;
				(this.diagnostics as WriterDiagnostics).reason = "disabled";
				(this.diagnostics as WriterDiagnostics).message = `circuit_breaker:${code ?? "unknown"}`;
			}
		}
	}

	private async emitDisabledEvent(): Promise<void> {
		this.state.disabledEmitted = true;
		const envelope = this.buildEnvelope({
			session_id: this.sessionId,
			turn_id: "transcript",
			trace_id: "transcript-disabled",
			event_type: "transcript_disabled",
		});
		const payload: TranscriptDisabledPayload = {
			reason: this.diagnostics.message ?? "consecutive_write_failures",
			consecutive_failures: this.state.consecutiveFailures,
			last_error: this.state.lastError ?? "",
		};
		const line = this.buildDiagnosticLine(envelope, "transcript_disabled", { ...payload });
		// Best-effort: try one final append even though the breaker is tripped.
		try {
			await fs.promises.appendFile(this.activeJsonlPath(), line, { encoding: "utf-8" });
		} catch {
			// nothing more to do -- caller already has diagnostics on the writer
		}
	}
}

function safeStringify(value: unknown): string | undefined {
	try {
		return JSON.stringify(value);
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// Helpers used by integration extensions
// ---------------------------------------------------------------------------

/** Stable sha256 hex of `text`. Used for routing-decision prompt_hash. */
export function sha256Hex(text: string): string {
	return crypto.createHash("sha256").update(text, "utf-8").digest("hex");
}

/** Truncating excerpt helper for `prompt_excerpt`. */
export function makeExcerpt(text: string, maxChars = 240): string {
	if (typeof text !== "string") return "";
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars - 3) + "...";
}
