/**
 * Transcript log tests -- T1 acceptance criteria.
 *
 * Covers:
 *   1. Deterministic JSONL with full envelope incl. schema_version + monotonic_ns
 *   2. Three-tier redaction (headers, field-name, free-text) without mutation
 *   3. Settings loader reads ~/.pi/agent/settings.json only; default-off; mode bits;
 *      symlink defense; rotation; idempotent sweep; circuit breaker
 *   4. routing_decision schema + transcript-purge command registration
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { createMockPi } from "./helpers/mock-pi.js";
import {
	REDACTED,
	SCHEMA_VERSION,
	TranscriptWriter,
	clonePayload,
	defaultSettings,
	isCloudSyncedPath,
	isCompatibleSchemaVersion,
	isSecretKey,
	loadSettings,
	makeExcerpt,
	redact,
	redactFreeText,
	sha256Hex,
	sweepRetention,
	type RoutingDecisionPayload,
	type TranscriptSettings,
} from "../lib/transcript.ts";

const SESSION_ID = "test-session-001";

function readJsonl(filePath: string): Array<Record<string, unknown>> {
	const text = fs.readFileSync(filePath, "utf-8");
	return text
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function makeWriter(
	dir: string,
	overrides: Partial<TranscriptSettings> = {},
	monotonicStart = 1n,
): TranscriptWriter {
	let mono = monotonicStart;
	return new TranscriptWriter({
		sessionId: SESSION_ID,
		settings: {
			...defaultSettings(),
			enabled: true,
			path: dir,
			...overrides,
		},
		now: () => new Date("2026-04-25T12:00:00.000Z"),
		monotonic: () => {
			const value = mono;
			mono += 1n;
			return value;
		},
	});
}

describe("transcript schema + envelope", () => {
	let tmpDir: string;
	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-transcript-test-"));
	});
	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("writes deterministic JSONL with schema_version first and BigInt monotonic_ns stringified", async () => {
		const writer = makeWriter(tmpDir);
		await writer.write({
			envelope: {
				session_id: SESSION_ID,
				turn_id: "turn-1",
				message_id: "msg-1",
				trace_id: "trace-1",
				event_type: "llm_request",
			},
			payload: { foo: "bar" },
		});

		const records = readJsonl(path.join(tmpDir, `${SESSION_ID}.jsonl`));
		expect(records.length).toBe(1);
		const record = records[0];

		// schema_version must be the first key in the JSON output.
		const firstLine = fs
			.readFileSync(path.join(tmpDir, `${SESSION_ID}.jsonl`), "utf-8")
			.split("\n")[0];
		expect(firstLine.indexOf("\"schema_version\"")).toBe(1); // immediately after `{`
		expect(record.schema_version).toBe(SCHEMA_VERSION);
		expect(record.session_id).toBe(SESSION_ID);
		expect(record.turn_id).toBe("turn-1");
		expect(record.message_id).toBe("msg-1");
		expect(record.trace_id).toBe("trace-1");
		expect(record.event_type).toBe("llm_request");
		expect(record.timestamp).toBe("2026-04-25T12:00:00.000Z");
		expect(typeof record.monotonic_ns).toBe("string");
		expect(record.monotonic_ns).toBe("1");
	});

	it("appends without overwriting existing lines", async () => {
		const writer = makeWriter(tmpDir);
		for (let i = 0; i < 3; i++) {
			await writer.write({
				envelope: {
					session_id: SESSION_ID,
					turn_id: `turn-${i}`,
					trace_id: `trace-${i}`,
					event_type: "llm_request",
				},
				payload: { i },
			});
		}
		const records = readJsonl(path.join(tmpDir, `${SESSION_ID}.jsonl`));
		expect(records.length).toBe(3);
		expect(records.map((r) => r.turn_id)).toEqual(["turn-0", "turn-1", "turn-2"]);
		expect(records.map((r) => r.monotonic_ns)).toEqual(["1", "2", "3"]);
	});

	it("rejects parse-time records with an unknown major schema version", () => {
		expect(isCompatibleSchemaVersion("1.0.0")).toBe(true);
		expect(isCompatibleSchemaVersion("1.99.99")).toBe(true);
		expect(isCompatibleSchemaVersion("2.0.0")).toBe(false);
		expect(isCompatibleSchemaVersion(undefined)).toBe(false);
		expect(isCompatibleSchemaVersion(null)).toBe(false);
		expect(isCompatibleSchemaVersion(42)).toBe(false);
	});
});

describe("redaction surfaces", () => {
	it("redacts known case-insensitive secret header names", () => {
		expect(isSecretKey("Authorization")).toBe(true);
		expect(isSecretKey("AUTHORIZATION")).toBe(true);
		expect(isSecretKey("Set-Cookie")).toBe(true);
		expect(isSecretKey("x-api-key")).toBe(true);
		expect(isSecretKey("X-Anthropic-Api-Key")).toBe(true);
		expect(isSecretKey("openai-organization")).toBe(true);
		expect(isSecretKey("X-Amz-Security-Token")).toBe(true);
		expect(isSecretKey("Content-Type")).toBe(false);
	});

	it("redacts pattern-matching key names (api_key, secret, token, cred, auth)", () => {
		expect(isSecretKey("client_secret")).toBe(true);
		expect(isSecretKey("apiKey")).toBe(true);
		expect(isSecretKey("authToken")).toBe(true);
		expect(isSecretKey("aws_credentials")).toBe(true);
		expect(isSecretKey("user_id")).toBe(false);
	});

	it("does not redact OTel usage fields that contain 'token' as a suffix", () => {
		// Regression: token must be a standalone segment, not a substring of 'tokens'.
		expect(isSecretKey("input_tokens")).toBe(false);
		expect(isSecretKey("output_tokens")).toBe(false);
		expect(isSecretKey("max_tokens")).toBe(false);
		// Standalone 'token' still matches.
		expect(isSecretKey("token")).toBe(true);
	});

	it("does not redact field names where auth is an embedded prefix", () => {
		// Regression: 'auth' must be a standalone segment, not a substring.
		expect(isSecretKey("authentic")).toBe(false);
		expect(isSecretKey("auther")).toBe(false);
		// auth_token and authorization still match.
		expect(isSecretKey("auth_token")).toBe(true);
		expect(isSecretKey("authorization")).toBe(true);
	});

	it("preserves numeric values in OTel usage payloads after redaction (end-to-end)", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-transcript-otel-"));
		try {
			const writer = makeWriter(tmpDir);
			await writer.write({
				envelope: {
					session_id: SESSION_ID,
					turn_id: "turn-1",
					trace_id: "trace-1",
					event_type: "assistant_message",
				},
				payload: {
					"gen_ai.usage": {
						input_tokens: 1024,
						output_tokens: 312,
					},
				},
			});
			const records = readJsonl(path.join(tmpDir, `${SESSION_ID}.jsonl`));
			const payload = records[0].payload as Record<string, unknown>;
			const usage = payload["gen_ai.usage"] as Record<string, unknown>;
			expect(usage.input_tokens).toBe(1024);
			expect(usage.output_tokens).toBe(312);
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("redacts both request and response header objects", () => {
		const requestHeaders = {
			authorization: "Bearer sk-anthropic-real-secret-1234567890",
			"x-api-key": "real-key",
			"content-type": "application/json",
		};
		const responseHeaders = {
			"set-cookie": "session=secret",
			"x-request-id": "abc",
		};
		const redactedReq = redact(requestHeaders);
		const redactedRes = redact(responseHeaders);
		expect(redactedReq.authorization).toBe(REDACTED);
		expect(redactedReq["x-api-key"]).toBe(REDACTED);
		expect(redactedReq["content-type"]).toBe("application/json");
		expect(redactedRes["set-cookie"]).toBe(REDACTED);
		expect(redactedRes["x-request-id"]).toBe("abc");
	});

	it("does not mutate source objects", () => {
		const source = {
			authorization: "Bearer real-secret-token",
			nested: { token: "abc123", value: 42 },
		};
		const snapshot = JSON.parse(JSON.stringify(source));
		const result = redact(source);
		expect(source).toEqual(snapshot);
		expect(result).not.toBe(source);
		expect((result as any).authorization).toBe(REDACTED);
		expect((result as any).nested.token).toBe(REDACTED);
		expect((result as any).nested.value).toBe(42);
	});

	it("scans free text for AKIA / sk- / sk-ant- / ghp_ / Bearer / api_key / PEM", () => {
		const samples = [
			["AKIAABCDEFGHIJKLMNOP", REDACTED],
			["sk-ant-abcdefghijklmnopqrstuvwxyz", REDACTED],
			["sk-abcdefghijklmnopqrstuvwxyz12", REDACTED],
			["ghp_abcdefghijklmnopqrstuvwxyz0123456789", REDACTED],
		];
		for (const [input, expected] of samples) {
			expect(redactFreeText(input)).toBe(expected);
		}
		expect(redactFreeText("Bearer abcdefghijklmnopqrstuvwxyz123456")).toBe(
			`Bearer ${REDACTED}`,
		);
		expect(redactFreeText("api_key=abcdefghijklmnopqrstuvwxyz12")).toBe(
			`api_key=${REDACTED}`,
		);
		const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----";
		expect(redactFreeText(pem)).toBe(REDACTED);
	});

	it("masks AKIA-style keys inside tool_result content text via the writer pipeline", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-transcript-redact-"));
		try {
			const writer = makeWriter(tmpDir);
			await writer.write({
				envelope: {
					session_id: SESSION_ID,
					turn_id: "turn-1",
					tool_call_id: "tc-1",
					trace_id: "trace-1",
					event_type: "tool_result",
				},
				payload: {
					tool_name: "bash",
					content: [{ type: "text", text: "echo AKIAABCDEFGHIJKLMNOP" }],
					details: {
						stdout: "AKIAABCDEFGHIJKLMNOP\nfine output",
					},
				},
			});
			const records = readJsonl(path.join(tmpDir, `${SESSION_ID}.jsonl`));
			const text = JSON.stringify(records[0]);
			expect(text).not.toContain("AKIAABCDEFGHIJKLMNOP");
			expect(text).toContain(REDACTED);
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("emits payload_unserializable for circular references and never throws", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-transcript-cycle-"));
		try {
			const writer = makeWriter(tmpDir);
			const cyclic: Record<string, unknown> = { name: "loop" };
			cyclic.self = cyclic;
			await writer.write({
				envelope: {
					session_id: SESSION_ID,
					turn_id: "turn-1",
					trace_id: "trace-1",
					event_type: "llm_request",
				},
				payload: cyclic,
			});
			const records = readJsonl(path.join(tmpDir, `${SESSION_ID}.jsonl`));
			expect(records.length).toBe(1);
			expect(records[0].event_type).toBe("payload_unserializable");
			const payload = records[0].payload as Record<string, unknown>;
			expect(payload.field).toBe("payload");
			expect(typeof payload.error_class).toBe("string");
			expect(typeof payload.error_message).toBe("string");
			// Source object must be untouched (still cyclic).
			expect(cyclic.self).toBe(cyclic);
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("clonePayload returns ok:false on circular references without throwing", () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		const result = clonePayload(cyclic);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.errorClass).toBeTypeOf("string");
			expect(result.error.errorMessage.length).toBeGreaterThan(0);
		}
	});
});

describe("settings loader", () => {
	let tmpHome: string;
	let originalHome: string | undefined;
	let originalUserProfile: string | undefined;
	beforeEach(() => {
		tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-transcript-settings-"));
		originalHome = process.env.HOME;
		originalUserProfile = process.env.USERPROFILE;
		process.env.HOME = tmpHome;
		process.env.USERPROFILE = tmpHome;
	});
	afterEach(() => {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		if (originalUserProfile === undefined) delete process.env.USERPROFILE;
		else process.env.USERPROFILE = originalUserProfile;
		fs.rmSync(tmpHome, { recursive: true, force: true });
	});

	it("defaults transcript.enabled to false when no settings.json exists", () => {
		const settings = loadSettings(tmpHome);
		expect(settings.enabled).toBe(false);
	});

	it("reads transcript.enabled from ~/.pi/agent/settings.json when present", () => {
		const settingsPath = path.join(tmpHome, ".pi", "agent", "settings.json");
		fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
		fs.writeFileSync(
			settingsPath,
			JSON.stringify({
				transcript: {
					enabled: true,
					maxFileBytes: 1024,
					maxInlineBytes: 256,
					retentionDays: 7,
				},
			}),
			"utf-8",
		);
		const settings = loadSettings(tmpHome);
		expect(settings.enabled).toBe(true);
		expect(settings.maxFileBytes).toBe(1024);
		expect(settings.maxInlineBytes).toBe(256);
		expect(settings.retentionDays).toBe(7);
	});

	it("ignores repo-tracked pi/settings.json when loading the runtime toggle", () => {
		// The repo settings file should never be consulted. We simulate this by
		// dropping a competing config under a likely repo path -- the loader must
		// stay focused on $HOME/.pi/agent/settings.json.
		const repoSettingsDir = path.join(tmpHome, ".dotfiles", "pi");
		fs.mkdirSync(repoSettingsDir, { recursive: true });
		fs.writeFileSync(
			path.join(repoSettingsDir, "settings.json"),
			JSON.stringify({ transcript: { enabled: true } }),
			"utf-8",
		);
		const settings = loadSettings(tmpHome);
		expect(settings.enabled).toBe(false);
	});
});

describe("storage and runtime safety", () => {
	let tmpDir: string;
	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-transcript-storage-"));
	});
	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("default-off writer is a no-op (creates no file)", async () => {
		const writer = new TranscriptWriter({
			sessionId: SESSION_ID,
			settings: { ...defaultSettings(), path: tmpDir },
		});
		expect(writer.isDisabled()).toBe(true);
		await writer.write({
			envelope: {
				session_id: SESSION_ID,
				turn_id: "turn-1",
				trace_id: "trace-1",
				event_type: "llm_request",
			},
			payload: { foo: "bar" },
		});
		expect(fs.existsSync(path.join(tmpDir, `${SESSION_ID}.jsonl`))).toBe(false);
	});

	it("creates trace dir 0700 and JSONL file 0600 on Linux/WSL", async () => {
		if (process.platform === "win32") return; // Windows skips chmod by design
		const writer = makeWriter(tmpDir);
		await writer.write({
			envelope: {
				session_id: SESSION_ID,
				turn_id: "turn-1",
				trace_id: "trace-1",
				event_type: "llm_request",
			},
			payload: { foo: "bar" },
		});
		const dirMode = fs.statSync(tmpDir).mode & 0o777;
		const fileMode = fs.statSync(path.join(tmpDir, `${SESSION_ID}.jsonl`)).mode & 0o777;
		expect(dirMode).toBe(0o700);
		expect(fileMode).toBe(0o600);
	});

	it("rejects trace paths under cloud-sync directories (symlink defense)", () => {
		expect(isCloudSyncedPath("/Users/foo/OneDrive/traces")).toBe(true);
		expect(isCloudSyncedPath("/Users/foo/Dropbox/traces")).toBe(true);
		expect(isCloudSyncedPath("/Users/foo/iCloudDrive/traces")).toBe(true);
		expect(isCloudSyncedPath("/Users/foo/Google Drive/traces")).toBe(true);
		expect(isCloudSyncedPath("C:\\Users\\foo\\OneDrive\\traces")).toBe(true);
		expect(isCloudSyncedPath("/home/foo/.pi/agent/traces")).toBe(false);
	});

	it("disables tracing with one warning when the trace path resolves into OneDrive", async () => {
		const cloudDir = path.join(tmpDir, "OneDrive", "traces");
		const warnings: string[] = [];
		const writer = new TranscriptWriter({
			sessionId: SESSION_ID,
			settings: { ...defaultSettings(), enabled: true, path: cloudDir },
			now: () => new Date("2026-04-25T12:00:00.000Z"),
			monotonic: () => 1n,
			onSecurityWarning: (m) => warnings.push(m),
		});
		await writer.write({
			envelope: {
				session_id: SESSION_ID,
				turn_id: "turn-1",
				trace_id: "trace-1",
				event_type: "llm_request",
			},
			payload: {},
		});
		expect(warnings.length).toBe(1);
		expect(writer.isDisabled()).toBe(true);
		expect(writer.diagnostics.reason).toBe("cloud_sync_rejected");
		// The writer should not have created a .jsonl file under the cloud path.
		const jsonl = path.join(cloudDir, `${SESSION_ID}.jsonl`);
		expect(fs.existsSync(jsonl)).toBe(false);
	});

	it("rotates to <session>.<n>.jsonl when maxFileBytes is exceeded", async () => {
		const writer = makeWriter(tmpDir, { maxFileBytes: 256 });
		const longPayload = { blob: "x".repeat(400) };
		for (let i = 0; i < 4; i++) {
			await writer.write({
				envelope: {
					session_id: SESSION_ID,
					turn_id: `t${i}`,
					trace_id: `trace-${i}`,
					event_type: "llm_request",
				},
				payload: longPayload,
			});
		}
		const entries = fs.readdirSync(tmpDir).sort();
		const jsonlFiles = entries.filter((n) => n.endsWith(".jsonl"));
		expect(jsonlFiles.length).toBeGreaterThanOrEqual(2);
		// At least one rotated file must exist.
		expect(jsonlFiles.some((n) => /\.\d+\.jsonl$/.test(n))).toBe(true);
	});

	it("spills oversized payload fields to gzipped files with sha256 + bytes_uncompressed", async () => {
		const writer = makeWriter(tmpDir, { maxInlineBytes: 64 });
		const big = "x".repeat(2048);
		await writer.write({
			envelope: {
				session_id: SESSION_ID,
				turn_id: "turn-1",
				message_id: "msg-1",
				trace_id: "trace-1",
				event_type: "llm_request",
			},
			payload: { huge: big, small: "ok" },
		});
		const records = readJsonl(path.join(tmpDir, `${SESSION_ID}.jsonl`));
		const payload = records[0].payload as Record<string, unknown>;
		expect(payload.small).toBe("ok");
		const huge = payload.huge as Record<string, unknown>;
		expect(typeof huge.$spill).toBe("string");
		expect(typeof huge.sha256).toBe("string");
		expect(typeof huge.bytes_uncompressed).toBe("number");
		// Verify the spill file actually exists and decompresses.
		const spillFile = path.join(tmpDir, `${SESSION_ID}.spill`, path.basename(huge.$spill as string));
		expect(fs.existsSync(spillFile)).toBe(true);
		const decompressed = zlib.gunzipSync(fs.readFileSync(spillFile)).toString("utf-8");
		expect(decompressed).toContain("xxxx");
	});

	it("retention sweep is idempotent and removes only old files", async () => {
		const oldFile = path.join(tmpDir, "old.jsonl");
		const newFile = path.join(tmpDir, "new.jsonl");
		fs.writeFileSync(oldFile, "x");
		fs.writeFileSync(newFile, "y");
		// Backdate old.jsonl by 30 days.
		const past = (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000;
		fs.utimesSync(oldFile, past, past);

		const first = await sweepRetention(tmpDir, 14);
		expect(first.removedFiles).toBe(1);
		expect(fs.existsSync(oldFile)).toBe(false);
		expect(fs.existsSync(newFile)).toBe(true);

		const second = await sweepRetention(tmpDir, 14);
		expect(second.removedFiles).toBe(0); // idempotent
	});

	it("circuit breaker emits transcript_disabled after 3 consecutive write failures", async () => {
		// Force a write failure by pointing the writer at a path whose parent is a file
		// (mkdir succeeds but appendFile cannot be issued because the path is invalid).
		const blocker = path.join(tmpDir, "blocker");
		fs.writeFileSync(blocker, "not a directory");
		const writer = new TranscriptWriter({
			sessionId: SESSION_ID,
			settings: { ...defaultSettings(), enabled: true, path: path.join(blocker, "nested") },
			now: () => new Date("2026-04-25T12:00:00.000Z"),
			monotonic: () => 1n,
		});
		for (let i = 0; i < 4; i++) {
			await writer.write({
				envelope: {
					session_id: SESSION_ID,
					turn_id: `t${i}`,
					trace_id: `trace-${i}`,
					event_type: "llm_request",
				},
				payload: { i },
			});
		}
		expect(writer.isDisabled()).toBe(true);
	});

	it("write() never throws when the trace dir cannot be created", async () => {
		const writer = new TranscriptWriter({
			sessionId: SESSION_ID,
			settings: { ...defaultSettings(), enabled: true, path: path.join("\0", "bad") },
		});
		await expect(
			writer.write({
				envelope: {
					session_id: SESSION_ID,
					turn_id: "t1",
					trace_id: "trace-1",
					event_type: "llm_request",
				},
				payload: {},
			}),
		).resolves.toBeUndefined();
	});
});

describe("routing decision schema and purge command", () => {
	let tmpDir: string;
	let tmpHome: string;
	let originalHome: string | undefined;
	let originalUserProfile: string | undefined;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-transcript-routing-"));
		tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-transcript-purgehome-"));
		originalHome = process.env.HOME;
		originalUserProfile = process.env.USERPROFILE;
		process.env.HOME = tmpHome;
		process.env.USERPROFILE = tmpHome;
	});
	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		fs.rmSync(tmpHome, { recursive: true, force: true });
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		if (originalUserProfile === undefined) delete process.env.USERPROFILE;
		else process.env.USERPROFILE = originalUserProfile;
	});

	it("encodes the full routing_decision envelope without ambiguity", async () => {
		const writer = makeWriter(tmpDir);
		const promptText = "Refactor the auth pipeline to use JWT.";
		const decision: RoutingDecisionPayload = {
			prompt_hash: sha256Hex(promptText),
			prompt_excerpt: makeExcerpt(promptText),
			raw_classifier_output: { primary: { model_tier: "Sonnet", effort: "medium" }, confidence: 0.81 },
			applied_route: "mid:medium",
			confidence: 0.81,
			rule_fired: "classifier",
			fallback_metadata: { cap: null, hysteresis: null },
		};
		await writer.write({
			envelope: {
				session_id: SESSION_ID,
				turn_id: "turn-1",
				trace_id: "trace-1",
				event_type: "routing_decision",
			},
			payload: { ...decision },
		});
		const records = readJsonl(path.join(tmpDir, `${SESSION_ID}.jsonl`));
		expect(records.length).toBe(1);
		const payload = records[0].payload as Record<string, unknown>;
		expect(payload.prompt_hash).toBe(decision.prompt_hash);
		expect(payload.prompt_excerpt).toBe(decision.prompt_excerpt);
		expect(payload.applied_route).toBe("mid:medium");
		expect(payload.confidence).toBe(0.81);
		expect(payload.rule_fired).toBe("classifier");
		expect(payload.raw_classifier_output).toBeDefined();
		expect(payload.fallback_metadata).toEqual({ cap: null, hysteresis: null });
	});

	it("registers /transcript-purge command and removes old trace+spill files", async () => {
		// Set the per-user transcript path to the test dir.
		const settingsPath = path.join(tmpHome, ".pi", "agent", "settings.json");
		fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
		fs.writeFileSync(
			settingsPath,
			JSON.stringify({ transcript: { enabled: true, path: tmpDir, retentionDays: 14 } }),
			"utf-8",
		);

		// Drop a couple of trace artifacts in the fake trace dir.
		const oldJsonl = path.join(tmpDir, "old-session.jsonl");
		const oldSpill = path.join(tmpDir, "old-session.spill");
		fs.writeFileSync(oldJsonl, "x");
		fs.mkdirSync(oldSpill, { recursive: true });
		fs.writeFileSync(path.join(oldSpill, "evt.json.gz"), "gz");

		const mockPi = createMockPi();
		const mod = await import("../extensions/transcript-purge.ts");
		mod.default(mockPi as any);
		const purge = mockPi._commands.find((c) => c.name === "transcript-purge");
		expect(purge).toBeDefined();

		const ctx = {
			ui: {
				notify: () => {},
				confirm: async () => true,
				input: async () => undefined,
				select: async () => undefined,
			},
		};
		await purge!.handler("", ctx as any);
		expect(fs.existsSync(oldJsonl)).toBe(false);
		expect(fs.existsSync(oldSpill)).toBe(false);
	});
});
