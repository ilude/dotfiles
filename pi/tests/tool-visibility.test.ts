import { beforeEach, describe, expect, it, vi } from "vitest";

const recordEvent = vi.hoisted(() => vi.fn());
vi.mock("../lib/metrics.ts", () => ({ recordEvent }));

import toolVisibility, {
	DEFERRED_TOOL_NAMES,
} from "../extensions/tool-visibility.ts";
import {
	activateTools,
	deactivateTools,
	removeToolVisibilityRestriction,
	setToolVisibilityRestriction,
} from "../lib/tool-activation.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const GENERAL_TOOL_NAMES = [
	"coms_lan_trust_import",
	"coms_lan_trust_list",
	"coms_lan_trust_remove",
	"onclave_agents",
	"onclave_send",
	"onclave_delegate",
	"onclave_inform",
	"onclave_get",
	"onclave_await",
	"usage_report",
	"web_search",
	"web_fetch",
];

function registerTool(pi: ReturnType<typeof createMockPi>, name: string): void {
	pi.registerTool({
		name,
		description: name,
		parameters: {},
		execute: async () => ({ content: [] }),
	});
}

function sessionContext() {
	return createMockCtx({
		sessionManager: { getSessionId: () => "session-1" },
	});
}

describe("tool visibility", () => {
	beforeEach(() => recordEvent.mockClear());

	it("defers workflow-state-gated and advanced subagent tools", async () => {
		const pi = createMockPi();
		for (const name of [
			"read",
			"task",
			"pwsh",
			"schedule",
			...GENERAL_TOOL_NAMES,
			...DEFERRED_TOOL_NAMES,
		])
			registerTool(pi, name);
		toolVisibility(pi as Parameters<typeof toolVisibility>[0]);

		await pi._getHook("session_start")[0].handler({}, sessionContext());

		expect(DEFERRED_TOOL_NAMES).toEqual([
			"commit_plan",
			"commit_validate_message",
			"commit_stage",
			"commit_create",
			"feature_memory_record",
			"goal_complete",
			"goal_progress",
			"learning_candidate_decide",
			"plan_archive",
			"review_artifact_write",
			"workflow_friction_mark_change",
			"subagent_chain",
			"subagent_continue",
			"subagent_fanout",
		]);
		expect(pi.getActiveTools()).toEqual([
			"read",
			"task",
			"pwsh",
			"schedule",
			...GENERAL_TOOL_NAMES,
		]);
		expect(recordEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "toolset_exposure",
				session: "session-1",
				data: expect.objectContaining({
					reason: "session_start",
					activeToolNames: expect.arrayContaining(GENERAL_TOOL_NAMES),
					inactiveToolNames: [...DEFERRED_TOOL_NAMES].sort(),
				}),
			}),
		);
	});

	it("keeps desired owner state current under a keyed visibility restriction", () => {
		const pi = createMockPi();
		const fixed = [
			"subagent",
			"subagent_chain",
			"subagent_fanout",
			"subagent_workflow",
			"task",
			"ask_user",
		];
		for (const name of ["read", ...fixed, "plan_archive", "goal_complete"])
			registerTool(pi, name);

		deactivateTools(pi, [
			"subagent_chain",
			"subagent_fanout",
			"subagent_workflow",
			"plan_archive",
		]);
		setToolVisibilityRestriction(
			pi,
			"fable",
			[...fixed, "plan_archive"],
			fixed,
		);

		expect(new Set(pi.getActiveTools())).toEqual(new Set(fixed));
		activateTools(pi, ["plan_archive", "goal_complete"]);
		expect(pi.getActiveTools()).toContain("plan_archive");
		expect(pi.getActiveTools()).not.toContain("goal_complete");

		deactivateTools(pi, ["plan_archive", "read"]);
		expect(pi.getActiveTools()).not.toContain("plan_archive");
		removeToolVisibilityRestriction(pi, "fable");
		expect(pi.getActiveTools()).toContain("goal_complete");
		expect(pi.getActiveTools()).not.toContain("read");
		expect(pi.getActiveTools()).not.toContain("plan_archive");
	});

	it("records changed toolsets and tool use without content", async () => {
		const pi = createMockPi();
		registerTool(pi, "read");
		registerTool(pi, "goal_complete");
		toolVisibility(pi as Parameters<typeof toolVisibility>[0]);
		const ctx = sessionContext();
		await pi._getHook("session_start")[0].handler({}, ctx);
		recordEvent.mockClear();

		registerTool(pi, "web_search");
		await pi._getHook("turn_start")[0].handler({ turnIndex: 1 }, ctx);
		await pi._getHook("tool_call")[0].handler(
			{ toolName: "web_search", toolCallId: "call-1", input: {} },
			ctx,
		);

		expect(recordEvent).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				event: "toolset_exposure",
				data: expect.objectContaining({
					reason: "toolset_changed",
					activeToolNames: ["read", "web_search"],
				}),
			}),
		);
		expect(recordEvent).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				event: "tool_use",
				data: expect.objectContaining({
					toolName: "web_search",
					toolCallId: "call-1",
				}),
			}),
		);
		expect(JSON.stringify(recordEvent.mock.calls)).not.toContain("input");
	});
});
