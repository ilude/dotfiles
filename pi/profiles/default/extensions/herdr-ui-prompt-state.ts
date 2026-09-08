import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function herdrPromptState(pi: ExtensionAPI) {
  let waiting = false;
  const clear = () => {
    if (waiting) pi.events.emit("herdr:blocked", { active: false });
    waiting = false;
  };
  pi.on("ui_prompt_start", (event, ctx) => {
    if (waiting || ctx.mode !== "tui" || process.env.HERDR_ENV !== "1" || !process.env.HERDR_PANE_ID || !process.env.HERDR_SOCKET_PATH) return;
    waiting = true;
    pi.events.emit("herdr:blocked", { active: true, label: (event.title || "Waiting for operator").replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 80) });
  });
  pi.on("ui_prompt_end", clear);
  pi.on("session_start", clear);
  pi.on("session_shutdown", clear);
}
