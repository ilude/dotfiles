import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import toolFailureTriageExtension, {
	renderToolFailureReport,
	resolveRepositoryRoot,
} from "../extensions/tool-failure-triage.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

function commandHandler(pi: ReturnType<typeof createMockPi>) {
	const command = pi._commands.find((item) => item.name === "find-fails");
	if (!command) throw new Error("find-fails command not registered");
	return command.handler;
}

describe("find-fails command", () => {
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

	it("refreshes the snapshot, scans it, and renders the actionable report", async () => {
		const pi = createMockPi();
		const ctx = createMockCtx();
		pi.exec
			.mockResolvedValueOnce({ code: 0, stdout: "snapshot", stderr: "" })
			.mockResolvedValueOnce({ code: 0, stdout: "scan", stderr: "" })
			.mockResolvedValueOnce({
				code: 0,
				stdout: JSON.stringify({
					actionable: [
						{
							candidateId: "tf-v1-example",
							tool: "bash",
							errorClass: "missing-required-parameter",
							occurrences: 3,
							sessions: 2,
							status: "regression",
						},
					],
					summary: { unchangedSkipped: 4, resolved: 5 },
				}),
				stderr: "",
			});
		toolFailureTriageExtension(pi as never);

		await commandHandler(pi)("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Tool-failure scan started.",
			"info",
		);
		expect(pi.exec).toHaveBeenCalledTimes(3);
		expect(pi.exec.mock.calls[0][1]).toContain("snapshot");
		expect(pi.exec.mock.calls[1][1]).toContain("tool-failure-scan");
		expect(pi.exec.mock.calls[2][1]).toContain("tool-failure-report");
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "tool-failure-triage",
				content: expect.stringContaining(
					"[regression] bash: missing-required-parameter",
				),
				display: true,
			}),
			{ triggerTurn: false },
		);
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(
			"find-fails",
			undefined,
		);
	});

	it("reports a bounded failure and does not continue the pipeline", async () => {
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
			"Tool-failure scan failed: snapshot failed",
			"error",
		);
		expect(pi.sendMessage).not.toHaveBeenCalled();
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
	it("renders an empty actionable queue", () => {
		expect(
			renderToolFailureReport({
				actionable: [],
				summary: { unchangedSkipped: 2, resolved: 7 },
			}),
		).toContain("No new, changed, regressed, or due-for-review");
	});
});
