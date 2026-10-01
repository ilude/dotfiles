import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ToolActivationApi = Pick<ExtensionAPI, "getActiveTools" | "setActiveTools">;

export function activateTools(pi: ToolActivationApi, names: readonly string[]): string[] {
	const active = [...new Set([...pi.getActiveTools(), ...names])];
	pi.setActiveTools(active);
	return active;
}
