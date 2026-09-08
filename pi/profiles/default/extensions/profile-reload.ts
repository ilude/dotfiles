import * as path from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ProfileReload } from "../lib/profile-reload.ts";
import { ReloadMonitor, type ReloadScope } from "../lib/reload-monitor.ts";
import { RELOAD_CHANGED, RELOAD_REQUEST, type ReloadState } from "../lib/profile-reload-events.ts";

// Owned by this evaluated factory generation, not shared with other extensions.
// Cached factories keep the baseline until Pi actually reevaluates source.
const monitor = new ReloadMonitor();
let baselineScope: string | undefined;

export default function profileReloadLifecycle(pi: ExtensionAPI): void {
	const service = new ProfileReload(monitor);
	let unsubscribe: (() => void) | undefined;
	let unsubscribeChanged: (() => void) | undefined;
	const snapshot = (): ReloadState => ({ needed: service.needed, error: service.error });
	pi.on("session_start", (_event, ctx) => {
		const agentDir = getAgentDir();
		const scope: ReloadScope = {
			agentDir, cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), projectConfigDir: CONFIG_DIR_NAME,
			loadedPaths: [
				...pi.getCommands().map(command => command.sourceInfo.path),
				...pi.getAllTools().map(tool => tool.sourceInfo.path),
				...ctx.ui.getAllThemes().flatMap(theme => theme.path ? [theme.path] : []),
				path.join(agentDir, "lib"), path.join(agentDir, "commands"),
			],
		};
		const key = JSON.stringify([scope.agentDir, scope.cwd, scope.projectTrusted]);
		unsubscribe?.();
		unsubscribeChanged?.();
		unsubscribe = pi.events.on(RELOAD_REQUEST, data => {
			if (typeof data === "function") data(snapshot());
		});
		unsubscribeChanged = service.subscribe(() => pi.events.emit(RELOAD_CHANGED, snapshot()));
		service.start(scope, error => ctx.ui.notify(`Reload monitor: ${error}`, "warning"), key !== baselineScope);
		baselineScope = key;
	});
	pi.on("session_shutdown", () => {
		service.stop(); unsubscribe?.(); unsubscribeChanged?.();
		unsubscribe = undefined; unsubscribeChanged = undefined;
	});
}
