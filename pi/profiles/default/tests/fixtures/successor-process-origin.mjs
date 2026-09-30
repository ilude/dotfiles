import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const [profile, specFile, hostFile, appFile, mode] = process.argv.slice(2);
const { createJiti } = createRequire(join(profile, "package.json"))("jiti");
const loader = createJiti(import.meta.url);
const { ChildTransport } = await loader.import("../../lib/subagents/transport.ts");
const spec = JSON.parse(readFileSync(specFile, "utf8"));
let hostPid;
const transport = new ChildTransport(async (_identity, message) => {
  if (message.type === "bootstrap") return { profile, spec, originRetirement: { sessionId: spec.origin, pid: process.pid, paneId: "fixture-pane", tabId: "fixture-tab", workspaceId: "fixture-workspace" } };
  if (message.type === "successor-host-started") { hostPid = message.payload.hostPid; writeFileSync(hostFile, JSON.stringify(message.payload)); return { accepted: true }; }
  if (message.type === "host-started") { hostPid = message.payload.pid; writeFileSync(hostFile, JSON.stringify({ hostPid })); return { accepted: true }; }
  if (message.type === "app-ready") { await transport.close(); process.exit(0); }
  if (message.type === "parent-events") await new Promise(() => {});
  return { accepted: true };
});
const endpoint = await transport.register({ child: "fixture-integrator", run: "fixture-run", origin: spec.origin });
const wrapper = fileURLToPath(new URL("./successor-process-host.mjs", import.meta.url));
const app = fileURLToPath(new URL("./successor-process-app.mjs", import.meta.url));
const diagnostic = openSync(`${hostFile}.stderr`, "a");
const child = spawn(process.execPath, [wrapper, app, profile, JSON.stringify(endpoint), mode], { cwd: spec.cwd, env: { ...process.env, PI_LIFETIME_APP_FILE: appFile, PI_HERDR_SUCCESSOR_ADMISSION_ENDPOINT: "must-not-reach-app" }, stdio: ["ignore", "ignore", diagnostic], shell: false, detached: process.platform === "win32" });
closeSync(diagnostic);
writeFileSync(`${hostFile}.launch`, JSON.stringify({ hostPid: child.pid }));
child.unref();
// The successor app talks exclusively to its new host, so the origin fixture
// exits once that independent app is running. Ordinary app reports directly.
if (mode === "successor") {
  const timer = setInterval(async () => {
    try { JSON.parse(readFileSync(appFile, "utf8")); } catch { return; }
    clearInterval(timer); await transport.close(); process.exit(0);
  }, 25);
}
setTimeout(() => { if (hostPid) writeFileSync(hostFile, JSON.stringify({ hostPid, timeout: true })); process.exit(2); }, 45_000);
