import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface ReloadState { needed: boolean; error?: string }
export const RELOAD_CHANGED = "default:profile-reload:changed";
export const RELOAD_REQUEST = "default:profile-reload:request";

/** Pi's local event bus dispatches synchronously. No owner means unavailable. */
export function requestReloadState(pi: Pick<ExtensionAPI, "events">): ReloadState | undefined {
	let state: ReloadState | undefined;
	pi.events.emit(RELOAD_REQUEST, (snapshot: ReloadState) => { state = snapshot; });
	return state;
}
