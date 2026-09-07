import * as path from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { profileReload } from "../lib/profile-reload.ts";

export default function profileReloadLifecycle(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		const agentDir = getAgentDir();
		profileReload.start({
			agentDir,
			cwd: ctx.cwd,
			projectTrusted: ctx.isProjectTrusted(),
			projectConfigDir: CONFIG_DIR_NAME,
			loadedPaths: [
				...pi.getCommands().map(command => command.sourceInfo.path),
				...pi.getAllTools().map(tool => tool.sourceInfo.path),
				...ctx.ui.getAllThemes().flatMap(theme => theme.path ? [theme.path] : []),
				path.join(agentDir, "lib"),
				path.join(agentDir, "commands"),
			],
		}, error => ctx.ui.notify(`Reload monitor: ${error}`, "warning"));
	});
	pi.on("session_shutdown", () => profileReload.stop());
}
