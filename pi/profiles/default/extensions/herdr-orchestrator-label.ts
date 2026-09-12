import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { basename, resolve } from "node:path";
import { HerdrTabNamingOwner, type NamingOwnerState } from "../lib/herdr-tab-naming.ts";
import { HERDR_TAB_TITLE_OWNED, type HerdrTabTitleOwnedEvent } from "../lib/herdr-tab-title-events.ts";
import type { HerdrCli } from "../lib/herdr-cli.ts";

const RELOAD_STATE = Symbol.for("pi.herdr-tab-naming.reload-state.v1");
type ReloadStore = Map<string, NamingOwnerState>;
function reloadStore(): ReloadStore {
  const root = globalThis as typeof globalThis & { [RELOAD_STATE]?: ReloadStore };
  return root[RELOAD_STATE] ??= new Map();
}

function eligible(ctx: ExtensionContext): boolean {
  return ctx.mode === "tui" && process.env.HERDR_ENV === "1" && !process.env.PI_SUBAGENT_AUTHORITY
    && !process.env.PI_HERDR_SUBAGENT && Boolean(process.env.HERDR_SOCKET_PATH && process.env.HERDR_PANE_ID
      && process.env.HERDR_TAB_ID && process.env.HERDR_WORKSPACE_ID);
}

function cliFor(pi: ExtensionAPI): HerdrCli {
  return async (args, options = {}) => {
    const result = await pi.exec(process.env.HERDR_BIN_PATH || "herdr", args, {
      timeout: options.timeoutMs ?? 10_000,
      signal: options.signal,
    });
    if (result.killed || result.code !== 0) throw new Error(result.killed ? "request timed out" : (result.stderr || `exit ${result.code}`).trim());
    return result.stdout;
  };
}

export default function herdrOrchestratorLabel(pi: ExtensionAPI): void {
  let owner: HerdrTabNamingOwner | undefined;
  let firstPromptDelivered = false;
  let active = false;
  let cwdTitle = "pi";
  const key = () => `${process.env.HERDR_WORKSPACE_ID}:${process.env.HERDR_TAB_ID}:${process.env.HERDR_PANE_ID}`;
  const entries = (ctx: ExtensionContext) => ctx.sessionManager.buildContextEntries() as readonly unknown[];
  const background = (trigger: string, context: readonly unknown[]) => {
    const current = owner;
    if (!current) return;
    void current.attempt(trigger, context).catch(() => undefined);
  };

  pi.events?.on(HERDR_TAB_TITLE_OWNED, data => {
    const event = data as HerdrTabTitleOwnedEvent;
    if (owner && typeof event?.title === "string") owner.claim(event.title, event.explicit);
  });

  pi.on("session_start", async (event, ctx) => {
    if (!eligible(ctx)) return;
    active = true;
    firstPromptDelivered = false;
    const pane = process.env.HERDR_PANE_ID!;
    const tab = process.env.HERDR_TAB_ID!;
    cwdTitle = basename(resolve(ctx.cwd)) || "pi";
    const inheritedTitle = process.env.PI_HERDR_TAB_TITLE || process.env.PI_HERDR_TAB_LABEL || undefined;
    const inheritedExplicit = process.env.PI_HERDR_TAB_TITLE_EXPLICIT === "1" || Boolean(process.env.PI_HERDR_TAB_LABEL);
    const restored = ["reload", "resume", "fork"].includes(event.reason) ? reloadStore().get(key()) : undefined;
    reloadStore().delete(key());
    const initialTitle = event.reason === "new" ? cwdTitle : (restored?.ownedTitle ?? inheritedTitle ?? cwdTitle);
    const initialExplicit = event.reason !== "new" && !restored && inheritedExplicit;
    const commands: string[][] = [];
    if (event.reason === "startup") commands.push(["pane", "rename", pane, "Orchestrator"]);
    // The child establishes its own initial title. Launchers never perform a late rename.
    if (!restored) commands.push(["tab", "rename", tab, initialTitle]);
    for (const args of commands) {
      try { await cliFor(pi)(args, { timeoutMs: 2_000 }); }
      catch { /* Label and naming failures are deliberately log-only. */ }
    }
    owner = new HerdrTabNamingOwner({
      target: { tabId: tab, paneId: pane, workspaceId: process.env.HERDR_WORKSPACE_ID, sessionId: ctx.sessionManager.getSessionId() },
      initialTitle,
      initialState: restored,
      cli: cliFor(pi),
    });
    if (initialExplicit) owner.claim(initialTitle);
    if (!initialExplicit && event.reason === "startup" && entries(ctx).length) background("restored-startup", entries(ctx));
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (!active || firstPromptDelivered) return;
    firstPromptDelivered = true;
    // event.prompt is the delivered pre-template prompt and avoids naming from expanded skill bodies.
    background("first-prompt", [{ type: "message", message: { role: "user", content: event.prompt } }]);
  });
  pi.on("agent_settled", (_event, ctx) => { if (active) background("agent-settled", entries(ctx)); });
  pi.on("session_tree", () => owner?.cancel());
  pi.on("session_shutdown", event => {
    if (["reload", "resume", "fork"].includes(event.reason) && owner) reloadStore().set(key(), owner.snapshot());
    else reloadStore().delete(key());
    owner?.cancel(); owner = undefined; active = false;
  });
}
