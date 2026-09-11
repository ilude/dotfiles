import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerGate, type GateDependencies } from "../../../lib/damage-control/enforcement.ts";
import { analyzeShell } from "../../../lib/damage-control/shell.ts";
import { parsePolicy, parseSettings } from "../../../lib/damage-control/policy.ts";
const policy = parsePolicy(readFileSync(new URL("../../../damage-control-rules.yaml", import.meta.url), "utf8"));
const settings = parseSettings(readFileSync(new URL("../../../damage-control-settings.json", import.meta.url), "utf8"));
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
export async function harness(dependencies: Partial<GateDependencies> = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "dc-gate-")); dirs.push(cwd);
  const handlers = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();
  const notify = vi.fn(); const abort = vi.fn(); const select = vi.fn(async () => "Allow once");
  const input = vi.fn(async () => "rewrite");
  const defaultReview: GateDependencies["review"] = async () => ({ status: "valid", verdict: "allow", reason: "synthetic", dismissedCandidates: [] });
  const review = vi.fn<GateDependencies["review"]>(dependencies.review ?? defaultReview);
  const getAllTools = vi.fn(() => ["read", "bash", "powershell", "write", "edit", "grep", "find", "ls"].map(name => ({ name, sourceInfo: { source: "builtin" } })));
  const entries: Array<{ id: string; type: "custom"; customType: string; data: unknown }> = [];
  const appendEntry = vi.fn((customType: string, data: unknown) => entries.push({ id: `entry-${entries.length}`, type: "custom", customType, data }));
  const api = { on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => handlers.set(name, [...handlers.get(name) ?? [], handler]), getAllTools, sendMessage: vi.fn(), appendEntry } as unknown as ExtensionAPI;
  // Gate fixtures use the supported RPC dialog boundary. Real TUI rendering
  // and key handling are exercised separately in prompt.test.ts.
  const ctx = { cwd, mode: "rpc", hasUI: true, signal: undefined, abort, sessionManager: { getBranch: () => entries, getSessionId: () => "fixture-session" }, ui: { notify, select, input } } as unknown as ExtensionContext;
  const gate = registerGate(api, join(cwd, "profile"), cwd, { policy, settings, analyze: (request, options) => analyzeShell(request, { ...options, now: () => 0 }), ...dependencies, review });
  api.on("tool_call", gate.handle);
  const emit = async (name: string, event: unknown = {}) => {
    let result: unknown;
    for (const handler of handlers.get(name) ?? []) result = await handler(event, ctx);
    return result;
  };
  return { ctx, api, gate, emit, cwd, notify, abort, select, input, review, getAllTools, entries, appendEntry };
}
