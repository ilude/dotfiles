import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { basename, resolve } from "node:path";

export default function herdrOrchestratorLabel(pi: ExtensionAPI): void {
  pi.on("session_start", async (event, ctx) => {
    // Label the process's initial pane, not every new/resumed/reloaded chat.
    // Restricted children keep their assignment-specific human names.
    if (event.reason !== "startup" || ctx.mode !== "tui" || process.env.HERDR_ENV !== "1"
      || process.env.PI_SUBAGENT_AUTHORITY || process.env.PI_HERDR_SUBAGENT) return;
    const pane = process.env.HERDR_PANE_ID;
    if (!pane || !process.env.HERDR_SOCKET_PATH) return;
    const tab = process.env.HERDR_TAB_ID;
    const directory = basename(resolve(ctx.cwd));
    // Plan children receive an explicit stub label from the launcher. Mark
    // that boundary so late startup labeling cannot replace it with cwd.
    const explicitChildLabel = process.env.PI_HERDR_TAB_LABEL;
    const labels = [
      { kind: "pane", args: ["pane", "rename", pane, "Orchestrator"] },
      // The launcher already names plan children. Do not issue a late tab
      // rename: it can overwrite a manual rename made while startup settles.
      ...(tab && !explicitChildLabel ? [{ kind: "tab", args: ["tab", "rename", tab, directory] }] : []),
    ];
    for (const { kind, args } of labels) {
      try {
        const result = await pi.exec(process.env.HERDR_BIN_PATH || "herdr", args, { timeout: 2000 });
        if (result.killed || result.code !== 0) throw new Error(result.killed ? "request timed out" : (result.stderr || `exit ${result.code}`).trim());
      } catch (error) {
        ctx.ui.notify(`Herdr ${kind} label unavailable: ${String(error).slice(0, 200)}`, "warning");
      }
    }
  });
}
