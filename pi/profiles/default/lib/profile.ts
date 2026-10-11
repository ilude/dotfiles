import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Preserve named-profile labels, resolving only Pi's native agent-directory alias. */
export function activeProfileName(): string {
	let directory = getAgentDir();
	if (resolve(directory) === resolve(join(homedir(), ".pi", "agent"))) {
		directory = realpathSync(directory);
	}
	return directory.replace(/[\\/]$/, "").split(/[\\/]/).at(-1) || "agent";
}
