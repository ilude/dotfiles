import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { scopeAgentRun } = vi.hoisted(() => ({ scopeAgentRun: vi.fn() }));

vi.mock("../lib/typed-agent.ts", () => ({
	defineAgent: vi.fn(() => ({ run: scopeAgentRun })),
}));

import toolFailureTriageExtension, {
	plainIssueName,
	renderToolFailureReport,
	resolveRepositoryRoot,
	validateScopeOutput,
} from "../extensions/tool-failure-triage.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

function commandHandler(pi: ReturnType<typeof createMockPi>) {
	const command = pi._commands.find((item) => item.name === "find-fails");
	if (!command) throw new Error("find-fails command not registered");
	return command.handler;
}

function card(
	candidateId: string,
	reasonCode:
		| "ledger-regression"
		| "internal-contract-defect"
		| "model-contract-friction"
		| "external-failure" = "internal-contract-defect",
) {
	return {
		candidateId,
		tool: "subagent_control",
		structuralLabel: "internal-missing-method",
		reasonCode,
		lastObserved: "2026-08-24T00:00:00Z",
		gateWindow: "14d" as const,
		occurrences: 4,
		sessions: 3,
		explanation: "Structural evidence is an investigation opportunity, not proof of cause.",
	};
}

function report(cards = [card("tf-v1-example")]) {
	return {
		toolFilter: [...new Set(cards.map((item) => item.tool))].sort(),
		cards,
		poolSummary: {
			expected: 6,
			stale: 2,
			belowThreshold: 3,
			omittedByCardLimit: 1,
			timestamp: 1,
			joinDiagnostics: {
				unmatchedResults: 0,
				duplicateCalls: 0,
				malformedOmissions: 0,
			},
		},
		summary: { unchangedSkipped: 4, resolved: 5, expectedSuppressed: 6 },
	};
}

function successfulAnalytics(pi: ReturnType<typeof createMockPi>, value = report()) {
	if (pi.getAllTools().length === 0) {
		pi.getAllTools.mockReturnValue([
			{
				name: "subagent_control",
				description: "Custom tool",
				parameters: {},
				sourceInfo: { source: "local" },
			},
		]);
	}
	pi.exec
		.mockResolvedValueOnce({ code: 0, stdout: "snapshot", stderr: "" })
		.mockResolvedValueOnce({ code: 0, stdout: "scan", stderr: "" })
		.mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify(value),
			stderr: "",
		});
}

