import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { activeProfileName } from "../lib/profile.ts";

interface LaunchPlan {
	executable?: string;
	args: string[];
	reason?: string;
}

interface CommandContext {
	cwd?: string;
	ui: ExtensionCommandContext["ui"];
	sessionManager?: ExtensionCommandContext["sessionManager"] & {
		createBranchedSession?: (leafId: string) => string | undefined;
	};
}

function profileDir(): string {
	return path.resolve(getAgentDir());
}

function repoRoot(): string {
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
}

function ppScript(): string {
	return path.join(repoRoot(), "scripts", process.platform === "win32" ? "pp.ps1" : "pp");
}

function currentProfileName(): string {
	const name = activeProfileName();
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name === "." || name === "..") {
		throw new Error(`Cannot derive pp profile name from ${profileDir()}.`);
	}
	return name;
}

function defaultTitle(cwd: string): string {
	return path.basename(cwd.replace(/[\\/]$/, "")) || "pi";
}

function msysPathToWindows(cwd: string): string {
	const match = cwd.match(/^\/([a-zA-Z])\/(.*)$/);
	const drive = match?.[1];
	const rest = match?.[2];
	if (!drive || rest === undefined) return cwd;
	return `${drive.toUpperCase()}:\\${rest.replace(/\//g, "\\")}`;
}

function extractSessionId(sessionFile: string): string {
	const basename = path.basename(sessionFile);
	return basename.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? sessionFile;
}

