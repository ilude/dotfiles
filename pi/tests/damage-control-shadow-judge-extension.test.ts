import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	judge: vi.fn(),
	settings: {} as Record<string, unknown>,
}));

vi.mock("../lib/damage-control-judge.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../lib/damage-control-judge.ts")>()),
	judgeDamageControl: testState.judge,
}));
vi.mock("../lib/settings-loader.js", () => ({
	readMergedSettings: () => testState.settings,
}));

type ToolCallHandler = (
	event: {
		toolName: string;
		toolCallId?: string;
		input: Record<string, string>;
	},
	ctx: {
		cwd: string;
		hasUI: boolean;
		ui: {
			confirm: ReturnType<typeof vi.fn>;
			notify: ReturnType<typeof vi.fn>;
			setStatus: ReturnType<typeof vi.fn>;
		};
		modelRegistry: object;
	},
) => Promise<unknown>;

let root: string;
let previousOperatorDir: string | undefined;
let previousMetricsDir: string | undefined;
let previousPolicyPath: string | undefined;

function nativePolicy(): string {
	return [
		"dangerous_commands:",
		'  - pattern: "(?<!git\\\\s)(?<!docker\\\\s)\\\\brm\\\\s+(-[^\\\\s]*)*-[rRf]"',
		'    regex: "(?<!git\\\\s)(?<!docker\\\\s)\\\\brm\\\\s+(-[^\\\\s]*)*-[rRf]"',
		"    reason: rm with recursive or force flags",
		"    action: ask",
		"    tools: [bash]",
		"zero_access_paths: []",
		"no_delete_paths:",
		"  - protected",
	].join("\n");
}

async function registerExtension(): Promise<{
	bashHandler: ToolCallHandler;
	commands: Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>;
}> {
	vi.resetModules();
	const mod = await import("../extensions/damage-control.ts");
	const handlers: ToolCallHandler[] = [];
	const commands = new Map<
		string,
		{ handler: (args: string, ctx: unknown) => Promise<void> }
	>();
	mod.default({
		on: vi.fn((name: string, handler: ToolCallHandler) => {
			if (name === "tool_call") handlers.push(handler);
		}),
		registerCommand: vi.fn((name: string, command) => {
			commands.set(name, command);
		}),
		sendMessage: vi.fn(),
	} as unknown as Parameters<typeof mod.default>[0]);
	const bashHandler = handlers[0];
	if (!bashHandler) throw new Error("bash handler not registered");
	return { bashHandler, commands };
}

function context(hasUI: boolean, confirm = vi.fn(async () => false)) {
	return {
		cwd: root,
		hasUI,
		ui: { confirm, notify: vi.fn(), setStatus: vi.fn() },
		modelRegistry: {},
	};
}

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-damage-control-shadow-"));
	previousOperatorDir = process.env.PI_OPERATOR_DIR;
	previousMetricsDir = process.env.PI_METRICS_DIR;
	previousPolicyPath = process.env.PI_DAMAGE_CONTROL_POLICY_PATH;
	process.env.PI_OPERATOR_DIR = path.join(root, "operator");
	process.env.PI_METRICS_DIR = path.join(root, "metrics");
	process.env.PI_DAMAGE_CONTROL_POLICY_PATH = path.join(root, "policy.yaml");
	fs.writeFileSync(process.env.PI_DAMAGE_CONTROL_POLICY_PATH, nativePolicy(), "utf-8");
	testState.settings = {};
	testState.judge.mockReset();
	testState.judge.mockResolvedValue(undefined);
});

