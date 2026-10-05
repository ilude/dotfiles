import { copyFile, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";
import { harness } from "./fixtures/fake-pi.ts";

const dirs: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
it.each(["loader", "policy"])("retains Explorer failure blocker after real %s initialization failure", async failure => {
  const scratch = await mkdtemp(join(tmpdir(), "dc-bootstrap-failure-")); dirs.push(scratch);
  const profile = fileURLToPath(new URL("../../", import.meta.url));
  const entry = join(scratch, "extensions", "damage-control", "index.js");
  await mkdir(dirname(entry), { recursive: true });
  await copyFile(resolve(profile, "extensions/damage-control/index.js"), entry);
  await symlink(resolve(profile, "lib"), join(scratch, "lib"), "junction");
  // Either omit jiti or link real dependencies and omit policy/settings.
  // Both fail real bootstrap paths without an artificial initialization hook.
  if (failure === "policy") await symlink(resolve(profile, "node_modules"), join(scratch, "node_modules"), "junction");
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", JSON.stringify({ agent: "explorer" }));
  const handlers: ((event: ToolCallEvent, ctx: ExtensionContext) => unknown)[] = [];
  const pi = { on: (name: string, handler: typeof handlers[number]) => { if (name === "tool_call") handlers.push(handler); } } as unknown as ExtensionAPI;
  const { default: bootstrap } = await import(/* @vite-ignore */ pathToFileURL(entry).href);
  await expect(bootstrap(pi)).rejects.toThrow();
  expect(handlers).toHaveLength(1);
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", JSON.stringify({ agent: "developer" }));
  for (const toolName of ["bash", "powershell", "write", "edit", "read"]) {
    expect(await handlers[0]!({ toolName, toolCallId: toolName, input: { command: "echo fixture" } } as ToolCallEvent, {} as ExtensionContext)).toMatchObject({ block: true, reason: expect.stringContaining("initialization did not complete") });
  }
  expect(await handlers[0]!({ toolName: "subagent_parent", toolCallId: "parent", input: {} } as ToolCallEvent, {} as ExtensionContext)).toBeUndefined();
});
it("initializes the actual bootstrap and freezes Explorer across command controls and reload", async () => {
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", JSON.stringify({ agent: "explorer" }));
  const h = await harness();
  const handlers = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();
  const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
  const pi = {
    on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => handlers.set(name, [...handlers.get(name) ?? [], handler]),
    registerCommand: (name: string, command: Parameters<ExtensionAPI["registerCommand"]>[1]) => commands.set(name, command),
    appendEntry: vi.fn(), sendMessage: vi.fn(), events: { on: vi.fn(() => vi.fn()) },
  } as unknown as ExtensionAPI;
  const entry = new URL("../../extensions/damage-control/index.js", import.meta.url).href;
  const { default: bootstrap } = await import(/* @vite-ignore */ entry);
  await bootstrap(pi);
  expect(handlers.get("tool_call")).toHaveLength(1);
  const guard = handlers.get("tool_call")![0]!;
  const invoke = (command: string) => guard({ toolName: "bash", toolCallId: crypto.randomUUID(), input: { command } }, h.ctx);
  expect(await invoke("git status --short")).toBeUndefined();
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", JSON.stringify({ agent: "developer" }));
  h.ctx.ui.setStatus = vi.fn();
  const commandCtx = h.ctx as Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];
  await commands.get("dc")!.handler("off", commandCtx);
  await commands.get("dc")!.handler("mode default", commandCtx);
  expect(await invoke("touch fixture")).toMatchObject({ block: true, reason: expect.stringContaining("mutation") });
  await commands.get("dc")!.handler("mode noshell", commandCtx);
  expect(await invoke("git status --short")).toMatchObject({ block: true, reason: expect.stringContaining("noshell") });
  await commands.get("dc")!.handler("mode default", commandCtx);
  for (const handler of handlers.get("session_start") ?? []) await handler({ reason: "reload" }, h.ctx);
  expect(await invoke("touch fixture")).toMatchObject({ block: true, reason: expect.stringContaining("mutation") });
});
