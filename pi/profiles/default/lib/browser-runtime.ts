import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import {
	BrowserControlError,
	discoverBraveProfiles,
	getBrowserStatePath,
	listAllTargets,
	loadBrowserState,
	readBrowserConfig,
	resolveConfiguredProfile,
	saveBrowserState,
	type BrowserCommandResult,
	type BrowserSessionState,
	type ExtensionMode,
	type ProfileMode,
} from "./browser-control.js";
import { getAgentDir } from "./settings-file.js";

const execFileAsync = promisify(execFile);

export interface ProcessInfo {
	pid: number;
	parentPid: number;
	creationTime: string | number;
	executablePath: string;
	marker?: string;
	port?: string;
	userDataDir?: string;
	profileDirectory?: string;
}

export interface ProcessAdapter {
	inspect(pid: number): Promise<ProcessInfo | undefined>;
	list(): Promise<ProcessInfo[]>;
	terminate(pid: number): Promise<void>;
}

function fields(argv: string[]): Partial<ProcessInfo> {
	const result: Partial<ProcessInfo> = {};
	for (const argument of argv) {
		for (const [key, prefix] of [["marker", "--pi-launch-marker="], ["port", "--remote-debugging-port="], ["userDataDir", "--user-data-dir="], ["profileDirectory", "--profile-directory="]] as const) {
			if (argument.startsWith(prefix)) result[key] = argument.slice(prefix.length);
		}
	}
	return result;
}

export function windowsArgv(commandLine: string): string[] {
	const output: string[] = [];
	let token = "", quoted = false, slashes = 0;
	for (const character of commandLine ?? "") {
		if (character === "\\") { slashes++; continue; }
		if (character === '"') {
			token += "\\".repeat(Math.floor(slashes / 2));
			if (slashes % 2) token += '"'; else quoted = !quoted;
			slashes = 0;
			continue;
		}
		token += "\\".repeat(slashes); slashes = 0;
		if (/\s/.test(character) && !quoted) { if (token) { output.push(token); token = ""; } } else token += character;
	}
	token += "\\".repeat(slashes);
	if (token) output.push(token);
	return output;
}

function canonical(value: string): string {
	const resolved = path.resolve(value).replace(/[\\/]+$/, "");
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function windowsItems(value: unknown): ProcessInfo[] {
	const items = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
	return items.flatMap((raw) => {
		const item = raw as Record<string, unknown>;
		if (!item.ProcessId) return [];
		const argv = windowsArgv(String(item.CommandLine ?? ""));
		return [{ pid: Number(item.ProcessId), parentPid: Number(item.ParentProcessId ?? 0), creationTime: String(item.CreationDate ?? ""), executablePath: String(item.ExecutablePath ?? argv[0] ?? ""), ...fields(argv) }];
	});
}

export function createProcessAdapter(platform = process.platform): ProcessAdapter {
	if (platform === "win32") {
		const query = async (filter?: number) => {
			const command = `Get-CimInstance Win32_Process${filter ? ` -Filter 'ProcessId = ${filter}'` : ""} | Select-Object ProcessId,ParentProcessId,CreationDate,ExecutablePath,CommandLine | ConvertTo-Json -Compress`;
			try {
				const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", command], { timeout: filter ? 3000 : 10000, windowsHide: true });
				return windowsItems(stdout.trim() ? JSON.parse(stdout) : []);
			} catch { return []; }
		};
		return {
			inspect: async (pid) => (await query(pid))[0],
			list: () => query(),
			terminate: async (pid) => { await execFileAsync("powershell", ["-NoProfile", "-Command", "Stop-Process", "-Id", String(pid)], { timeout: 5000, windowsHide: true }); },
		};
	}
	if (platform === "darwin") {
		const list = async () => {
			try {
				const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,lstart=,command="], { timeout: 5000 });
				return stdout.split(/\r?\n/).flatMap((line): ProcessInfo[] => {
					const match = /^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(.+)$/.exec(line);
					if (!match) return [];
					const argv = windowsArgv(match[4]!);
					return [{ pid: Number(match[1]), parentPid: Number(match[2]), creationTime: match[3]!, executablePath: argv[0] ?? "", ...fields(argv) }];
				});
			} catch { return []; }
		};
		return { inspect: async (pid) => (await list()).find((item) => item.pid === pid), list, terminate: async (pid) => { process.kill(pid, "SIGTERM"); } };
	}
	const inspect = async (pid: number): Promise<ProcessInfo | undefined> => {
		try {
			const argv = (await fs.promises.readFile(`/proc/${pid}/cmdline`)).toString().split("\0").filter(Boolean);
			const tail = (await fs.promises.readFile(`/proc/${pid}/stat`, "ascii")).split(") ")[1]!.split(" ");
			return { pid, parentPid: Number(tail[1]), creationTime: Number(tail[19]) / 100, executablePath: argv[0] ?? "", ...fields(argv) };
		} catch { return undefined; }
	};
	return {
		inspect,
		list: async () => (await fs.promises.readdir("/proc")).filter((name) => /^\d+$/.test(name)).slice(0, 4096).reduce(async (pending, value) => { const result = await pending; const item = await inspect(Number(value)); if (item) result.push(item); return result; }, Promise.resolve([] as ProcessInfo[])),
		terminate: async (pid) => { process.kill(pid, "SIGTERM"); },
	};
}

export function processMatches(state: BrowserSessionState, info: ProcessInfo | undefined): boolean {
	if (!info) return false;
	return info.creationTime === state.processStartTime && canonical(info.executablePath) === canonical(state.executablePath) && canonical(info.userDataDir ?? "") === canonical(state.userDataDir) && info.profileDirectory === state.profileDirectory && info.marker === state.launchMarker && Number(info.port) === state.cdpPort;
}

async function freePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => { const address = server.address(); const port = typeof address === "object" && address ? address.port : 0; server.close((error) => error ? reject(error) : resolve(port)); });
	});
}

