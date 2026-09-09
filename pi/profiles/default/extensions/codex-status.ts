import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { fetchCodexUsage, formatCacheUsage, formatQuota, formatUsage, readCacheUsage, recordCacheUsage, REFRESH_MS, USAGE_PAGE, type CodexUsage } from "../lib/codex-usage.ts";
import { formatUsage as formatBedrockUsage, summarize as summarizeBedrock } from "../lib/bedrock/ledger.ts";

const REPORT = "codex-usage-report";
const START = "codex-usage-start";

export default function codexStatus(pi: ExtensionAPI): void {
  let alive = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let request: Promise<CodexUsage> | undefined;
  let cached: CodexUsage | undefined;
  let cachedAt = 0;
  let generation = 0;
  let cacheError: string | undefined;

  pi.registerEntryRenderer(REPORT, entry => new Text((entry.data as { text: string }).text, 0, 0));

  function getUsage(force = false): Promise<CodexUsage> {
    if (request) return request;
    if (!force && cached && Date.now() - cachedAt < REFRESH_MS) return Promise.resolve(cached);
    const abort = new AbortController();
    controller = abort;
    const timeout = setTimeout(() => abort.abort(), 15_000);
    request = fetchCodexUsage(abort.signal).then(value => {
      if (!abort.signal.aborted) { cached = value; cachedAt = Date.now(); }
      return value;
    }).finally(() => { clearTimeout(timeout); request = undefined; });
    return request;
  }
  function cacheReport(): string {
    try { return formatCacheUsage(readCacheUsage()) + (cacheError ? `\n  Recording unavailable: ${cacheError}` : ""); }
    catch { return "OpenAI Codex cache: unavailable (cannot read profile cache history)."; }
  }
  async function refresh(ctx: ExtensionContext, report?: { marker?: string; force?: boolean }): Promise<void> {
    const epoch = generation;
    let content: string;
    try {
      const usage = await getUsage(report?.force);
      if (!alive || epoch !== generation) return;
      ctx.ui.setStatus("codex", formatQuota(usage, (color, text) => ctx.ui.theme.fg(color, text)));
      content = formatUsage(usage);
    } catch (error) {
      if (!alive || epoch !== generation) return;
      ctx.ui.setStatus("codex", cached ? `${formatQuota(cached)} stale` : "codex: unavailable");
      content = `Codex usage unavailable: ${error instanceof Error ? error.message : "request failed"}\n${USAGE_PAGE}`;
    }
    if (report) {
      let bedrock: string;
      try { bedrock = formatBedrockUsage(await summarizeBedrock()); }
      catch (error) { bedrock = `Bedrock local estimate unavailable: ${error instanceof Error ? error.message : "cannot read ledger"}`; }
      const text = `${content}\n\n${cacheReport()}\n\n${bedrock}`;
      pi.appendEntry(REPORT, { text, marker: report.marker });
      if (ctx.mode !== "tui") ctx.ui.notify(text, "info");
    }
  }
  function poll(ctx: ExtensionContext): void {
    const epoch = generation;
    timer = setTimeout(() => {
      void refresh(ctx).finally(() => { if (alive && generation === epoch) poll(ctx); });
    }, REFRESH_MS);
    timer.unref();
  }
  pi.on("session_start", (event, ctx) => {
    alive = true;
    generation++;
    if (!ctx.hasUI) return;
    const entries = ctx.sessionManager.getEntries();
    const sessionId = ctx.sessionManager.getSessionId();
    // A clear may immediately reload. Persist a pending marker so the new runtime
    // can complete an interrupted report without emitting a second finished report.
    let marker = [...entries].reverse().find(entry => entry.type === "custom" && entry.customType === START && (entry.data as { sessionId?: string })?.sessionId === sessionId)?.id;
    const complete = marker && entries.some(entry => entry.type === "custom" && entry.customType === REPORT && (entry.data as { marker?: string })?.marker === marker);
    // /branch launches a new process with existing history, so it also receives
    // "startup". Refresh its footer without appending another transcript report.
    const existingConversation = !!ctx.sessionManager.getHeader()?.parentSession || entries.some(entry => entry.type === "message");
    if ((event.reason === "startup" && !existingConversation) || event.reason === "new") {
      pi.appendEntry(START, { sessionId });
      marker = ctx.sessionManager.getEntries().at(-1)?.id;
    } else if (event.reason !== "reload" || complete) marker = undefined;
    void refresh(ctx, marker ? { marker } : undefined);
    poll(ctx);
  });
  pi.on("session_shutdown", () => {
    alive = false;
    generation++;
    clearTimeout(timer);
    controller?.abort();
  });
  pi.on("message_end", event => {
    if (event.message.role !== "assistant") return;
    try { recordCacheUsage(event.message); cacheError = undefined; }
    catch { cacheError = "cannot append profile cache history"; }
  });
  pi.registerCommand("usage", {
    description: "Show Codex subscription limits and recent prompt-cache usage",
    handler: async (args, ctx) => {
      if (args.trim()) throw new Error("Usage: /usage");
      await refresh(ctx, { force: true });
    },
  });
}