afterEach(() => {
	if (previousOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = previousOperatorDir;
	if (previousMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
	else process.env.PI_METRICS_DIR = previousMetricsDir;
	if (previousPolicyPath === undefined) delete process.env.PI_DAMAGE_CONTROL_POLICY_PATH;
	else process.env.PI_DAMAGE_CONTROL_POLICY_PATH = previousPolicyPath;
	fs.rmSync(root, { recursive: true, force: true });
});

describe("damage-control scoped delete and shadow judge extension wiring", () => {
	it.each([
		["curl --token token-value https://example.test", "token-value"],
		["tool --password password-value", "password-value"],
		["curl --user user:password https://example.test", "user:password"],
		["curl -uuser:password https://example.test", "user:password"],
		["curl --proxy-user proxy:password https://example.test", "proxy:password"],
		["curl --oauth2-bearer bearer-value https://example.test", "bearer-value"],
		["curl -H 'Authorization: Bearer header-value' https://example.test", "Authorization: Bearer header-value"],
		["curl --header=Private-Token:header-value https://example.test", "Private-Token:header-value"],
		["curl --proxy-header 'Cookie: session-value' https://example.test", "Cookie: session-value"],
	])("redacts credential and header values before shadow judging", async (command, secret) => {
		const { redactShadowJudgeCommand } = await import(
			"../extensions/damage-control.ts"
		);
		const sanitized = redactShadowJudgeCommand(command);
		expect(sanitized).toContain("[redacted]");
		expect(sanitized).not.toContain(secret);
	});

	it("skips shadow judging when shell syntax cannot be completely sanitized", async () => {
		const { redactShadowJudgeCommand } = await import(
			"../extensions/damage-control.ts"
		);
		expect(redactShadowJudgeCommand("tool --token $(get-token)")).toBeUndefined();
	});

	it("auto-allows a contained delete without confirmation and records telemetry", async () => {
		const { bashHandler } = await registerExtension();
		const confirm = vi.fn(async () => false);

		await expect(
			bashHandler(
				{
					toolName: "bash",
					toolCallId: "contained-delete",
					input: { command: "rm -rf build" },
				},
				context(true, confirm),
			),
		).resolves.toBeUndefined();
		expect(confirm).not.toHaveBeenCalled();
		const { listDamageControlEvalEvents } = await import(
			"../lib/damage-control-eval.ts"
		);
		expect(listDamageControlEvalEvents()).toEqual([
			expect.objectContaining({
				decisionType: "auto_allowed",
				toolCallId: "contained-delete",
				tier: "scoped_delete",
			}),
		]);
	});

	it("keeps an outside delete interactive", async () => {
		const { bashHandler } = await registerExtension();
		const confirm = vi.fn(async () => false);

		await expect(
			bashHandler(
				{
					toolName: "bash",
					toolCallId: "outside-delete",
					input: { command: "rm -rf ../outside" },
				},
				context(true, confirm),
			),
		).resolves.toMatchObject({ block: true });
		expect(confirm).toHaveBeenCalledOnce();
	});

	it("runs the enabled judge without delaying the prompt and correlates its event", async () => {
		testState.settings = { damageControl: { judge: { enabled: true } } };
		const { bashHandler } = await registerExtension();
		const confirm = vi.fn(async () => true);

		await expect(
			bashHandler(
				{
					toolName: "bash",
					toolCallId: "judge-approved",
					input: { command: "rm -rf ../outside" },
				},
				context(true, confirm),
			),
		).resolves.toBeUndefined();
		expect(confirm).toHaveBeenCalledOnce();
		expect(testState.judge).toHaveBeenCalledOnce();
		const { listDamageControlEvalEvents } = await import(
			"../lib/damage-control-eval.ts"
		);
		const event = listDamageControlEvalEvents().find(
			(entry) => entry.toolCallId === "judge-approved",
		);
		expect(event).toMatchObject({ decisionType: "ask_approved" });
		expect(testState.judge.mock.calls[0]?.[0]).toMatchObject({
			eventId: event?.id,
			command: "rm -rf ../outside",
		});
	});

	it("does not run the disabled judge and reports judge agreement through /dc", async () => {
		const { bashHandler, commands } = await registerExtension();
		const confirm = vi.fn(async () => false);
		await bashHandler(
			{
				toolName: "bash",
				toolCallId: "judge-disabled",
				input: { command: "rm -rf ../outside" },
			},
			context(true, confirm),
		);
		expect(testState.judge).not.toHaveBeenCalled();

		const damageControlDir = path.join(root, "operator", "damage-control");
		fs.mkdirSync(damageControlDir, { recursive: true });
		fs.writeFileSync(
			path.join(damageControlDir, "judge.jsonl"),
			`${JSON.stringify({
				eventId: "unmatched",
				verdict: "allow",
				reason: "contained",
				model: "test/model",
				latencyMs: 1,
				recordedAt: "2026-01-01T00:00:00.000Z",
			})}\n`,
			"utf-8",
		);
		const command = commands.get("dc");
		if (!command) throw new Error("/dc was not registered");
		const ui = { notify: vi.fn(), setStatus: vi.fn() };
		await command.handler("judge", { ui });
		expect(ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("damage-control judge agreement:"),
			"info",
		);
	});
});
