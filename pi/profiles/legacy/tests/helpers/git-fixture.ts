import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

export function initializeGitRepository(
	workspace: string,
	identity: { name: string; email: string },
	options: { initialBranch?: string } = {},
): void {
	const args = ["init", "-q"];
	if (options.initialBranch) args.push("--initial-branch", options.initialBranch);
	execFileSync("git", args, { cwd: workspace });
	appendFileSync(
		join(workspace, ".git", "config"),
		`\n[user]\n\tname = ${identity.name}\n\temail = ${identity.email}\n`,
	);
}
