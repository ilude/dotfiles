import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Resolve the command and arguments needed to launch a child Pi process
 * from within a running Pi extension. Prefers the current CLI entrypoint
 * script; falls back to the executable when Pi runs as a compiled binary.
 */
export function getPiInvocation(
	args: string[],
	currentScript = process.argv[1],
	execPath = process.execPath,
): { command: string; args: string[] } {
	if (currentScript && fs.existsSync(currentScript)) {
		return { command: execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) return { command: execPath, args };

	throw new Error(
		`Cannot launch child Pi process: Pi CLI entrypoint is unavailable (${currentScript || "process.argv[1] is empty"}).`,
	);
}
