// Adapted from legacy tps-tracker.ts, originally davis7dotsh/my-pi-setup
// (blob 5c198dc30baa96a64a6ee55a18a9a59a9b7ac7d0).
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATE = "generation-stats";
export default function tpsTracker(pi: ExtensionAPI): void {
  let messageStart: number | undefined;
  let streamStart: number | undefined;
  let estimate = 0;
  let output = 0;
  let streamMs = 0;
  let latencyMs = 0;
  let samples = 0;
  let official = 0;
  let interrupted = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stopTimer = () => { clearInterval(timer); timer = undefined; };
  function reset(): void {
    stopTimer(); messageStart = streamStart = undefined;
    estimate = output = streamMs = latencyMs = samples = official = 0;
    interrupted = false;
  }
  function show(ctx: ExtensionContext): void {
    if (!ctx.hasUI || messageStart === undefined) return;
    if (streamStart === undefined) {
      ctx.ui.setStatus("tps", `first token: waiting ${((performance.now() - messageStart) / 1000).toFixed(1)}s`);
      return;
    }
    const seconds = Math.max(0, performance.now() - streamStart) / 1000;
    const tokens = official > 0 ? official : estimate;
    const approx = official > 0 ? "" : "~";
    const rate = seconds > 0 ? `${approx}${Math.round(tokens / seconds)} tok/s` : "TPS pending";
    ctx.ui.setStatus("tps", `${rate} | first ${((streamStart - messageStart) / 1000).toFixed(1)}s | ${approx}${Math.round(tokens)} tok / ${seconds.toFixed(1)}s streaming`);
  }
  pi.on("session_start", (_event, ctx) => {
    reset();
    const entry = [...ctx.sessionManager.getEntries()].reverse().find(entry => entry.type === "custom" && entry.customType === STATE && (entry.data as { sessionId?: string })?.sessionId === ctx.sessionManager.getSessionId());
    if (ctx.hasUI) ctx.ui.setStatus("tps", entry?.type === "custom" ? (entry.data as { text: string }).text : undefined);
  });
  pi.on("session_shutdown", reset);
  pi.on("agent_start", (_event, ctx) => {
    reset();
    if (ctx.hasUI) ctx.ui.setStatus("tps", "generating...");
  });
  pi.on("message_start", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    messageStart = performance.now(); streamStart = undefined; estimate = official = 0;
    stopTimer();
    if (ctx.hasUI) {
      show(ctx);
      timer = setInterval(() => show(ctx), 250);
      timer.unref();
    }
  });
  pi.on("message_update", (event, ctx) => {
    const delta = event.assistantMessageEvent;
    if (event.message.role !== "assistant" || messageStart === undefined || !["text_delta", "thinking_delta", "toolcall_delta"].includes(delta.type)) return;
    if (!("delta" in delta) || typeof delta.delta !== "string" || !delta.delta) return;
    if (streamStart === undefined) {
      streamStart = performance.now();
      latencyMs += streamStart - messageStart; samples++;
    }
    estimate += delta.delta.length / 4;
    official = event.message.usage?.output ?? 0;
    show(ctx);
  });
  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    show(ctx); stopTimer();
    interrupted ||= event.message.stopReason === "aborted" || event.message.stopReason === "error";
    // Do not manufacture streaming duration when no deltas were observed.
    if (streamStart !== undefined && event.message.usage?.output > 0) {
      output += event.message.usage.output;
      streamMs += Math.max(0, performance.now() - streamStart);
    }
    messageStart = streamStart = undefined;
  });
  pi.on("agent_end", (_event, ctx) => {
    stopTimer();
    const seconds = streamMs / 1000;
    const rate = seconds > 0 && output > 0 ? `${Math.round(output / seconds)} tok/s` : "TPS unavailable";
    const first = samples ? `${(latencyMs / samples / 1000).toFixed(1)}s` : "unavailable";
    const text = `${interrupted ? "stopped" : "done"}: ${rate} | first ${first} avg | ${output} tok / ${seconds.toFixed(1)}s streaming`;
    if (ctx.hasUI) ctx.ui.setStatus("tps", text);
    pi.appendEntry(STATE, { sessionId: ctx.sessionManager.getSessionId(), text });
  });
}
