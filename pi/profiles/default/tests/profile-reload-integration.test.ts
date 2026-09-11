import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
// Keep this loader fixture isolated from unrelated optional runtime exports.
const bundlePath = "../node_modules/@earendil-works/pi-coding-agent/dist/bundle/index.js";
const { DefaultResourceLoader, SettingsManager } = await import(bundlePath) as typeof import("@earendil-works/pi-coding-agent");
let lastLoader: InstanceType<typeof DefaultResourceLoader> | undefined;
async function loadExtensionsCached(paths: string[], cwd: string, eventBus: ReturnType<typeof createEventBus>) {
  const loader = new DefaultResourceLoader({ cwd, agentDir: cwd, eventBus,
    settingsManager: SettingsManager.inMemory(), additionalExtensionPaths: paths,
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
  await loader.reload(); lastLoader = loader;
  return loader.getExtensions();
}
async function clearExtensionCache() { if (lastLoader) await lastLoader.reload(); lastLoader = undefined; }
import { createEventBus } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/event-bus.js";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { requestReloadState } from "../lib/profile-reload-events.ts";

let dir: string;
let bus: ReturnType<typeof createEventBus>;
const stops: (() => Promise<void>)[] = [];
beforeEach(() => {
  lastLoader = undefined; vi.useFakeTimers();
  dir = mkdtempSync(join(tmpdir(), "pi-reload-integration-"));
  mkdirSync(join(dir, "lib")); writeFileSync(join(dir, "settings.json"), "{}");
  vi.stubEnv("PI_CODING_AGENT_DIR", dir);
  bus = createEventBus();
});
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  bus.clear(); lastLoader = undefined; vi.useRealTimers(); vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});
async function load(order = ["profile-reload", "operator-footer", "clear"], reason = "startup") {
  const loaded = await loadExtensionsCached(order.map(name => resolve("extensions", `${name}.ts`)), dir, bus);
  expect(loaded.errors).toEqual([]);
  Object.assign(loaded.runtime, { getCommands: () => [], getAllTools: () => [], getThinkingLevel: () => "low" });
  let footer: { render(width: number): string[] } | undefined;
  const requestRender = vi.fn();
  const ctx = {
    cwd: dir, isProjectTrusted: () => false, sessionManager: { getEntries: () => [] },
    ui: { notify: vi.fn(), getAllThemes: () => [], setStatus: vi.fn(),
      setFooter: (factory: any) => { footer = factory({ requestRender }, {}, { getGitBranch: () => null, getExtensionStatuses: () => new Map() }); } },
  };
  async function emit(name: string, event: any) {
    for (const ext of loaded.extensions) for (const fn of ext.handlers.get(name as any) ?? []) await (fn as any)(event, ctx);
  }
  const stop = async () => { await emit("session_shutdown", { reason: "new" }); };
  stops.push(stop);
  await emit("session_start", { reason });
  return { ctx, loaded, stop, requestRender, text: (width = 180) => stripTerminalSequences(footer!.render(width).join("\n")) };
}
it.each([false, true])("delivers lib changes to separately loaded footer and clear (reverse=%s)", async reverse => {
  const r = await load(reverse ? ["operator-footer", "clear", "profile-reload"] : undefined);
  expect(r.text()).not.toContain("[reload]");
  writeFileSync(join(dir, "lib", "approval.ts"), "export const marker = 'new approval';");
  await vi.advanceTimersByTimeAsync(2000);
  expect(r.text()).toContain("[reload]"); expect(r.text(30)).toContain("[reload]");
  expect(r.requestRender).toHaveBeenCalled();
  const reload = vi.fn();
  const newSession = vi.fn(async (options: any) => { await r.stop(); await options.withSession({ reload }); });
  const command = r.loaded.extensions.flatMap(ext => [...ext.commands]).find(([name]) => name === "clear")![1];
  await command.handler("", { ...r.ctx, newSession } as any);
  expect(reload).toHaveBeenCalledOnce();
  expect(requestReloadState({ events: bus })).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});
it("preserves pending changes with cached factories, and clears after source reevaluation", async () => {
  let r = await load();
  writeFileSync(join(dir, "lib", "codex-usage.ts"), "export const marker = 'new quota';");
  await vi.advanceTimersByTimeAsync(2000);
  for (const reason of ["new", "resume", "fork"]) {
    await r.stop(); r = await load(undefined, reason);
    expect(r.text()).toContain("[reload]"); expect(vi.getTimerCount()).toBe(1);
  }
  await r.stop(); await clearExtensionCache(); r = await load(undefined, "reload");
  expect(r.text()).not.toContain("[reload]"); expect(vi.getTimerCount()).toBe(1);
});
it("reports monitor errors and absent-owner clear promptly", async () => {
  writeFileSync(join(dir, "settings.json"), "invalid");
  const r = await load(); expect(r.text()).toContain("[reload check failed]");
  await r.stop();
  const alone = await load(["clear"]);
  const command = alone.loaded.extensions[0].commands.get("clear")!;
  const reload = vi.fn();
  const newSession = vi.fn(async (options: any) => options.withSession({ reload }));
  await command.handler("", { ...alone.ctx, newSession } as any);
  expect(newSession).toHaveBeenCalledOnce(); expect(reload).not.toHaveBeenCalled();
  expect(alone.ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("unavailable"), "warning");
});
it("reevaluates an imported implementation only after cache invalidation", async () => {
  const source = join(dir, "lib", "formatter.ts");
  const entry = join(dir, "fixture.ts");
  writeFileSync(source, "export const value = 'old approval and quota';");
  writeFileSync(entry, "import {value} from './lib/formatter.ts'; export default pi => pi.registerCommand('marker', {description:value,handler(){}});");
  const marker = async () => {
    const result = await loadExtensionsCached([entry], dir, bus);
    expect(result.errors).toEqual([]);
    return result.extensions[0].commands.get("marker")!.description;
  };
  expect(await marker()).toBe("old approval and quota");
  writeFileSync(source, "export const value = 'updated approval and quota';");
  expect(await marker()).toBe("old approval and quota");
  await clearExtensionCache(); expect(await marker()).toBe("updated approval and quota");
});
