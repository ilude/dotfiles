/**
 * Behavioral tests for context.ts buildContextBuckets.
 *
 * Per Phase 2 plan T3 AC#3: an estimate run produces an array where each
 * element has a label (string), tokens (number), and details (string)
 * field. The test asserts the per-bucket shape, not just array length.
 *
 * Fake entry shape mirrors Pi's session-log format: every entry is wrapped
 * as `{ type: "message", message: { role, content | toolName, ... } }`
 * where role is "user" | "assistant" | "toolResult" | "bashExecution".
 */
import { describe, it, expect, vi } from "vitest";
import registerContextCommand, {
	buildContextBuckets,
	buildContextFileDetailBuckets,
	buildInjectedContextDetailBuckets,
	buildSkillPromptDetailBuckets,
	buildToolSchemaBuckets,
	type Bucket,
} from "../extensions/context.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

function userMessage(text: string): Record<string, any> {
	return {
		type: "message",
		message: { role: "user", content: [{ type: "text", text }] },
	};
}

function assistantText(text: string): Record<string, any> {
	return {
		type: "message",
		message: { role: "assistant", content: [{ type: "text", text }] },
	};
}

function assistantToolCall(name: string, args: Record<string, any>): Record<string, any> {
	return {
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "toolCall", name, arguments: args }],
		},
	};
}

function toolResult(text: string, toolName = "read"): Record<string, any> {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolName,
			content: [{ type: "text", text }],
		},
	};
}

function assertValidBucket(b: Bucket): void {
	expect(typeof b.label).toBe("string");
	expect(b.label.length).toBeGreaterThan(0);
	expect(typeof b.tokens).toBe("number");
	expect(b.tokens).toBeGreaterThanOrEqual(0);
	expect(Number.isFinite(b.tokens)).toBe(true);
	expect(typeof b.details).toBe("string");
}

