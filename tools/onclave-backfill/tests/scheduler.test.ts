import { describe, expect, it } from "vitest";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import {
  applySchedulerPlan,
  detectSchedulerPlatform,
  renderLaunchAgentPlist,
  renderSystemdService,
  renderSystemdTimer,
  renderWindowsTaskXml,
  schedulerPlan,
  setupScheduler,
  uninstallScheduler,
  type SchedulerPaths,
  type SchedulerRunner,
} from "../src/scheduler.js";

const paths: SchedulerPaths = {
  executablePath: "/opt/Node Runtime/bin/node",
  artifactPath: "/home/test user/.dotfiles/tools/onclave-backfill/dist/main.js",
  configPath: "/home/test user/.dotfiles/yt/onclave-backfill.json",
  logPath: "/home/test user/.dotfiles/yt/onclave-backfill.log",
};

function runner(files: Record<string, string> = {}): SchedulerRunner & { calls: string[][]; files: Record<string, string> } {
  const calls: string[][] = [];
  return {
    calls,
    files,
    async run(command, args) { calls.push([command, ...args]); return { status: 0, stdout: "", stderr: "" }; },
    async writeFile(path, content) { this.files[path] = content; },
    async readFile(path) { if (!(path in this.files)) throw new Error("ENOENT"); return this.files[path]!; },
    async removeFile(path) { delete this.files[path]; },
    async exists(path) { return path in this.files; },
  };
}

describe("native scheduler definitions", () => {
  it("renders one Windows task with daily and logon triggers and bounded interactive execution", () => {
    const xml = renderWindowsTaskXml(paths, "CONTOSO\\mglenn");
    expect(xml).toContain("<CalendarTrigger>");
    expect(xml).toContain("<ScheduleByDay><DaysInterval>1</DaysInterval>");
    expect(xml).toContain("<LogonTrigger>");
    expect(xml).toContain("<UserId>CONTOSO\\mglenn</UserId>");
    expect(xml).toContain("<LogonType>InteractiveToken</LogonType>");
    expect(xml).toContain("<RunLevel>LeastPrivilege</RunLevel>");
    expect(xml).toContain("<StartWhenAvailable>true</StartWhenAvailable>");
    expect(xml).toContain("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
    expect(xml).toContain("<ExecutionTimeLimit>PT5M</ExecutionTimeLimit>");
    expect(xml).toContain("&quot;/home/test user/.dotfiles/tools/onclave-backfill/dist/main.js&quot;");
    expect(() => renderWindowsTaskXml(paths, "SYSTEM")).toThrow(/intended interactive user/);
  });

  it("renders a per-user launch agent with absolute arguments, daily calendar and login start", () => {
    const plist = renderLaunchAgentPlist(paths);
    expect(plist).toContain("<key>ProgramArguments</key>");
    expect(plist).toContain("/opt/Node Runtime/bin/node");
    expect(plist).toContain("/home/test user/.dotfiles/yt/onclave-backfill.json");
    expect(plist).toContain("<key>StartCalendarInterval</key>");
    expect(plist).toContain("<key>RunAtLoad</key><true/>");
    expect(plist).not.toContain(".zshrc");
    expect(plist).toContain("Managed by dotfiles Onclave backfill");
  });

  it("renders a user systemd oneshot and persistent daily timer without linger", () => {
    const service = renderSystemdService(paths);
    const timer = renderSystemdTimer();
    expect(service).toContain("Type=oneshot");
    expect(service).toContain('ExecStart="/opt/Node Runtime/bin/node"');
    expect(service).toContain("onclave-backfill.json");
    expect(timer).toContain("OnCalendar=daily");
    expect(timer).toContain("Persistent=true");
    expect(timer).toContain("WantedBy=default.target");
    expect(timer).not.toContain("linger");
    expect(timer).not.toContain("cron");
  });
});

describe("scheduler command plans and injected runner", () => {
  it.each([
    ["windows" as const, "schtasks.exe"],
    ["macos" as const, "launchctl"],
    ["linux" as const, "systemctl"],
  ])("creates an idempotent %s setup plan without shell sourcing", (platform, command) => {
    const plan = schedulerPlan(platform, paths, platform === "windows" ? "CONTOSO\\mglenn" : "");
    expect(plan.setup.some((item) => item.command === command)).toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(/source|zshrc|cron/);
    expect(isAbsolute(plan.definitionPath)).toBe(true);
    expect(plan.setup.some((item) => item.args.includes("--user"))).toBe(platform === "linux");
  });

  it("writes definitions and executes setup through an injected runner", async () => {
    const fake = runner();
    const plan = schedulerPlan("linux", paths);
    await applySchedulerPlan(plan, fake);
    expect(fake.files[plan.definitionPath]).toContain("Type=oneshot");
    expect(fake.files[plan.definitionPath.replace(/\.service$/, ".timer")]).toContain("Persistent=true");
    expect(fake.calls).toEqual([
      ["systemctl", "--user", "daemon-reload"],
      ["systemctl", "--user", "enable", "--now", "dotfiles-onclave-backfill.timer"],
    ]);
  });

  it("does not uninstall an unmanaged definition and removes only an owned one", async () => {
    const unmanaged = runner({ [join(tmpdir(), "service")]: "someone else's unit" });
    const unmanagedPlan = schedulerPlan("linux", { ...paths, definitionPath: join(tmpdir(), "service.service") });
    await expect(uninstallScheduler(unmanagedPlan, unmanaged)).resolves.toBe(false);
    expect(unmanaged.calls).toEqual([]);

    const owned = runner({ [unmanagedPlan.definitionPath]: renderSystemdService(paths), [unmanagedPlan.definitionPath.replace(/\.service$/, ".timer")]: renderSystemdTimer() });
    await expect(uninstallScheduler(unmanagedPlan, owned)).resolves.toBe(true);
    expect(owned.files[unmanagedPlan.definitionPath]).toBeUndefined();
    expect(owned.files[unmanagedPlan.definitionPath.replace(/\.service$/, ".timer")]).toBeUndefined();
    expect(owned.calls.some((call) => call[0] === "systemctl")).toBe(true);
  });

  it("surfaces missing build/config and accepts an injected native runner", async () => {
    const fake = runner();
    await expect(setupScheduler("linux", paths, "", "", fake, async () => true)).rejects.toThrow(/endpoint/);
    await expect(setupScheduler("linux", paths, "", "https://vault.example/api/v1", fake, async (path) => path === paths.executablePath)).rejects.toThrow(/build artifact/);
    const allFiles = runner({ [paths.executablePath]: "node", [paths.artifactPath]: "artifact" });
    const plan = await setupScheduler("linux", paths, "", "https://vault.example/api/v1", allFiles, async () => true);
    expect(plan.label).toBe("dotfiles-onclave-backfill.timer");
    expect(allFiles.files[paths.configPath]).toContain("https://vault.example/api/v1/");
  });

  it("turns a native nonzero result into a visible setup failure", async () => {
    const failing = runner();
    failing.run = async () => ({ status: 1, stderr: "systemd is unavailable" });
    await expect(applySchedulerPlan(schedulerPlan("linux", paths), failing)).rejects.toThrow(/systemd is unavailable/);
  });

  it("rejects unsupported hosts instead of selecting cron", () => {
    expect(() => detectSchedulerPlatform("freebsd")).toThrow(/Unsupported scheduler platform/);
  });
});
