import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Retry only a timed-out status read, never a cancelled read or a Git mutation. */
export function withCommitStatusRetry(
	exec: ExtensionAPI["exec"],
	onTimeout: (message: string) => void,
	onRetry?: (message: string) => void,
): ExtensionAPI["exec"] {
	return async (command, args, options) => {
		if (command !== "git" || args[0] !== "-C" || args[2] !== "status") return exec(command, args, options);
		const started = Date.now();
		for (let attempt = 1; ; attempt++) {
			options?.signal?.throwIfAborted();
			const result = await exec(command, args, options);
			options?.signal?.throwIfAborted();
			if (!result.killed && !result.truncated && result.code === 0) return result;
			// Pi marks timeout, abort and output-cap termination as killed. Abort
			// was checked above; truncated output must not authorize a retry.
			const timedOut = result.killed && !result.truncated && Boolean(options?.timeout && options.timeout > 0);
			if (timedOut && attempt === 1) {
				onRetry?.(`Retrying timed-out Git status in ${JSON.stringify(args[1])} (2/2)…`);
				continue;
			}
			const reason = result.truncated ? "output limit exceeded"
				: timedOut ? "timed out" : result.killed ? "process terminated" : `exit ${result.code}`;
			const message = `Git ${args.slice(2).join(" ")} failed in ${JSON.stringify(args[1])} after ${Date.now() - started}ms (attempt ${attempt}/2; timeout ${options?.timeout ?? "none"}ms): ${reason}${result.stderr.trim() ? `; ${result.stderr.trim()}` : ""}.`;
			if (timedOut) onTimeout(message);
			throw new Error(message);
		}
	};
}
