import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Profile labels follow pp directory names, without resolving symlink aliases. */
export function activeProfileName(): string {
	return getAgentDir().replace(/[\\/]$/, "").split(/[\\/]/).at(-1) || "agent";
}