describe("context extension: buildContextBuckets", () => {
	it("returns an array of well-formed Bucket objects", () => {
		const entries = [userMessage("hello"), assistantText("hi there")];
		const buckets = buildContextBuckets(entries, "you are a helpful assistant");
		expect(Array.isArray(buckets)).toBe(true);
		expect(buckets.length).toBeGreaterThan(0);
		for (const b of buckets) assertValidBucket(b);
	});

	it("contains a labeled bucket for the system prompt", () => {
		const buckets = buildContextBuckets([], "system text here");
		const systemBucket = buckets.find((b) => /system/i.test(b.label));
		expect(systemBucket).toBeDefined();
		assertValidBucket(systemBucket!);
		expect(systemBucket!.tokens).toBeGreaterThan(0);
	});

	it("preserves the system prompt bucket even with empty inputs", () => {
		const buckets = buildContextBuckets([], "");
		// System prompt is always retained even at zero tokens; other zero
		// buckets are filtered out by buildContextBuckets.
		expect(buckets.length).toBeGreaterThan(0);
		expect(buckets.find((b) => /system/i.test(b.label))).toBeDefined();
		for (const b of buckets) assertValidBucket(b);
	});

	it("does not report tool schema tokens when no tools are active", () => {
		const buckets = buildContextBuckets([], "", undefined, []);
		expect(buckets.find((bucket) => bucket.label === "Tool schemas")).toBeUndefined();
	});

	it("accounts for active tool descriptions and parameter schemas", () => {
		const buckets = buildContextBuckets([], "", undefined, [
			{
				name: "large_tool",
				description: "A tool with a provider-visible description",
				parameters: {
					type: "object",
					properties: {
						query: { type: "string", description: "Search query text" },
					},
				},
			},
		]);
		const schemaBucket = buckets.find((b) => b.label === "Tool schemas");
		expect(schemaBucket).toBeDefined();
		expect(schemaBucket!.tokens).toBeGreaterThan(0);
		expect(schemaBucket!.details).toContain("1 active tool");
	});

	it("reports per-tool schema weight and its main sources", () => {
		const schemas = buildToolSchemaBuckets([
			{ name: "small", description: "short", parameters: {} },
			{
				name: "large",
				description: "A larger tool description used by the provider",
				parameters: {
					type: "object",
					properties: {
						query: { type: "string", description: "A detailed query parameter" },
					},
				},
			},
		]);

		expect(schemas.map((schema) => schema.label)).toEqual(["large", "small"]);
		expect(schemas[0].details).toMatch(/parameters \d+, description \d+/);
		expect(schemas[0].tokens).toBeGreaterThan(schemas[1].tokens);
	});

	it("attributes rendered prompt wrappers and locations to their owning buckets", () => {
		const systemPrompt = "p".repeat(8_000);
		const buckets = buildContextBuckets([], systemPrompt, {
			selectedTools: ["read", "bash"],
			toolSnippets: { read: "Read a file" },
			promptGuidelines: ["Use read for source files"],
			contextFiles: [{ path: "C:/repo/AGENTS.md", content: "x".repeat(80) }],
			skills: [
				{
					name: "example",
					description: "Example skill",
					filePath: "C:/Users/Mike/.pi/agent/skills/example/SKILL.md",
					baseDir: "C:/Users/Mike/.pi/agent/skills/example",
					sourceInfo: {},
					disableModelInvocation: false,
				} as never,
			],
		});
		const byLabel = new Map(buckets.map((item) => [item.label, item]));

		expect(buckets.reduce((sum, item) => sum + item.tokens, 0)).toBe(2_000);
		expect(byLabel.get("Tool instructions")?.details).toContain("1 visible tool snippet");
		expect(byLabel.get("Context files")?.details).toContain("rendered wrappers and paths");
		expect(byLabel.get("Skills")?.details).toContain("wrappers, and locations");
		expect(byLabel.get("Skills")!.tokens).toBeGreaterThan(100);
		expect(byLabel.has("Pi prompt framework")).toBe(true);
	});

	it("details context files without exposing their content", () => {
		const files = [
			{ path: "C:/repo/AGENTS.md", content: "private-root-rule" },
			{ path: "C:/repo/src/AGENTS.md", content: "private-source-rule" },
		];
		const details = buildContextFileDetailBuckets(files);
		const promptBucket = buildContextBuckets([], "p".repeat(4_000), {
			contextFiles: files,
		}).find((item) => item.label === "Context files");

		expect(details.map((item) => item.label)).toEqual([
			"C:/repo/AGENTS.md",
			"C:/repo/src/AGENTS.md",
			"Shared section wrapper",
		]);
		expect(details.reduce((sum, item) => sum + item.tokens, 0)).toBe(
			promptBucket?.tokens,
		);
		expect(JSON.stringify(details)).not.toContain("private-root-rule");
		expect(JSON.stringify(details)).not.toContain("private-source-rule");
	});

	it("groups provider-visible injected context by custom type", () => {
		const entries = [
			{ type: "custom_message", customType: "status", content: "x".repeat(40) },
			{ type: "custom_message", customType: "status", content: "y".repeat(20) },
			{ type: "custom_message", customType: "feature", content: "z".repeat(12) },
			{
				type: "custom_message",
				customType: "workflow.hiddenPrompt",
				content: "stale workflow instructions",
			},
			{ type: "custom_message", customType: "context-report", content: "report" },
		];
		const details = buildInjectedContextDetailBuckets(entries);
		const injected = buildContextBuckets(entries, "").find(
			(item) => item.label === "Injected context",
		);

		expect(details.map((item) => item.label)).toEqual([
			"status",
			"workflow.hiddenPrompt",
			"feature",
		]);
		expect(details[0].details).toContain("2 custom message");
		expect(details.reduce((sum, item) => sum + item.tokens, 0)).toBe(
			injected?.tokens,
		);
	});

	it("reconciles skill prompt component estimates", () => {
		const skills = [
			{
				name: "xml-skill",
				description: "Use for A & B < C",
				filePath: "C:/skills/xml-skill/SKILL.md",
				baseDir: "C:/skills/xml-skill",
				sourceInfo: {},
				disableModelInvocation: false,
			},
			{
				name: "explicit-only",
				description: "Hidden from the model",
				filePath: "C:/skills/explicit-only/SKILL.md",
				baseDir: "C:/skills/explicit-only",
				sourceInfo: {},
				disableModelInvocation: true,
			},
		] as never;
		const details = buildSkillPromptDetailBuckets(skills, true);
		const skillBucket = buildContextBuckets([], "p".repeat(4_000), {
			selectedTools: ["read"],
			skills,
		}).find((item) => item.label === "Skills");

		expect(details.map((item) => item.label)).toEqual([
			"Names",
			"Descriptions",
			"Locations",
			"Wrappers",
		]);
		expect(details.reduce((sum, item) => sum + item.tokens, 0)).toBe(
			skillBucket?.tokens,
		);
		expect(details[0].details).toContain("1 model-visible skill");
		expect(buildSkillPromptDetailBuckets(skills, false)).toEqual([]);
	});

	it("attributes user message text to a user-labeled bucket", () => {
		const userText = "this is a unique user message that approximates many tokens";
		const buckets = buildContextBuckets([userMessage(userText)], "");
		const userBucket = buckets.find((b) => /user/i.test(b.label));
		expect(userBucket).toBeDefined();
		expect(userBucket!.tokens).toBeGreaterThan(0);
	});

	it("attributes tool call arguments to a tool-call-labeled bucket", () => {
		const buckets = buildContextBuckets(
			[assistantToolCall("read", { path: "/some/path/that/has/non/trivial/length.ts" })],
			"",
		);
		const toolCallBucket = buckets.find((b) => /tool calls/i.test(b.label));
		expect(toolCallBucket).toBeDefined();
		expect(toolCallBucket!.tokens).toBeGreaterThan(0);
	});

	it("attributes tool result text to a tool-result-labeled bucket", () => {
		const buckets = buildContextBuckets(
			[toolResult("ten thousand bytes of file content here for tokens", "read")],
			"",
		);
		const toolResultBucket = buckets.find((b) => /tool results/i.test(b.label));
		expect(toolResultBucket).toBeDefined();
		expect(toolResultBucket!.tokens).toBeGreaterThan(0);
	});

	it("uses the full estimate before provider usage is available", async () => {
		const pi = createMockPi();
		registerContextCommand(pi as never);
		const entries = [
			{
				type: "custom_message",
				customType: "startup-status",
				content: "x".repeat(100),
			},
		];
		const ctx = {
			waitForIdle: vi.fn(async () => {}),
			ui: { setWidget: vi.fn(), notify: vi.fn() },
			sessionManager: {
				getBranch: () => entries,
				getEntries: () => entries,
				getSessionFile: () => "session.jsonl",
			},
			getContextUsage: () => ({ tokens: 25, contextWindow: 1_000, percent: 2.5 }),
			getSystemPrompt: () => "s".repeat(400),
			model: { provider: "test", id: "model", contextWindow: 1_000 },
		};

		const command = pi._commands.find((item) => item.name === "context");
		await command!.handler("", ctx);

		const report = pi.sendMessage.mock.calls[0][0].content as string;
		expect(report).toContain("125 / 1.0k  ~12.5% - provider usage unavailable");
		expect(report).toMatch(/System prompt\s+100\s+80\.0%/);
		expect(report).toMatch(/Injected context\s+25\s+20\.0%/);
		expect(report).toMatch(/Injected context detail\nstartup-status\s+25/);
		expect(report).toMatch(/Estimate reconciliation\nPi context estimate\s+125/);
		expect(report).toMatch(/Component estimate\s+125/);
		const percentages = [...report.matchAll(/(\d+\.\d)%/g)].map((match) => Number(match[1]));
		expect(percentages.every((percent) => percent <= 100)).toBe(true);

		pi.registerTool({
			name: "schema_probe",
			description: "Probe schema accounting",
			parameters: { type: "object", properties: { value: { type: "string" } } },
		});
		await command!.handler("", ctx);
		const schemaReport = pi.sendMessage.mock.calls[1][0].content as string;
		expect(schemaReport).toMatch(/Tool schema detail\nschema_probe\s+\d+/);
		expect(schemaReport).toMatch(/schema_probe.*parameters \d+, description \d+/);
	});

	it("shows the remainder between Pi and component estimates", async () => {
		const pi = createMockPi();
		registerContextCommand(pi as never);
		const entries = [
			{
				type: "message",
				message: {
					role: "assistant",
					content: [],
					stopReason: "stop",
					usage: { totalTokens: 150, input: 150, output: 0, cacheRead: 0, cacheWrite: 0 },
				},
			},
		];
		const ctx = {
			waitForIdle: vi.fn(async () => {}),
			ui: { setWidget: vi.fn(), notify: vi.fn() },
			sessionManager: {
				getBranch: () => entries,
				getEntries: () => entries,
				getSessionFile: () => "session.jsonl",
			},
			getContextUsage: () => ({ tokens: 150, contextWindow: 1_000, percent: 15 }),
			getSystemPrompt: () => "s".repeat(400),
			model: { provider: "test", id: "model", contextWindow: 1_000 },
		};

		await pi._commands.find((item) => item.name === "context")!.handler("", ctx);

		const report = pi.sendMessage.mock.calls[0][0].content as string;
		expect(report).toContain("150 / 1.0k  15.0% - provider usage plus trailing estimate");
		expect(report).toMatch(/Pi context estimate\s+150/);
		expect(report).toMatch(/Component estimate\s+100/);
		expect(report).toMatch(/Unattributed remainder\s+50/);
	});

	it("renders bounded prompt and injected-context detail without message bodies", async () => {
		const pi = createMockPi();
		registerContextCommand(pi as never);
		const entries = [
			{
				type: "custom_message",
				customType: "test-context",
				content: "custom-message-secret",
			},
		];
		const options = {
			selectedTools: ["read"],
			contextFiles: [
				{ path: "C:/repo/AGENTS.md", content: "file-body-secret" },
			],
			skills: [
				{
					name: "example",
					description: "skill-description-secret",
					filePath: "C:/skills/example/SKILL.md",
					baseDir: "C:/skills/example",
					sourceInfo: {},
					disableModelInvocation: false,
				},
			] as never,
		};
		const ctx = {
			waitForIdle: vi.fn(async () => {}),
			ui: { setWidget: vi.fn(), notify: vi.fn() },
			sessionManager: {
				getBranch: () => entries,
				getEntries: () => entries,
				getSessionFile: () => "session.jsonl",
			},
			getContextUsage: () => ({ tokens: 1, contextWindow: 10_000, percent: 0.01 }),
			getSystemPrompt: () => "s".repeat(4_000),
			getSystemPromptOptions: () => options,
			model: { provider: "test", id: "model", contextWindow: 10_000 },
		};

		await pi._commands.find((item) => item.name === "context")!.handler("", ctx);

		const report = pi.sendMessage.mock.calls[0][0].content as string;
		expect(report).toMatch(/Context file detail\nC:\/repo\/AGENTS\.md/);
		expect(report).toMatch(/Skill prompt detail\nNames/);
		expect(report).toMatch(/Injected context detail\ntest-context/);
		expect(report).not.toContain("file-body-secret");
		expect(report).not.toContain("custom-message-secret");
		expect(report).not.toContain("skill-description-secret");
	});
});
