import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";

export default async function (pi) {
  const profile = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const { createJiti } = createRequire(import.meta.url)(realpathSync(resolve(profile, "node_modules/jiti")));
  const loader = createJiti(import.meta.url, { tryNative: false, moduleCache: false, fsCache: false, nativeModules: ["web-tree-sitter", "yaml"] });
  const { initialize } = await loader.import("../../lib/damage-control/enforcement.ts");
  const gate = await initialize(pi, profile, resolve(profile, "../../.."));
  const command = {
    description: "Switch session-local Damage Control controls",
    async handler(args, ctx) {
      const value = args.trim();
      if (value === "on" || value === "off") {
        gate.setBypass(value === "off");
        ctx.ui.setStatus("damage-control", value === "off" ? "damage-control: bypassed" : undefined);
        ctx.ui.notify(value === "off" ? "damage-control bypassed for eligible local asks" : "damage-control restored", "info");
        return;
      }
      if (value === "mode default" || value === "mode noshell") {
        gate.setMode(value.endsWith("noshell") ? "noshell" : "default");
        ctx.ui.notify(`damage-control ${value}`, "info");
        return;
      }
      ctx.ui.notify("Usage: /dc on | /dc off | /dc mode default | /dc mode noshell", "warning");
    },
  };
  pi.registerCommand("damage-control", command);
  pi.registerCommand("dc", command);
  pi.on("tool_call", (event, ctx) => gate.handle(event, ctx));
  // CLI-backed Herdr commands use the same gate with verified remote-pane
  // shell/cwd, not the orchestrator's cwd or a nested `herdr pane run` string.
  let unsubscribe;
  const bindHerdr = () => {
    unsubscribe?.();
    unsubscribe = pi.events.on("herdr:check-command", (request) => {
      request.accept(gate.handle(request.event, request.ctx));
    });
  };
  pi.on("session_start", bindHerdr);
  pi.on("session_shutdown", () => { unsubscribe?.(); unsubscribe = undefined; });
}
