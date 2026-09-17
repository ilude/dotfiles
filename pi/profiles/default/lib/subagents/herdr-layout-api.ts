import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { result, type HerdrCli } from "../herdr-cli.ts";

export type FocusPane = (paneId: string) => Promise<void>;

export interface HerdrTabInfo {
  tab_id: string;
  workspace_id?: string;
  label?: unknown;
  title?: unknown;
  name?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Read one exact tab without using focus or substituting the focused tab. */
export async function inspectTab(cli: HerdrCli, tabId: string, workspaceId?: string): Promise<HerdrTabInfo> {
  const value = result(await cli(["tab", "get", tabId]));
  const tab = isRecord(value.tab) ? value.tab : undefined;
  if (tab?.tab_id !== tabId) throw new Error("Herdr tab identity changed");
  if (workspaceId && tab.workspace_id !== workspaceId) throw new Error("Herdr tab workspace changed");
  return {
    tab_id: tabId,
    workspace_id: typeof tab.workspace_id === "string" ? tab.workspace_id : undefined,
    label: tab.label,
    title: tab.title,
    name: tab.name,
  };
}

/** Herdr exposes the user-facing label first, with title/name compatibility fields. */
export function tabTitle(tab: HerdrTabInfo): string | undefined {
  for (const value of [tab.label, tab.title, tab.name]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** The CLI only exposes directional focus; the public API accepts an exact ID. */
export function createPaneFocus(env: NodeJS.ProcessEnv = process.env): FocusPane {
  return paneId => new Promise((resolve, reject) => {
    const path = env.HERDR_SOCKET_PATH;
    if (env.HERDR_ENV !== "1" || !path) return reject(new Error("Herdr focus socket unavailable"));
    const id = randomUUID();
    const socket = createConnection(process.platform === "win32" ? `\\\\.\\pipe\\${path}` : path);
    let buffer = Buffer.alloc(0), done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => finish(new Error("Herdr focus request timed out; inspect before retrying")), 10_000);
    socket.once("error", error => finish(error));
    socket.once("close", () => finish(new Error("Herdr focus socket closed before response")));
    socket.once("connect", () => socket.write(`${JSON.stringify({ id, method: "pane.focus", params: { pane_id: paneId } })}\n`));
    socket.on("data", (chunk: Buffer) => {
      if (buffer.length + chunk.length > 256 * 1024) return finish(new Error("Herdr focus response exceeded limit"));
      buffer = Buffer.concat([buffer, chunk]);
      const newline = buffer.indexOf(10);
      if (newline < 0) return;
      try {
        const reply = JSON.parse(buffer.subarray(0, newline).toString("utf8"));
        if (reply.id !== id || reply.error || !reply.result) throw new Error(`Herdr focus request failed: ${JSON.stringify(reply.error ?? "invalid response")}`);
        finish();
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
  });
}

/** Inherited caller IDs do not identify the pane the user is currently viewing. */
export async function focusedPane(cli: HerdrCli): Promise<string> {
  const workspace = result(await cli(["workspace", "list"])).workspaces?.find((item: any) => item.focused);
  if (!workspace) throw new Error("Herdr focused workspace unavailable");
  const tab = result(await cli(["tab", "list", "--workspace", workspace.workspace_id])).tabs?.find((item: any) => item.focused);
  const panes = result(await cli(["pane", "list", "--workspace", workspace.workspace_id])).panes;
  const pane = panes?.find((item: any) => item.focused && item.tab_id === tab?.tab_id);
  if (typeof pane?.pane_id !== "string") throw new Error("Herdr focused pane unavailable");
  return pane.pane_id;
}