function quotePowerShell(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function quoteShell(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

function ppCommand(args: string[] = []): string {
	const profile = currentProfileName();
	if (process.platform === "win32") {
		return ["&", quotePowerShell(ppScript()), "-p", quotePowerShell(profile), ...args.map(quotePowerShell)].join(" ");
	}
	return [quoteShell(ppScript()), "-p", quoteShell(profile), ...args.map(quoteShell)].join(" ");
}

function buildPiArgsForSession(sessionFile: string): string[] {
	return ["--", "--session", extractSessionId(sessionFile)];
}

function buildGhosttyPlan(input: { cwd: string; initialInput?: string }): LaunchPlan {
	const scriptLines = [
		'tell application "Ghostty"',
		"activate",
		"set cfg to new surface configuration",
		`set initial working directory of cfg to "${input.cwd.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
		'set command of cfg to "/bin/zsh"',
		"set win to new window with configuration cfg",
	];
	if (input.initialInput) {
		scriptLines.push(
			"set term to terminal 1 of selected tab of win",
			`input text "${`${input.initialInput}\n`.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" to term`,
		);
	}
	scriptLines.push("end tell");
	return { executable: "osascript", args: ["-e", scriptLines.join("\n")] };
}

function buildWindowsTerminalPlan(input: { cwd: string; title: string; command: string }): LaunchPlan {
	if (process.platform !== "win32" && !process.env.WT_SESSION) return { args: [], reason: "No supported terminal tab launcher detected." };
	return {
		executable: "wt",
		args: ["-w", "0", "new-tab", "--title", input.title, "--suppressApplicationTitle", "-d", msysPathToWindows(input.cwd), "pwsh", "-NoExit", "-Command", input.command],
	};
}

function buildWindowsShellPlan(input: { cwd: string; title: string }): LaunchPlan {
	if (process.platform !== "win32" && !process.env.WT_SESSION) return { args: [], reason: "No supported terminal launcher detected." };
	return { executable: "wt", args: ["-w", "0", "new-tab", "--title", input.title, "-d", msysPathToWindows(input.cwd), "pwsh"] };
}

function launch(plan: LaunchPlan): { launched: boolean; error?: string } {
	if (!plan.executable) return { launched: false };
	const result = spawnSync(plan.executable, plan.args, { shell: false, stdio: "ignore", windowsHide: true });
	if (result.error) return { launched: false, error: result.error.message };
	if (typeof result.status === "number" && result.status !== 0) return { launched: false, error: `${plan.executable} exited ${result.status}` };
	return { launched: true };
}

function runHerdr(args: string[], cwd: string): string {
	const result = spawnSync(process.env.HERDR_BIN_PATH || "herdr", args, { cwd, encoding: "utf8", windowsHide: true, timeout: 10_000 });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error((result.stderr || result.stdout).trim() || `herdr exited ${result.status}`);
	return result.stdout;
}

const execFileAsync = promisify(execFile);
const HERDR_LAUNCH_TIMEOUT_MS = 10_000;

export class HerdrPiTabLaunchError extends Error {
	readonly mayHaveLaunched: boolean;
	readonly tabId?: string;
	readonly paneId?: string;

	constructor(message: string, fields: { mayHaveLaunched: boolean; tabId?: string; paneId?: string }) {
		super(message);
		this.name = "HerdrPiTabLaunchError";
		this.mayHaveLaunched = fields.mayHaveLaunched;
		this.tabId = fields.tabId;
		this.paneId = fields.paneId;
	}
}

async function runHerdrAsync(args: string[], cwd: string): Promise<string> {
	const result = await execFileAsync(process.env.HERDR_BIN_PATH || "herdr", args, {
		cwd,
		encoding: "utf8",
		windowsHide: true,
		shell: false,
		timeout: HERDR_LAUNCH_TIMEOUT_MS,
		maxBuffer: 256 * 1024,
	});
	return result.stdout;
}

function extractJsonObject(text: string): Record<string, unknown> {
	const start = text.search(/[\[{]/);
	if (start < 0) throw new Error("Herdr returned no JSON.");
	return JSON.parse(text.slice(start)) as Record<string, unknown>;
}

function createHerdrTab(cwd: string, title: string): string {
	const workspace = process.env.HERDR_WORKSPACE_ID;
	if (!workspace) throw new Error("HERDR_WORKSPACE_ID is not set.");
	const output = runHerdr(["tab", "create", "--workspace", workspace, "--cwd", process.platform === "win32" ? msysPathToWindows(cwd) : cwd, "--label", title, "--focus"], cwd);
	const parsed = extractJsonObject(output) as { result?: { root_pane?: { pane_id?: string } } };
	const paneId = parsed.result?.root_pane?.pane_id;
	if (!paneId) throw new Error("Herdr tab create did not return a root pane ID.");
	return paneId;
}

export async function createHerdrPiTab(cwd: string, title: string, sessionFile?: string, planPath?: string): Promise<{ tabId: string; paneId?: string }> {
	const workspace = process.env.HERDR_WORKSPACE_ID;
	if (!workspace) throw new HerdrPiTabLaunchError("HERDR_WORKSPACE_ID is not set.", { mayHaveLaunched: false });
	if (sessionFile && planPath) throw new HerdrPiTabLaunchError("A Herdr Pi tab cannot resume a session and launch a plan together.", { mayHaveLaunched: false });
	const args = ["plugin", "pane", "open", "--plugin", "local.pi", "--entrypoint", "pi", "--placement", "tab", "--workspace", workspace,
		"--cwd", process.platform === "win32" ? msysPathToWindows(cwd) : cwd,
		"--env", `PI_HERDR_PROFILE_DIR=${profileDir()}`, "--env", `PI_HERDR_SESSION_FILE=${sessionFile || ""}`,
		"--env", `PI_HERDR_PLAN_PATH=${planPath || ""}`, "--no-focus"];
	let output: string;
	try {
		output = await runHerdrAsync(args, cwd);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		const notStarted = code === "ENOENT" || code === "EACCES" || code === "ENOTDIR";
		throw new HerdrPiTabLaunchError(`Herdr Pi launch request failed${notStarted ? " before the CLI started" : "; inspect before retrying"}. ${String(error)}`, { mayHaveLaunched: !notStarted });
	}
	let tab: string | undefined;
	let pane: string | undefined;
	try {
		const parsed = extractJsonObject(output) as { result?: { plugin_pane?: { pane?: { tab_id?: string; pane_id?: string } } } };
		tab = parsed.result?.plugin_pane?.pane?.tab_id;
		pane = parsed.result?.plugin_pane?.pane?.pane_id;
		if (!tab) throw new Error("Herdr launch response omitted tab identity");
	} catch (error) {
		throw new HerdrPiTabLaunchError(`Herdr Pi launch result was ambiguous; inspect before retrying. ${String(error)}`, { mayHaveLaunched: true, tabId: tab, paneId: pane });
	}
	try {
		await runHerdrAsync(["tab", "focus", tab], cwd);
	} catch (error) {
		throw new HerdrPiTabLaunchError(`Pi tab ${tab} was created, but focusing failed. Do not relaunch. ${String(error)}`, { mayHaveLaunched: true, tabId: tab, paneId: pane });
	}
	try {
		await runHerdrAsync(["tab", "rename", tab, title], cwd);
	} catch (error) {
		throw new HerdrPiTabLaunchError(`Pi tab ${tab} was created, but renaming failed. Do not relaunch. ${String(error)}`, { mayHaveLaunched: true, tabId: tab, paneId: pane });
	}
	return { tabId: tab, paneId: pane };
}

function isHerdr(): boolean {
	return process.env.HERDR_ENV === "1";
}

async function executeNewInstance(args: string, ctx: CommandContext): Promise<void> {
	const cwd = ctx.cwd ?? process.cwd();
	const title = args.trim() || defaultTitle(cwd);
	ctx.ui.notify(isHerdr() ? `Opening new Pi instance in a Herdr tab: ${title}` : `Opening new Pi instance in a new terminal tab: ${title}`, "info");
	if (isHerdr()) {
		await createHerdrPiTab(cwd, title);
		ctx.ui.notify(`Opened new Pi instance in a Herdr tab: ${title}`, "info");
		return;
	}
	const plan = process.platform === "darwin" ? buildGhosttyPlan({ cwd, initialInput: ppCommand() }) : buildWindowsTerminalPlan({ cwd, title, command: ppCommand() });
	const result = launch(plan);
	if (result.launched) ctx.ui.notify(`Opened new Pi instance in a new terminal tab: ${title}`, "info");
	else ctx.ui.notify(result.error ? `Terminal launch failed: ${result.error}` : plan.reason ?? "Terminal launch failed.", "error");
}

async function executeNewTerminal(args: string, ctx: CommandContext): Promise<void> {
	const cwd = ctx.cwd ?? process.cwd();
	const title = args.trim() || defaultTitle(cwd);
	ctx.ui.notify(isHerdr() ? `Opening new Herdr tab in this cwd: ${title}` : `Opening new terminal in this cwd: ${title}`, "info");
	if (isHerdr()) {
		createHerdrTab(cwd, title);
		ctx.ui.notify(`Opened new Herdr tab in this cwd: ${title}`, "info");
		return;
	}
	const plan = process.platform === "darwin" ? buildGhosttyPlan({ cwd }) : buildWindowsShellPlan({ cwd, title });
	const result = launch(plan);
	if (result.launched) ctx.ui.notify(`Opened new terminal in this cwd: ${title}`, "info");
	else ctx.ui.notify(result.error ? `Terminal launch failed: ${result.error}` : plan.reason ?? "Terminal launch failed.", "error");
}

async function executeBranch(args: string, ctx: CommandContext): Promise<void> {
	const leafId = ctx.sessionManager?.getLeafId?.();
	if (!ctx.sessionManager?.createBranchedSession || !leafId) throw new Error("Cannot branch this session yet: no persisted session leaf is available.");
	const cwd = ctx.cwd ?? process.cwd();
	const title = args.trim() || defaultTitle(cwd);
	ctx.ui.notify(isHerdr() ? `Opening branched Pi session in a Herdr tab: ${title}` : `Opening branched Pi session in a new terminal tab: ${title}`, "info");
	const branchSessionFile = ctx.sessionManager.createBranchedSession(leafId);
	if (!branchSessionFile) throw new Error("Cannot branch this session: session persistence is unavailable.");
	if (isHerdr()) {
		try { await createHerdrPiTab(cwd, title, branchSessionFile); }
		catch (error) { throw new Error(`${String(error)}\nBranch retained: ${branchSessionFile}\nResume with pp --session ${quotePowerShell(branchSessionFile)}`); }
		ctx.ui.notify(`Opened branched Pi session in a Herdr tab: ${title}`, "info");
		return;
	}
	const command = ppCommand(buildPiArgsForSession(branchSessionFile));
	const plan = process.platform === "darwin" ? buildGhosttyPlan({ cwd, initialInput: command }) : buildWindowsTerminalPlan({ cwd, title, command });
	const result = launch(plan);
	if (result.launched) ctx.ui.notify(`Opened branched Pi session in a new terminal tab: ${title}`, "info");
	else ctx.ui.notify(result.error ? `Terminal launch failed: ${result.error}` : plan.reason ?? "Terminal launch failed.", "error");
}

export default function sessionLaunchCommands(pi: ExtensionAPI): void {
	pi.registerCommand("branch", {
		description: "Open a branched copy of this Pi session in a new terminal tab",
		handler: async (args, ctx) => executeBranch(args, ctx),
	});
	pi.registerCommand("new-instance", {
		description: "Open a new Pi instance in this cwd in a new terminal tab",
		handler: async (args, ctx) => executeNewInstance(args, ctx),
	});
	pi.registerCommand("new-terminal", {
		description: "Open a plain shell in this cwd in a new terminal",
		handler: async (args, ctx) => executeNewTerminal(args, ctx),
	});
}