function findBrave(): string | undefined {
	const candidates = [process.env.BRAVE_PATH,
		...(process.platform === "win32" ? [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "BraveSoftware/Brave-Browser/Application/brave.exe"), process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "BraveSoftware/Brave-Browser/Application/brave.exe"), process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"]!, "BraveSoftware/Brave-Browser/Application/brave.exe")] : process.platform === "darwin" ? ["/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"] : ["/usr/bin/brave-browser", "/usr/bin/brave"]),
	].filter((value): value is string => Boolean(value));
	return candidates.find((candidate) => fs.existsSync(candidate));
}

async function cdpOnline(port: number): Promise<boolean> {
	try { const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) }); return response.ok && /brave/i.test(JSON.stringify(await response.json())); } catch { return false; }
}

async function waitForCdp(port: number, signal?: AbortSignal): Promise<void> {
	for (let attempt = 0; attempt < 40; attempt++) {
		if (signal?.aborted) throw new BrowserControlError("cancelled", "Browser operation was cancelled.");
		if (await cdpOnline(port)) return;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new BrowserControlError("launch_failed", "Brave CDP endpoint did not become available.");
}

export class BrowserRuntime {
	private readonly processes: ProcessAdapter;
	constructor(processes: ProcessAdapter = createProcessAdapter()) { this.processes = processes; }

	async status(_signal?: AbortSignal): Promise<BrowserCommandResult> {
		const state = loadBrowserState();
		if (!state) return { code: 0, stdout: "status: no owned session state", stderr: "" };
		const online = await cdpOnline(state.cdpPort);
		const verified = online && processMatches(state, await this.processes.inspect(state.pid));
		return { code: 0, stdout: `status: owned session record found\nprofileMode: ${state.profileMode}\ncdpOnline: ${online}\nprocessTupleVerified: ${verified}`, stderr: "" };
	}

	async start(input: { profileMode: ProfileMode; profileAlias?: string; extensionMode: ExtensionMode; url?: string; signal?: AbortSignal }): Promise<BrowserCommandResult> {
		const statePath = getBrowserStatePath();
		const old = loadBrowserState();
		if (old && processMatches(old, await this.processes.inspect(old.pid))) throw new BrowserControlError("session_occupied", "An owned browser session is already running.");
		if (old) await fs.promises.rm(statePath, { force: true });
		const executable = findBrave();
		if (!executable) throw new BrowserControlError("brave_missing", "Brave executable not found. Install Brave or set BRAVE_PATH.");
		let userDataDir: string, profileDirectory: string, extensionsExpected = false;
		if (input.profileMode === "real") {
			if (!input.profileAlias) throw new BrowserControlError("profile_required", "Real profile start requires a configured alias.");
			const configured = readBrowserConfig().profiles[input.profileAlias];
			const profile = resolveConfiguredProfile(input.profileAlias, undefined, discoverBraveProfiles(configured?.userDataDir ? [configured.userDataDir] : undefined));
			userDataDir = profile.userDataDir; profileDirectory = profile.profileDirectory; extensionsExpected = configured?.extensionsExpected ?? false;
		} else {
			userDataDir = path.join(getAgentDir(), "browser", "pi-profile"); profileDirectory = "Pi";
			await fs.promises.mkdir(userDataDir, { recursive: true });
		}
		const port = await freePort();
		const marker = randomUUID().replaceAll("-", "");
		const args = ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`, `--user-data-dir=${path.resolve(userDataDir)}`, `--profile-directory=${profileDirectory}`, `--pi-launch-marker=${marker}`, "--no-first-run", "--no-default-browser-check"];
		if (input.extensionMode === "disabled") args.push("--disable-extensions", "--disable-component-extensions-with-background-pages");
		const child = spawn(executable, args, { detached: false, stdio: "ignore", windowsHide: true });
		try { await waitForCdp(port, input.signal); } catch (error) { try { child.kill(); } catch {} throw error; }
		const observed = await this.processes.list();
		const matches = observed.filter((item) => item.marker === marker && item.port === String(port) && canonical(item.userDataDir ?? "") === canonical(userDataDir) && item.profileDirectory === profileDirectory);
		const ids = new Set(matches.map((item) => item.pid));
		const root = matches.filter((item) => !ids.has(item.parentPid)).sort((a, b) => String(a.creationTime).localeCompare(String(b.creationTime)))[0];
		if (!root || canonical(root.executablePath) !== canonical(executable)) { try { child.kill(); } catch {} throw new BrowserControlError("ownership_unverified", "Surviving Brave root process could not be verified."); }
		let state: BrowserSessionState = { version: 1, sessionId: randomUUID().replaceAll("-", ""), launchMarker: marker, profileMode: input.profileMode, ...(input.profileAlias ? { profileAlias: input.profileAlias } : {}), cdpPort: port, pid: root.pid, processStartTime: root.creationTime, executablePath: path.resolve(root.executablePath), userDataDir: path.resolve(userDataDir), profileDirectory, extensionMode: input.extensionMode, extensionsExpected, comparisonGeneration: 0 };
		await saveBrowserState(state);
		if (input.url) {
			const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(input.url)}`, { method: "PUT", signal: input.signal });
			if (!response.ok) { await this.stop(); throw new BrowserControlError("target_missing", "CDP could not open the requested URL; owned launch was cleaned up."); }
			const target = await response.json() as { id?: string }; state = { ...state, targetId: target.id }; await saveBrowserState(state);
		}
		const extensionTargets = (await listAllTargets(port)).filter((target) => target.url.startsWith("chrome-extension://"));
		if ((input.extensionMode === "disabled" && extensionTargets.length) || (input.extensionMode === "enabled" && extensionsExpected && !extensionTargets.length)) { await this.stop(); throw new BrowserControlError("extension_mode_mismatch", "Extension mode and observable runtime targets disagree; owned launch was cleaned up."); }
		return { code: 0, stdout: `started: ${state.sessionId}`, stderr: "" };
	}

	async stop(_signal?: AbortSignal): Promise<BrowserCommandResult> {
		const state = loadBrowserState();
		if (!state) return { code: 0, stdout: "close-owned: already_absent", stderr: "" };
		if (!processMatches(state, await this.processes.inspect(state.pid))) { await fs.promises.rm(getBrowserStatePath(), { force: true }); return { code: 0, stdout: "close-owned: detached", stderr: "" }; }
		try { await this.processes.terminate(state.pid); } catch (error) { return { code: 1, stdout: "close-owned: failed", stderr: String(error) }; }
		for (let attempt = 0; attempt < 20; attempt++) { if (!await this.processes.inspect(state.pid)) { await fs.promises.rm(getBrowserStatePath(), { force: true }); return { code: 0, stdout: "close-owned: stopped", stderr: "" }; } await new Promise((resolve) => setTimeout(resolve, 100)); }
		return { code: 1, stdout: "close-owned: incomplete", stderr: "Process remained after termination." };
	}
}
