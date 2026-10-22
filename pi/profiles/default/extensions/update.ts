import { VERSION, getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { registerProfileCommand } from "../lib/profile-command.ts";
import { getSubagentRuntime } from "../lib/subagents/runtime.ts";
import { createHerdrCli } from "../lib/herdr-cli.ts";
import { createCompatibilityEndpoint } from "../lib/pi-update-compat.ts";
import {
  acquireUpdateLock, formatUpdateResults, parseUpdateEndpoint, requestCooperativeRestart,
  restartConnectedSessions, runPiUpdatePass, type SessionUpdateResult,
} from "../lib/pi-update.ts";

interface ArmedRestart { sessionId: string; sessionFile: string; cwd: string; leafId: string | null }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

export default function update(pi: ExtensionAPI) {
  if (process.env.PI_SUBAGENT_AUTHORITY || process.env.PI_HERDR_SUBAGENT || process.env.PI_HERDR_CLOSEOUT_SUCCESSOR) return;
  let promptDepth = 0, commandRunning = false;
  let current: ExtensionContext | undefined;
  let compatibility: Awaited<ReturnType<typeof createCompatibilityEndpoint>> | undefined;
  let activeEndpoint: ReturnType<typeof parseUpdateEndpoint>;
  const supervisor = () => {
    const endpoint = parseUpdateEndpoint(process.env.PI_UPDATE_ENDPOINT);
    return endpoint && process.send && endpoint.pid === process.ppid && process.env.PI_UPDATE_HOST_PID === String(process.ppid) ? endpoint : undefined;
  };
  const armed = new Map<string, ArmedRestart>();
  pi.on("ui_prompt_start", () => { promptDepth++; });
  pi.on("ui_prompt_end", () => { promptDepth = Math.max(0, promptDepth - 1); });
  pi.registerEntryRenderer<string>("pi-update-result", entry => new Text(typeof entry.data === "string" ? entry.data : "", 0, 0));

  const eligibility = (ctx: ExtensionContext): string | undefined => {
    if (commandRunning) return "another update pass is running";
    if (ctx.mode !== "tui") return "not an interactive TUI session";
    if (!ctx.isIdle()) return "agent is busy";
    if (ctx.hasPendingMessages()) return "messages are queued";
    if (ctx.ui.getEditorText().length) return "editor contains unsent text";
    if (promptDepth > 0) return "a UI prompt is active";
    if (getSubagentRuntime().hasActiveResources()) return "subagents are active or retained";
    return undefined;
  };
  const prepare = async (ctx: ExtensionContext, version: string) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    if (!sessionFile) throw new Error("session has no durable file");
    const sessionId = ctx.sessionManager.getSessionId(), cwd = ctx.cwd;
    await access(sessionFile);
    const reason = eligibility(ctx);
    if (current !== ctx || reason || ctx.sessionManager.getSessionId() !== sessionId) throw new Error(reason ?? "session changed before restart");
    pi.events.emit("default:update:prepare", undefined);
    // Appending on the selected branch makes reopening this file restore its leaf.
    pi.appendEntry("pi-update-restart", { version });
    return { sessionId, sessionFile, cwd, leafId: ctx.sessionManager.getLeafId() };
  };
  const send = (message: Record<string, unknown>) => {
    if (process.connected && process.send) process.send(message, undefined, undefined, () => {});
  };
  const hostMessage = (raw: unknown) => {
    if (!object(raw) || typeof raw.id !== "string") return;
    const id = raw.id;
    if (raw.type === "pi-update:rejected") { armed.delete(id); return; }
    if (raw.type === "pi-update:accepted") {
      const expected = armed.get(id); armed.delete(id);
      const ctx = current;
      if (!expected || !ctx || eligibility(ctx) || ctx.sessionManager.getSessionId() !== expected.sessionId
        || ctx.sessionManager.getSessionFile() !== expected.sessionFile || ctx.cwd !== expected.cwd || ctx.sessionManager.getLeafId() !== expected.leafId) {
        send({ type: "pi-update:skip", id, reason: "session eligibility or identity changed before restart" }); return;
      }
      ctx.shutdown(); return;
    }
    if (raw.type !== "pi-update:request" || typeof raw.version !== "string") return;
    const ctx = current;
    const reason = ctx ? eligibility(ctx) : "session is not ready";
    if (reason || !ctx) { send({ type: "pi-update:skip", id, reason }); return; }
    const version = raw.version;
    void prepare(ctx, version).then(coordinates => {
      armed.set(id, coordinates);
      send({ type: "pi-update:restart", id, sessionFile: coordinates.sessionFile, cwd: coordinates.cwd });
    }).catch(error => send({ type: "pi-update:skip", id, reason: error instanceof Error ? error.message : String(error) }));
  };
  pi.on("session_start", async (_event, ctx) => {
    current = ctx; promptDepth = 0; armed.clear();
    activeEndpoint = supervisor();
    process.removeListener("message", hostMessage);
    if (activeEndpoint && ctx.mode === "tui") {
      process.on("message", hostMessage);
      send({ type: "pi-update:ready", version: VERSION, sessionId: ctx.sessionManager.getSessionId() });
    } else if (ctx.mode === "tui" && process.env.HERDR_ENV === "1" && process.env.HERDR_SOCKET_PATH && process.env.HERDR_PANE_ID) {
      const controller = await createCompatibilityEndpoint({ profile: getAgentDir(), env: process.env,
        sessionId: ctx.sessionManager.getSessionId(), cli: createHerdrCli(),
        eligibility: () => current === ctx ? eligibility(ctx) : "session changed",
        prepare: version => prepare(ctx, version),
        isCurrent: saved => current === ctx && ctx.sessionManager.getSessionId() === saved.sessionId && ctx.sessionManager.getSessionFile() === saved.sessionFile
          && ctx.cwd === saved.cwd && ctx.sessionManager.getLeafId() === saved.leafId,
        shutdown: () => ctx.shutdown(),
      });
      if (current !== ctx) { await controller.close(); return; }
      compatibility = controller; activeEndpoint = controller.endpoint;
    }
  });
  pi.on("session_shutdown", async () => {
    current = undefined; activeEndpoint = undefined; armed.clear(); promptDepth = 0;
    process.removeListener("message", hostMessage);
    const controller = compatibility; compatibility = undefined;
    await controller?.close();
  });

  registerProfileCommand(pi, "update", {
    description: "Update Pi and restart eligible sessions in the connected Herdr server",
    handler: async (args, ctx) => {
      if (args.trim()) { ctx.ui.notify("Usage: /update", "warning"); return; }
      if (commandRunning) { ctx.ui.notify("An update pass is already running.", "warning"); return; }
      const descriptor = activeEndpoint;
      if (!descriptor) {
        ctx.ui.notify("Outside Herdr, this session needs the update-capable launcher. Relaunch through bare pi first. Existing Herdr sessions can load migration support with /reload.", "warning"); return;
      }
      const self = { ...descriptor, sessionId: ctx.sessionManager.getSessionId() };
      commandRunning = true;
      let release: (() => Promise<void>) | undefined;
      ctx.ui.setStatus("pi-update", "updating Pi...");
      try {
        release = await acquireUpdateLock();
        const cli = createHerdrCli();
        if (self.server) {
          const response: unknown = JSON.parse(await cli(["pane", "current", "--current"]));
          if (!object(response) || response.error || !object(response.result) || !object(response.result.pane) || typeof response.result.pane.pane_id !== "string") throw new Error("Cannot resolve the invoking Herdr pane");
          self.pane = response.result.pane.pane_id;
        }
        const result = await runPiUpdatePass({ cwd: fileURLToPath(new URL("../../../..", import.meta.url)), env: { ...process.env, PI_CODING_AGENT_DIR: getAgentDir() } });
        if (!result.installed || !result.linked || !result.version || result.error) {
          ctx.ui.notify(`Pi update did not complete; no sessions restarted. ${result.error ?? "Updated version unavailable"}`, "error"); return;
        }
        ctx.ui.setStatus("pi-update", "restarting eligible Pi sessions...");
        let results: SessionUpdateResult[];
        try { results = await restartConnectedSessions(self, result.version, { cli }); }
        catch (error) { results = [{ label: "Herdr discovery", status: "failed", reason: error instanceof Error ? error.message : String(error) }]; }
        const summary = formatUpdateResults(result.version, results);
        pi.appendEntry("pi-update-result", summary);
        ctx.ui.notify(`${summary}\nThis session restarts last if eligible.`, "info");
        // Release the installation lock before orderly shutdown, which terminates this handler.
        await release(); release = undefined;
        commandRunning = false;
        const ownReason = eligibility(ctx);
        if (ownReason) { ctx.ui.notify(`This session was skipped: ${ownReason}.`, "warning"); return; }
        const response = await requestCooperativeRestart(self, result.version);
        if (response.status !== "restarted") ctx.ui.notify(`This session was not restarted: ${response.reason ?? response.status}.`, "warning");
      } catch (error) {
        ctx.ui.notify(`Pi update stopped: ${error instanceof Error ? error.message : String(error)}`, "error");
      } finally {
        commandRunning = false;
        await release?.();
        ctx.ui.setStatus("pi-update", undefined);
      }
    },
  });
}
