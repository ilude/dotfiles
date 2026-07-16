import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getAgentDir,
	getSettingsPath,
	updateJsonObjectAtomic,
} from "../lib/settings-file.ts";

let tempDir: string;

beforeEach(() => {
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-settings-file-"));
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("Pi settings path resolution", () => {
	it("uses the runtime PI_CODING_AGENT_DIR override ahead of home and legacy variables", () => {
		const explicitDir = path.join(tempDir, "explicit-agent");
		vi.stubEnv("PI_CODING_AGENT_DIR", explicitDir);
		vi.stubEnv("PI_AGENT_DIR", path.join(tempDir, "legacy-agent"));
		vi.stubEnv("HOME", path.join(tempDir, "home"));
		vi.stubEnv("USERPROFILE", path.join(tempDir, "profile"));

		expect(getAgentDir()).toBe(explicitDir);
		expect(getSettingsPath()).toBe(path.join(explicitDir, "settings.json"));
	});

	it("falls back to the runtime home directory when the official override is absent", () => {
		vi.stubEnv("PI_CODING_AGENT_DIR", "");
		vi.stubEnv("PI_AGENT_DIR", path.join(tempDir, "legacy-agent"));

		expect(getAgentDir()).toBe(path.join(os.homedir(), ".pi", "agent"));
	});
});

describe("atomic JSON-object updates", () => {
	it("preserves unrelated properties and the source indentation, line endings, and final-newline policy", async () => {
		const settingsPath = path.join(tempDir, "settings.json");
		const raw =
			'{\r\n\t"unchanged": {\r\n\t\t"value": true\r\n\t},\r\n\t"target": "old"\r\n}';
		fs.writeFileSync(settingsPath, raw, "utf-8");

		expect(
			await updateJsonObjectAtomic(settingsPath, (settings) => ({
				...settings,
				target: "new",
			})),
		).toBe(true);

		const updated = fs.readFileSync(settingsPath, "utf-8");
		expect(updated).toContain('\r\n\t"unchanged"');
		expect(updated).not.toMatch(/(?<!\r)\n/);
		expect(updated.endsWith("\n")).toBe(false);
		expect(JSON.parse(updated)).toEqual({
			unchanged: { value: true },
			target: "new",
		});
	});

	it("does not replace the file for a semantic no-op", async () => {
		const settingsPath = path.join(tempDir, "settings.json");
		const raw = '{ "value": true }';
		fs.writeFileSync(settingsPath, raw, "utf-8");
		const originalIdentity = fs.statSync(settingsPath);

		expect(
			await updateJsonObjectAtomic(settingsPath, (settings) => ({
				...settings,
			})),
		).toBe(false);
		expect(fs.readFileSync(settingsPath, "utf-8")).toBe(raw);
		expect(fs.statSync(settingsPath).ino).toBe(originalIdentity.ino);
	});

	it("replaces changed content through rename", async () => {
		const settingsPath = path.join(tempDir, "settings.json");
		fs.writeFileSync(settingsPath, '{"value":1}\n', "utf-8");
		const originalLink = path.join(tempDir, "original-settings.json");
		fs.linkSync(settingsPath, originalLink);

		expect(
			await updateJsonObjectAtomic(settingsPath, (settings) => ({
				...settings,
				value: 2,
			})),
		).toBe(true);
		expect(fs.readFileSync(settingsPath, "utf-8")).toBe('{\n  "value": 2\n}\n');
		expect(fs.readFileSync(originalLink, "utf-8")).toBe('{"value":1}\n');
	});

	it("rejects a non-object settings document without replacing it", async () => {
		const settingsPath = path.join(tempDir, "settings.json");
		fs.writeFileSync(settingsPath, "[]\n", "utf-8");

		await expect(
			updateJsonObjectAtomic(settingsPath, (settings) => settings),
		).rejects.toThrow(`Expected a JSON object in ${settingsPath}`);
		expect(fs.readFileSync(settingsPath, "utf-8")).toBe("[]\n");
	});

	it("preserves two updates from concurrent processes", async () => {
		const settingsPath = path.join(tempDir, "settings.json");
		const firstEnteredPath = path.join(tempDir, "first-entered");
		fs.writeFileSync(settingsPath, "{}\n", "utf-8");
		const moduleUrl = pathToFileURL(
			path.resolve(import.meta.dirname, "../lib/settings-file.ts"),
		).href;
		const script = `
			import fs from "node:fs";
			const [moduleUrl, settingsPath, key, enteredPath, delayMs] = process.argv.slice(1);
			const { updateJsonObjectAtomic } = await import(moduleUrl);
			await updateJsonObjectAtomic(settingsPath, (settings) => {
				if (enteredPath) fs.writeFileSync(enteredPath, "ready");
				if (delayMs !== "0") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(delayMs));
				return { ...settings, [key]: true };
			});
		`;
		const runWriter = (key: string, enteredPath = "", delayMs = 0) => {
			const child = spawn(
				process.execPath,
				[
					"--input-type=module",
					"--eval",
					script,
					moduleUrl,
					settingsPath,
					key,
					enteredPath,
					String(delayMs),
				],
				{ stdio: ["ignore", "pipe", "pipe"] },
			);
			return new Promise<void>((resolve, reject) => {
				let stderr = "";
				child.stderr.setEncoding("utf-8");
				child.stderr.on("data", (chunk: string) => {
					stderr += chunk;
				});
				child.on("error", reject);
				child.on("exit", (code) => {
					if (code === 0) resolve();
					else
						reject(new Error(`Writer ${key} exited with ${code}: ${stderr}`));
				});
			});
		};

		const first = runWriter("first", firstEnteredPath, 500);
		for (
			let attempt = 0;
			attempt < 500 && !fs.existsSync(firstEnteredPath);
			attempt++
		) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		if (!fs.existsSync(firstEnteredPath)) await first;
		expect(fs.existsSync(firstEnteredPath)).toBe(true);
		const second = runWriter("second");
		await Promise.all([first, second]);

		expect(JSON.parse(fs.readFileSync(settingsPath, "utf-8"))).toEqual({
			first: true,
			second: true,
		});
	}, 60_000);

	it("recovers an expired lock", async () => {
		const settingsPath = path.join(tempDir, "settings.json");
		const lockPath = `${settingsPath}.lock`;
		fs.writeFileSync(settingsPath, "{}\n", "utf-8");
		fs.mkdirSync(lockPath);
		const staleTime = new Date(Date.now() - 60_000);
		fs.utimesSync(lockPath, staleTime, staleTime);

		expect(
			await updateJsonObjectAtomic(settingsPath, (settings) => ({
				...settings,
				recovered: true,
			})),
		).toBe(true);
		expect(JSON.parse(fs.readFileSync(settingsPath, "utf-8"))).toEqual({
			recovered: true,
		});
		expect(fs.existsSync(lockPath)).toBe(false);
	});

	it.skipIf(process.platform === "win32")(
		"preserves POSIX mode and ownership",
		async () => {
			const settingsPath = path.join(tempDir, "settings.json");
			fs.writeFileSync(settingsPath, "{}\n", {
				encoding: "utf-8",
				mode: 0o640,
			});
			fs.chmodSync(settingsPath, 0o640);
			const before = fs.statSync(settingsPath);

			await updateJsonObjectAtomic(settingsPath, (settings) => ({
				...settings,
				changed: true,
			}));

			const after = fs.statSync(settingsPath);
			expect(after.mode & 0o777).toBe(before.mode & 0o777);
			expect({ uid: after.uid, gid: after.gid }).toEqual({
				uid: before.uid,
				gid: before.gid,
			});
		},
	);

	it.skipIf(process.platform !== "win32")(
		"preserves a restricted Windows destination DACL",
		async () => {
			const settingsPath = path.join(tempDir, "settings.json");
			fs.writeFileSync(settingsPath, "{}\n", "utf-8");
			const powershell = path.join(
				process.env.SystemRoot ?? "C:\\Windows",
				"System32",
				"WindowsPowerShell",
				"v1.0",
				"powershell.exe",
			);
			const encodedPath = Buffer.from(settingsPath, "utf-8").toString("base64");
			const decodePath = `$path=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))`;
			const accessSection =
				"[System.Security.AccessControl.AccessControlSections]::Access";
			const accessSddl = `$acl.GetSecurityDescriptorSddlForm(${accessSection})`;
			const before = execFileSync(
				powershell,
				[
					"-NoLogo",
					"-NoProfile",
					"-NonInteractive",
					"-Command",
					`${decodePath}; $acl=[System.Security.AccessControl.FileSecurity]::new($path,${accessSection}); $acl.SetAccessRuleProtection($true,$false); $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name; $rule=[System.Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','Allow'); $acl.SetAccessRule($rule); ([System.IO.FileInfo]::new($path)).SetAccessControl($acl); ${accessSddl}`,
				],
				{ encoding: "utf-8", windowsHide: true },
			).trim();

			await updateJsonObjectAtomic(settingsPath, (settings) => ({
				...settings,
				changed: true,
			}));

			const after = execFileSync(
				powershell,
				[
					"-NoLogo",
					"-NoProfile",
					"-NonInteractive",
					"-Command",
					`${decodePath}; $acl=[System.Security.AccessControl.FileSecurity]::new($path,${accessSection}); ${accessSddl}`,
				],
				{ encoding: "utf-8", windowsHide: true },
			).trim();
			expect(after).toBe(before);
		},
	);
});
