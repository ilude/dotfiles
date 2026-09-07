import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { deactivateTools } from "../lib/tool-activation.js";

export const DEFERRED_TOOL_NAMES = ["image_inspect", "image_transform"] as const;

export default function registerToolVisibility(pi: ExtensionAPI): void {
	pi.on("session_start", () => {
		deactivateTools(pi, DEFERRED_TOOL_NAMES);
	});
}