describe("find-fails command", () => {
	beforeEach(() => {
		scopeAgentRun.mockReset();
		scopeAgentRun.mockResolvedValue({
			output: {
				recommendations: [
					{
						candidateId: "tf-v1-example",
						investigationValue: "May remove recurring tool ceremony.",
						evidenceLimits: "Structural metadata does not establish a cause.",
					},
				],
			},
			attempts: 1,
		});
	});

	it("resolves the repository through the installed Pi link", () => {
		const installedExtension = path.resolve(
			".pi/agent/extensions/tool-failure-triage.ts",
		);
		const repositoryExtension = path.resolve(
			"pi/extensions/tool-failure-triage.ts",
		);
		const resolveRealPath = vi.fn(() => repositoryExtension);

		expect(
			resolveRepositoryRoot(
				pathToFileURL(installedExtension).href,
				resolveRealPath,
			),
		).toBe(path.resolve("."));
		expect(resolveRealPath).toHaveBeenCalledWith(installedExtension);
	});

	it("renders the shortlist and requests one isolated scope recommendation", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx({ model: { provider: "test", id: "model" } });
		successfulAnalytics(pi);
		toolFailureTriageExtension(pi as never);

		await commandHandler(pi)("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Finding tool failures...",
			"info",
		);
		expect(pi.exec).toHaveBeenCalledTimes(3);
		expect(pi.exec.mock.calls[2][1]).toEqual(
			expect.arrayContaining(["--tools", "subagent_control"]),
		);
		expect(pi.exec.mock.calls[2][1]).not.toContain("edit");
		expect(scopeAgentRun).toHaveBeenCalledTimes(1);
		const input = scopeAgentRun.mock.calls[0][0];
		expect(input).toEqual({
			candidates: [
				{
					candidateId: "tf-v1-example",
					tool: "subagent_control",
					issueName: "required internal method is missing",
					structuralLabel: "internal-missing-method",
					reasonCode: "internal-contract-defect",
					gateWindow: "14d",
					occurrences: 4,
					sessions: 3,
					lastObserved: "2026-08-24T00:00:00Z",
				},
			],
		});
		expect(JSON.stringify(input)).not.toMatch(
			/coordinates|arguments|output|transcript|explanation|sessionMessages|path/i,
		);
		expect(pi.sendMessage).toHaveBeenCalledTimes(2);
		expect(pi.sendMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				customType: "tool-failure-scope-recommendation",
				content: expect.stringContaining(
					"- I1: subagent_control - required internal method is missing",
				),
			}),
			{ triggerTurn: false },
		);
		expect(pi.sendMessage.mock.calls[1][0].content).toContain(
			"Candidate ID: tf-v1-example",
		);
		expect(pi.sendMessage.mock.calls[1][0].content).toContain(
			"Reply with the I-number identifiers you accept (for example, I1 I3)",
		);
	});

	it("shows a high-contrast spinner while running in TUI mode", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx({ mode: "tui" });
		let rendered: string[] = [];
		ctx.ui.custom = vi.fn(async (factory) =>
			new Promise((resolve) => {
				const tui = { requestRender: vi.fn() };
				let component: { render: (width: number) => string[]; dispose?: () => void };
				component = factory(
					tui,
					ctx.ui.theme,
					{},
					(value: unknown) => {
						component.dispose?.();
						resolve(value);
					},
				);
				rendered = component.render(80);
			}),
		);
		successfulAnalytics(pi);
		toolFailureTriageExtension(pi as never);

		await commandHandler(pi)("", ctx);

		expect(ctx.ui.custom).toHaveBeenCalledTimes(1);
		expect(rendered.join("\n")).toContain("Finding tool failures...");
		expect(ctx.ui.theme.fg).toHaveBeenCalledWith("accent", expect.any(String));
		expect(ctx.ui.theme.fg).toHaveBeenCalledWith("text", expect.any(String));
	});

	it("filters built-in tools before requesting the ranked report", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		pi.getAllTools.mockReturnValue([
			{
				name: "edit",
				description: "Built-in edit",
				parameters: {},
				sourceInfo: { source: "builtin" },
			},
			{
				name: "subagent_control",
				description: "Custom tool",
				parameters: {},
				sourceInfo: { source: "local" },
			},
		]);
		successfulAnalytics(pi);
		toolFailureTriageExtension(pi as never);

		await commandHandler(pi)("", ctx);

		const reportArgs = pi.exec.mock.calls[2][1];
		expect(reportArgs).toContain("subagent_control");
		expect(reportArgs).not.toContain("edit");
	});

	it("renders an empty pool without invoking the model", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		successfulAnalytics(pi, report([]));
		toolFailureTriageExtension(pi as never);

		await commandHandler(pi)("", ctx);

		expect(scopeAgentRun).not.toHaveBeenCalled();
		expect(pi.sendMessage).toHaveBeenCalledTimes(1);
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.stringContaining("No model recommendation was requested"),
			}),
			{ triggerTurn: false },
		);
	});

	it("rejects a malformed report before model work", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		successfulAnalytics(pi, {
			cards: [{ candidateId: "missing-fields" }],
			poolSummary: {},
			summary: {},
		} as never);
		toolFailureTriageExtension(pi as never);

		await commandHandler(pi)("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Tool-failure shortlist report failed: tool-failure report returned an invalid result. Retry with /find-fails.",
			"error",
		);
		expect(scopeAgentRun).not.toHaveBeenCalled();
	});

	it("names a failed pipeline stage and stops", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		pi.exec.mockResolvedValueOnce({
			code: 2,
			stdout: "",
			stderr: "snapshot failed",
		});
		toolFailureTriageExtension(pi as never);

		await commandHandler(pi)("", ctx);

		expect(pi.exec).toHaveBeenCalledTimes(1);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Tool-failure snapshot refresh failed: snapshot failed. Retry with /find-fails.",
			"error",
		);
		expect(scopeAgentRun).not.toHaveBeenCalled();
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("rejects an out-of-pool model result and starts no follow-up turn", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		successfulAnalytics(pi);
		scopeAgentRun.mockResolvedValueOnce({
			output: {
				recommendations: [
					{
						candidateId: "unknown",
						investigationValue: "value",
						evidenceLimits: "limits",
					},
				],
			},
			attempts: 1,
		});
		toolFailureTriageExtension(pi as never);

		await commandHandler(pi)("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("unknown candidate: unknown"),
			"error",
		);
		expect(pi.sendMessage).toHaveBeenCalledTimes(1);
		expect(pi.sendMessage.mock.calls.every((call) => call[1]?.triggerTurn === false)).toBe(
			true,
		);
	});

	it("rejects unsupported arguments before starting work", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		toolFailureTriageExtension(pi as never);

		await commandHandler(pi)("30", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Usage: /find-fails",
			"warning",
		);
		expect(pi.exec).not.toHaveBeenCalled();
	});
});

