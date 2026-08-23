import { onSessionStart } from "../lib/session-start-metrics.js";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { recordEvent } from "../lib/metrics.js";
import {
	deactivateTools,
	toolsetFingerprint,
} from "../lib/tool-activation.js";

export const DEFERRED_TOOL_NAMES = [
	"commit_plan",
	"commit_validate_message",
	"commit_stage",
	"commit_create",
	"feature_memory_record",
	"goal_complete",
	"goal_progress",
	"plan_archive",
	"plan_progress",
	"review_artifact_write",
	"subagent_continue",
] as const;

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort();
}

function sessionId(ctx: ExtensionContext): string | undefined {
	return ctx.sessionManager?.getSessionId?.();
}

export default function registerToolVisibility(pi: ExtensionAPI): void {
	let lastToolsetId: string | undefined;

	const recordToolsetExposure = (
		ctx: ExtensionContext,
		reason: "session_start" | "toolset_changed",
	): void => {
		const activeToolNames = sortedUnique(pi.getActiveTools());
		const toolsetId = toolsetFingerprint(activeToolNames);
		if (toolsetId === lastToolsetId) return;
		const active = new Set(activeToolNames);
		const inactiveToolNames = sortedUnique(
			pi
				.getAllTools()
				.map((tool) => tool.name)
				.filter((name) => !active.has(name)),
		);
		recordEvent({
			event: "toolset_exposure",
			session: sessionId(ctx),
			data: {
				schemaVersion: 1,
				toolsetId,
				activeToolNames,
				inactiveToolNames,
				reason,
			},
		});
		lastToolsetId = toolsetId;
	};

	onSessionStart(pi, import.meta.url, (_event, ctx) => {
		lastToolsetId = undefined;
		deactivateTools(pi, DEFERRED_TOOL_NAMES);
		recordToolsetExposure(ctx, "session_start");
	});
	pi.on("turn_start", (_event, ctx) => {
		recordToolsetExposure(ctx, "toolset_changed");
	});
	pi.on("tool_call", (event, ctx) => {
		recordEvent({
			event: "tool_use",
			session: sessionId(ctx),
			data: {
				schemaVersion: 1,
				toolName: event.toolName,
				toolCallId: event.toolCallId,
				toolsetId: toolsetFingerprint(pi.getActiveTools()),
			},
		});
	});
}
