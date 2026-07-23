import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { deactivateTools } from "../lib/tool-activation.js";

export const DEFERRED_TOOL_NAMES = [
	"commit_plan",
	"commit_validate_message",
	"commit_stage",
	"commit_create",
	"coms_lan_trust_import",
	"coms_lan_trust_list",
	"coms_lan_trust_remove",
	"feature_memory_record",
	"goal_complete",
	"learning_candidate_decide",
	"onclave_agents",
	"onclave_send",
	"onclave_delegate",
	"onclave_inform",
	"onclave_get",
	"onclave_await",
	"pwsh",
	"review_artifact_write",
	"schedule",
	"usage_report",
	"web_search",
	"web_fetch",
	"workflow_friction_mark_change",
] as const;

export default function registerToolVisibility(pi: ExtensionAPI): void {
	pi.on("session_start", () => {
		deactivateTools(pi, DEFERRED_TOOL_NAMES);
	});
}