describe("tool failure report rendering", () => {
	it("renders ten bounded cards in the required group order with recovery commands", () => {
		const cards = [
			card("ledger", "ledger-regression"),
			card("internal", "internal-contract-defect"),
			card("friction", "model-contract-friction"),
			...Array.from({ length: 7 }, (_, index) =>
				card(`external-${index}`, "external-failure"),
			),
		];
		const rendered = renderToolFailureReport(report(cards));

		expect(rendered.indexOf("## Ledger attention")).toBeLessThan(
			rendered.indexOf("## Internal and runtime"),
		);
		expect(rendered.indexOf("## Internal and runtime")).toBeLessThan(
			rendered.indexOf("## Model-tool friction"),
		);
		expect(rendered.indexOf("## Model-tool friction")).toBeLessThan(
			rendered.indexOf("## Other recurrence"),
		);
		expect(rendered).toContain(
			"- I1: subagent_control - required internal method is missing",
		);
		expect(rendered).toContain(
			"- I2: subagent_control - required internal method is missing",
		);
		expect(rendered).toContain("Candidate ID: ledger");
		expect(rendered.indexOf("required internal method is missing")).toBeLessThan(
			rendered.indexOf("Candidate ID: ledger"),
		);
		expect(rendered.match(/Counts prioritize investigation/g)).toHaveLength(1);
		expect(rendered).not.toContain(
			"Structural evidence is an investigation opportunity",
		);
		expect(rendered).toContain("--include-overflow");
		expect(rendered).toContain("--include-observed");
		expect(rendered).toContain("--include-expected");
		expect(rendered).toContain("active model provider");
	});
});

describe("plain issue names", () => {
	it("uses deterministic operator names for known failure classes", () => {
		expect(plainIssueName("approval-required")).toBe(
			"operator approval is required",
		);
		expect(plainIssueName("command-aborted")).toBe("command was aborted");
		expect(plainIssueName("command-timeout")).toBe("command timed out");
		expect(plainIssueName("plan-not-ready")).toBe("plan is not ready");
		expect(plainIssueName("requested-agent-unavailable")).toBe(
			"requested agent is unavailable",
		);
		expect(plainIssueName("task-boundary-rejected")).toBe(
			"task boundary path was rejected",
		);
		expect(plainIssueName("exact-match-miss")).toBe(
			"exact text does not match",
		);
		expect(plainIssueName("nonunique-match")).toBe(
			"target text matches multiple locations",
		);
		expect(plainIssueName("instruction-deferred")).toBe(
			"path instructions must load before mutation",
		);
	});
});

describe("scope output validation", () => {
	it("rejects duplicate and unknown candidate IDs", () => {
		const item = {
			candidateId: "one",
			investigationValue: "value",
			evidenceLimits: "limits",
		};
		expect(() =>
			validateScopeOutput(
				{ recommendations: [item, item] },
				new Set(["one"]),
			),
		).toThrow("duplicate candidate");
		expect(() =>
			validateScopeOutput(
				{ recommendations: [{ ...item, candidateId: "two" }] },
				new Set(["one"]),
			),
		).toThrow("unknown candidate");
	});
});
