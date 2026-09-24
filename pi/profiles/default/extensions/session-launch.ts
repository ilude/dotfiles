import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, type CustomEntry, type ExtensionAPI, type ExtensionCommandContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { SessionManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js";
import { Text } from "@earendil-works/pi-tui";
import { activeProfileName } from "../lib/profile.ts";
import { registerProfileCommand } from "../lib/profile-command.ts";

interface LaunchPlan {
	executable?: string;
	args: string[];
	reason?: string;
}

const BRANCH_EVIDENCE_TYPE = "session-branch";

interface BranchEvidence {
	schemaVersion: 1;
	role: "parent" | "child";
	parentSessionId: string;
	parentSessionFile: string;
	childSessionId: string;
	childSessionFile: string;
	branchPointEntryId: string;
	branchPointTimestamp: string;
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

export function parseNewInstanceArgs(args: string): { session?: string; title?: string } {
	const trimmed = args.trim();
	if (trimmed !== "--resume" && !trimmed.startsWith("--resume ")) return { title: trimmed || undefined };
	const match = trimmed.match(/^--resume(?:\s+(\S+))?(?:\s+([\s\S]+))?$/);
	const session = match?.[1];
	if (!session) throw new Error("Usage: /new-instance --resume <session-uuid> [title]");
	return { session, title: match?.[2]?.trim() || undefined };
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

function branchEvidence(data: unknown): BranchEvidence | undefined {
	if (!data || typeof data !== "object") return undefined;
	const value = data as Record<string, unknown>;
	const role = value.role === "parent" || value.role === "child" ? value.role : undefined;
	const parentSessionId = typeof value.parentSessionId === "string" && value.parentSessionId ? value.parentSessionId : undefined;
	const parentSessionFile = typeof value.parentSessionFile === "string" && value.parentSessionFile ? value.parentSessionFile : undefined;
	const childSessionId = typeof value.childSessionId === "string" && value.childSessionId ? value.childSessionId : undefined;
	const childSessionFile = typeof value.childSessionFile === "string" && value.childSessionFile ? value.childSessionFile : undefined;
	const branchPointEntryId = typeof value.branchPointEntryId === "string" && value.branchPointEntryId ? value.branchPointEntryId : undefined;
	const branchPointTimestamp = typeof value.branchPointTimestamp === "string" && value.branchPointTimestamp ? value.branchPointTimestamp : undefined;
	if (value.schemaVersion !== 1 || !role || !parentSessionId || !parentSessionFile || !childSessionId || !childSessionFile || !branchPointEntryId || !branchPointTimestamp) return undefined;
	return { schemaVersion: 1, role, parentSessionId, parentSessionFile, childSessionId, childSessionFile, branchPointEntryId, branchPointTimestamp };
}

function branchPointTime(timestamp: string): string {
	const date = new Date(timestamp);
	return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString().replaceAll(",", "");
}

function renderBranchEvidence(entry: CustomEntry<BranchEvidence>, _options: { expanded: boolean }, theme: Theme): Text {
	const data = branchEvidence(entry.data);
	if (!data) return new Text(theme.fg("error", "[branch] Invalid branch evidence"), 0, 0);
	return new Text(`${theme.fg("accent", `[branch ${data.role}]`)} ${branchPointTime(data.branchPointTimestamp)}`, 0, 0);
}

const execFileAsync = promisify(execFile);
const HERDR_LAUNCH_TIMEOUT_MS = 10_000;

export class HerdrPiTabLaunchError extends Error {
	readonly mayHaveLaunched: boolean;
	readonly tabId?: string;
	readonly paneId?: string;
	readonly workspaceId?: string;

	constructor(message: string, fields: { mayHaveLaunched: boolean; tabId?: string; paneId?: string; workspaceId?: string }) {
		super(message);
		this.name = "HerdrPiTabLaunchError";
		this.mayHaveLaunched = fields.mayHaveLaunched;
		this.tabId = fields.tabId;
		this.paneId = fields.paneId;
		this.workspaceId = fields.workspaceId;
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

export async function renameHerdrPiTab(tabId: string, title: string, cwd = process.cwd()): Promise<void> {
	if (!tabId) throw new Error("Herdr tab identity is missing.");
	await runHerdrAsync(["tab", "rename", tabId, title], cwd);
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

async function currentHerdrWorkspace(cwd: string): Promise<string> {
	let output: string;
	try {
		output = await runHerdrAsync(["pane", "current", "--current"], cwd);
	} catch (error) {
		throw new HerdrPiTabLaunchError(`Cannot resolve the caller's current Herdr workspace. ${String(error)}`, { mayHaveLaunched: false });
	}
	try {
		const parsed = extractJsonObject(output) as { result?: { pane?: { workspace_id?: string } } };
		const workspace = parsed.result?.pane?.workspace_id;
		if (!workspace) throw new Error("Herdr omitted workspace identity");
		return workspace;
	} catch (error) {
		throw new HerdrPiTabLaunchError(`Cannot resolve the caller's current Herdr workspace. ${String(error)}`, { mayHaveLaunched: false });
	}
}

export async function createHerdrPiTab(cwd: string, title: string, sessionFile?: string, planPath?: string, titleExplicit = Boolean(planPath), workspaceId?: string): Promise<{ tabId: string; paneId?: string }> {
	if (sessionFile && planPath) throw new HerdrPiTabLaunchError("A Herdr Pi tab cannot resume a session and launch a plan together.", { mayHaveLaunched: false });
	const workspace = workspaceId || await currentHerdrWorkspace(cwd);
	const args = ["plugin", "pane", "open", "--plugin", "local.pi", "--entrypoint", "pi", "--placement", "tab", "--workspace", workspace,
		"--cwd", process.platform === "win32" ? msysPathToWindows(cwd) : cwd,
		"--env", `PI_HERDR_PROFILE_DIR=${profileDir()}`, "--env", `PI_HERDR_SESSION_FILE=${sessionFile || ""}`,
		"--env", `PI_HERDR_PLAN_PATH=${planPath || ""}`,
		"--env", `PI_HERDR_TAB_TITLE=${title}`, "--env", `PI_HERDR_TAB_TITLE_EXPLICIT=${titleExplicit ? "1" : "0"}`,
		"--env", `PI_HERDR_TAB_LABEL=${planPath ? title : ""}`, "--no-focus"];
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
	return { tabId: tab, paneId: pane };
}

function isHerdr(): boolean {
	return process.env.HERDR_ENV === "1";
}

async function launchNewInstance(input: { cwd: string; title?: string; session?: string; signal?: AbortSignal }): Promise<Record<string, unknown>> {
	if (input.session) {
		if (isHerdr()) {
			const [{ resumeHerdrSession }, { createHerdrCli }] = await Promise.all([import("../lib/herdr-resume.ts"), import("../lib/herdr-cli.ts")]);
			return resumeHerdrSession(input.session, path.join(getAgentDir(), "sessions"), createHerdrCli(), input.signal, "tab", input.title);
		}
		const { resolveResumeSession } = await import("../lib/herdr-resume.ts");
		const target = await resolveResumeSession(input.session, path.join(getAgentDir(), "sessions"), input.signal);
		const title = input.title || defaultTitle(target.cwd);
		const command = ppCommand(buildPiArgsForSession(target.file));
		const plan = process.platform === "darwin" ? buildGhosttyPlan({ cwd: target.cwd, initialInput: command }) : buildWindowsTerminalPlan({ cwd: target.cwd, title, command });
		const result = launch(plan);
		if (!result.launched) throw new Error(result.error ? `Terminal launch failed: ${result.error}` : plan.reason ?? "Terminal launch failed.");
		return { session: target.session, cwd: target.cwd, title, launched: true };
	}
	const title = input.title || defaultTitle(input.cwd);
	if (isHerdr()) {
		const receipt = await createHerdrPiTab(input.cwd, title, undefined, undefined, Boolean(input.title));
		return { ...receipt, cwd: input.cwd, title, launched: true };
	}
	const plan = process.platform === "darwin" ? buildGhosttyPlan({ cwd: input.cwd, initialInput: ppCommand() }) : buildWindowsTerminalPlan({ cwd: input.cwd, title, command: ppCommand() });
	const result = launch(plan);
	if (!result.launched) throw new Error(result.error ? `Terminal launch failed: ${result.error}` : plan.reason ?? "Terminal launch failed.");
	return { cwd: input.cwd, title, launched: true };
}

async function executeNewInstance(args: string, ctx: CommandContext): Promise<void> {
	const cwd = ctx.cwd ?? process.cwd();
	const parsed = parseNewInstanceArgs(args);
	await launchNewInstance({ cwd, ...parsed });
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

async function executeBranch(args: string, ctx: CommandContext, pi: ExtensionAPI): Promise<void> {
	const parentManager = ctx.sessionManager;
	const leafId = parentManager?.getLeafId?.();
	if (!parentManager?.createBranchedSession || !leafId) throw new Error("Cannot branch this session yet: no persisted session leaf is available.");
	const parentSessionFile = parentManager.getSessionFile();
	if (!parentSessionFile) throw new Error("Cannot branch this session: session persistence is unavailable.");
	const branchPoint = parentManager.getEntry(leafId);
	if (!branchPoint) throw new Error(`Entry ${leafId} not found`);
	const cwd = ctx.cwd ?? process.cwd();
	const title = args.trim() || defaultTitle(cwd);
	ctx.ui.notify(isHerdr() ? `Opening branched Pi session in a Herdr tab: ${title}` : `Opening branched Pi session in a new terminal tab: ${title}`, "info");

	// createBranchedSession changes the manager it is called on. Open a separate
	// manager from the persisted parent so the live session remains the parent.
	const childManager = SessionManager.open(parentSessionFile, parentManager.getSessionDir());
	const branchSessionFile = childManager.createBranchedSession(leafId);
	if (!branchSessionFile) throw new Error("Cannot branch this session: session persistence is unavailable.");
	const parentSessionId = parentManager.getSessionId();
	const childSessionId = childManager.getSessionId();
	const evidence: BranchEvidence = {
		schemaVersion: 1,
		role: "parent",
		parentSessionId,
		parentSessionFile,
		childSessionId,
		childSessionFile: branchSessionFile,
		branchPointEntryId: branchPoint.id,
		branchPointTimestamp: branchPoint.timestamp,
	};
	childManager.appendCustomEntry(BRANCH_EVIDENCE_TYPE, { ...evidence, role: "child" });
	pi.appendEntry(BRANCH_EVIDENCE_TYPE, evidence);
	if (isHerdr()) {
		try { await createHerdrPiTab(cwd, title, branchSessionFile, undefined, Boolean(args.trim())); }
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
	pi.registerEntryRenderer<BranchEvidence>(BRANCH_EVIDENCE_TYPE, renderBranchEvidence);
	pi.on("before_agent_start", (event, ctx) => {
		// Read the persisted branch, not compacted model messages or cached session state.
		// Match this child so inherited markers and later branches do not change ownership.
		const sessionId = ctx.sessionManager.getSessionId();
		const evidence = ctx.sessionManager.getBranch()
			.filter((entry): entry is CustomEntry => entry.type === "custom" && entry.customType === BRANCH_EVIDENCE_TYPE)
			.map(entry => branchEvidence(entry.data))
			.find(data => data?.role === "child" && data.childSessionId === sessionId);
		if (!evidence) {
			delete event.systemPromptOptions.sections.session_branch;
			return;
		}
		event.systemPromptOptions.sections.session_branch = [
			`This is an independent /branch child of session ${evidence.parentSessionId}.`,
			`History through entry ${evidence.branchPointEntryId} (${evidence.branchPointTimestamp}) was inherited from the parent.`,
			"The parent retains responsibility for its monitoring and reminders. Do not recreate those follow-ups unless the user asks to continue them here.",
			"The child starts with no inherited schedules; an empty schedule list is expected, not missing work to restore. Scheduling remains available for this child's own work.",
		].join("\n");
	});
	pi.registerTool({
		name: "session_launch",
		label: "Launch Pi session",
		description: "Open a fresh Pi instance or resume an existing active-profile session UUID in a new tab. Resumed sessions use their saved cwd.",
		parameters: Type.Object({
			session: Type.Optional(Type.String({ description: "Existing session UUID; omit for a fresh instance" })),
			title: Type.Optional(Type.String({ description: "Optional tab title", maxLength: 80 })),
		}, { additionalProperties: false }),
		async execute(_id, params, signal, _onUpdate, ctx) {
			const receipt = await launchNewInstance({ cwd: ctx.cwd, session: params.session, title: params.title?.trim() || undefined, signal });
			return { content: [{ type: "text", text: JSON.stringify(receipt) }], details: receipt };
		},
	});
	registerProfileCommand(pi, "branch", {
		description: "Open a branched copy of this Pi session in a new terminal tab",
		handler: async (args, ctx) => executeBranch(args, ctx, pi),
	});
	registerProfileCommand(pi, "new-instance", {
		description: "Open a new Pi instance in this cwd in a new terminal tab",
		handler: async (args, ctx) => executeNewInstance(args, ctx),
	});
	registerProfileCommand(pi, "new-terminal", {
		description: "Open a plain shell in this cwd in a new terminal",
		handler: async (args, ctx) => executeNewTerminal(args, ctx),
	});
}
