import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SUBAGENT_AUTHORITY_CHANGED, SUBAGENT_AUTHORITY_EVENT, subagentAuthority, type SubagentAuthority } from "../authority.ts";
import { samePlatformPath } from "../../path-identity.ts";
import { createT3MetadataClient, type T3MetadataReader } from "./context.ts";
import { createHandoffStore, parseT3RoleBinding, type HandoffStore } from "./handoffs.ts";
import { T3_ROLE_SNAPSHOT_ENTRY, type T3RoleThreadBinding } from "./contracts.ts";
import { bindT3CloseoutAuthority, clearT3CloseoutAuthority } from "./closeout.ts";

export interface T3RoleRuntime {
  binding(): T3RoleThreadBinding | undefined;
  authority(): SubagentAuthority | undefined;
  withOperation<T>(parentToolCallId: string, canonicalMcpOperation: string, expectedArgs: Record<string, unknown>, execute: () => Promise<T>): Promise<T>;
}
export interface T3BootstrapOptions {
  profile?: string;
  store?: HandoffStore;
  metadata?: T3MetadataReader;
  bridgePath?: string;
}
const WRAPPERS = new Set(["t3_delegate_role", "t3_role_control", "t3_role_parent"]);

/** Hooks and state belong to this Pi runtime, never an environment-forged native child. */
export function createT3RoleRuntime(pi: ExtensionAPI, options: T3BootstrapOptions = {}): T3RoleRuntime {
  const profile = options.profile ?? getAgentDir();
  const store = options.store ?? createHandoffStore(profile);
  const metadata = () => options.metadata ?? createT3MetadataClient();
  const bridge = options.bridgePath ?? process.env.T3_PI_MCP_EXTENSION_PATH;
  let binding: T3RoleThreadBinding | undefined;
  let authority: SubagentAuthority | undefined;
  let failure: string | undefined;
  let sessionId: string | undefined;
  const calls = new Map<string, string>();
  const grants = new Map<string, { operation: string; args: Record<string, unknown>; consumed: boolean }>();
  let baseline: string[] | undefined;
  const publish = () => pi.events.emit(SUBAGENT_AUTHORITY_CHANGED, authority);
  const lock = () => { void clearT3CloseoutAuthority(); failure = "T3 role bootstrap or restoration failed; no assignment dispatched"; binding = undefined; authority = undefined; calls.clear(); grants.clear(); pi.setActiveTools([]); publish(); };
  const bind = async (value: T3RoleThreadBinding) => {
    const closeout = await bindT3CloseoutAuthority(value);
    binding = value;
    const normalized = subagentAuthority({ launchId: value.launchId, snapshot: value.snapshot, goalRunId: value.goal?.runId });
    authority = normalized && Object.freeze({ ...normalized, cwd: value.cwd, parentId: value.commissioner.parentLaunchId, closeout });
    failure = undefined;
    publish();
  };
  const snapshotEntry = (ctx: ExtensionContext) => [...ctx.sessionManager.getBranch()].reverse().find(entry => entry.type === "custom" && entry.customType === T3_ROLE_SNAPSHOT_ENTRY);
  async function restore(ctx: ExtensionContext): Promise<void> {
    subscribe();
    baseline ??= pi.getActiveTools();
    await clearT3CloseoutAuthority();
    binding = undefined; authority = undefined; calls.clear(); grants.clear();
    sessionId = ctx.sessionManager.getSessionId();
    try {
      const identity = await metadata().currentThread(ctx.cwd);
      const durable = await store.binding(identity.threadId);
      const entry = snapshotEntry(ctx);
      if (durable) {
        if (!samePlatformPath(durable.profile, profile) || !samePlatformPath(durable.cwd, ctx.cwd) || !samePlatformPath(identity.cwd, ctx.cwd) || durable.parentThreadId !== identity.parentThreadId) throw new Error("Role identity mismatch");
        // Both persistence boundaries must use the same domain projection: JSON
        // omits optional undefined fields retained by in-memory session entries.
        if (entry?.type === "custom" && !isDeepStrictEqual(parseT3RoleBinding(entry.data), durable)) throw new Error("Role branch mismatch");
        await bind(durable);
        if (!entry) pi.appendEntry(T3_ROLE_SNAPSHOT_ENTRY, durable);
      } else if (entry) throw new Error("Copied role history is not authority");
      else { failure = undefined; pi.setActiveTools(baseline); publish(); }
    } catch { lock(); }
  }
  let unsubscribe: (() => void) | undefined;
  function subscribe(): void {
    unsubscribe ??= pi.events.on(SUBAGENT_AUTHORITY_EVENT, (value: unknown) => {
      if (value && typeof value === "object" && "respond" in value && typeof value.respond === "function") value.respond(authority);
    });
  }
  subscribe();
  pi.on("session_start", async (_event, ctx) => { await restore(ctx); });
  pi.on("session_tree", async (_event, ctx) => { await restore(ctx); });
  pi.on("session_shutdown", async () => { await clearT3CloseoutAuthority(); binding = undefined; authority = undefined; sessionId = undefined; calls.clear(); grants.clear(); publish(); unsubscribe?.(); unsubscribe = undefined; });
  pi.registerCommand("t3-role-bootstrap", {
    description: "Bind a stored Pi role assignment to its authenticated T3 child",
    async handler(args, ctx) {
      try {
        const launchId = args.trim().split(/\s+/)[0];
        if (!launchId || !ctx.isIdle()) throw new Error("Invalid bootstrap invocation");
        const identity = await metadata().currentThread(ctx.cwd);
        if (!identity.parentThreadId) throw new Error("Bootstrap requires a child thread");
        const handoff = await store.read(launchId);
        const claimed = await store.claim(launchId, { identity, profile, cwd: ctx.cwd, actualParentThreadId: identity.parentThreadId });
        // Persist before dispatch. The opaque reference alone conveys no authority.
        if (handoff.closeout && handoff.workspace.isolation !== "shared") throw new Error("T3 Integrator requires shared isolation");
        await bind(claimed);
        sessionId = ctx.sessionManager.getSessionId();
        pi.appendEntry(T3_ROLE_SNAPSHOT_ENTRY, claimed);
        // Resolve resources and settings before enqueueing the assignment, not after a failed hook.
        await resources(ctx);
        await settings(ctx);
        pi.sendUserMessage(handoff.assignment);
      } catch { lock(); ctx.ui.notify(failure!, "error"); }
    },
  });
  async function settings(ctx: ExtensionContext) {
    if (!binding) return;
    const snapshot = binding.snapshot;
    const model = ctx.modelRegistry.find(snapshot.model.provider, snapshot.model.id);
    if (!model || !await pi.setModel(model)) throw new Error("Selected role model unavailable");
    pi.setThinkingLevel(snapshot.effort);
    if (pi.getThinkingLevel() !== snapshot.effort) throw new Error("Selected role effort unsupported");
  }
  async function resources(ctx: ExtensionContext): Promise<Array<{ name: string; filePath: string; content: string }>> {
    if (!binding) return [];
    return Promise.all(binding.snapshot.skills.map(async skill => {
      if (skill.source === "project" && !ctx.isProjectTrusted()) throw new Error("Selected project skill is not trusted in child checkout");
      const filePath = skill.source === "profile" ? skill.filePath : resolve(binding!.cwd, relative(binding!.snapshot.cwd, skill.filePath));
      return { name: skill.name, filePath, content: await readFile(filePath, "utf8") };
    }));
  }
  pi.on("input", async (event, ctx) => {
    if (/^\/t3-role-bootstrap(?:\s|$)/.test(event.text)) { lock(); ctx.ui.notify(failure!, "error"); return { action: "handled" }; }
    if (sessionId !== ctx.sessionManager.getSessionId()) await restore(ctx);
    if (failure) { ctx.ui.notify(failure, "error"); return { action: "handled" }; }
  });
  pi.on("before_agent_start", async (event, ctx) => {
    if (sessionId !== ctx.sessionManager.getSessionId()) await restore(ctx);
    if (failure) { pi.setActiveTools([]); event.systemPromptOptions.selectedTools = []; ctx.abort(); return; }
    if (!binding || !authority) return;
    try {
      const selected = await resources(ctx);
      await settings(ctx);
      const allowed = new Set(authority.tools);
      const tools = pi.getAllTools().filter(tool => allowed.has(tool.name) && tool.exposure !== "hidden" && tool.exposure !== "deferred" && tool.exposure !== "codemode").map(tool => tool.name);
      pi.setActiveTools(tools);
      const prompt = event.systemPromptOptions;
      prompt.selectedTools = tools;
      // The role replaces extension-owned caller guidance, not project context/trust.
      prompt.sections = { "subagent-role": `You are subagent ${authority.agent}. Your authority is frozen to tools [${[...authority.tools].sort().join(", ")}]. You may not activate or request other tools. A normal final reply completes your assignment.\n\n${binding.snapshot.prompt}` };
      // Discovery is not assignment context: only the selected skill bodies below belong here.
      prompt.skills = [];
      if (authority.closeout) prompt.sections["integrator-closeout"] = JSON.stringify(authority.closeout);
      if (selected.length) prompt.sections["selected-role-skills"] = selected.map(skill => `Selected skill ${skill.name} (${skill.filePath}):\n${skill.content}`).join("\n\n");
    } catch { lock(); event.systemPromptOptions.selectedTools = []; ctx.abort(); }
  });
  // A failed before_agent_start handler is not a gate in Pi. Enforce again at the turn boundary.
  pi.on("turn_start", (_event, ctx) => { if (failure) ctx.abort(); });
  function operation(toolName: string): string | undefined {
    const tool = pi.getAllTools().find(candidate => candidate.name === toolName);
    if (!tool || !bridge || !samePlatformPath(tool.sourceInfo.path, bridge)) return undefined;
    return toolName.includes("__") ? toolName.slice(toolName.lastIndexOf("__") + 2) : toolName;
  }
  pi.on("tool_call", (event, ctx) => {
    if (failure || sessionId !== ctx.sessionManager.getSessionId()) return { block: true, reason: failure ?? "T3 role session authority unavailable" };
    if (event.parentToolCallId) {
      const grant = grants.get(event.parentToolCallId);
      if (grant && !grant.consumed && calls.has(event.parentToolCallId) && operation(event.toolName) === grant.operation && isDeepStrictEqual(event.input, grant.args)) { grant.consumed = true; return; }
      if (operation(event.toolName) && (authority || calls.has(event.parentToolCallId))) return { block: true, reason: "Raw T3 operation requires an exact wrapper-scoped grant" };
    }
    if (authority && (!authority.tools.includes(event.toolName) || operation(event.toolName))) return { block: true, reason: `Tool ${event.toolName} is outside frozen ${authority.agent} authority` };
    if (WRAPPERS.has(event.toolName) && !event.parentToolCallId) calls.set(event.toolCallId, event.toolName);
  });
  pi.on("tool_result", () => {
    // Native discovery can activate tools, but cannot widen the role's declarations.
    if (authority) pi.setActiveTools(pi.getActiveTools().filter(name => authority!.tools.includes(name) && !operation(name)));
  });
  pi.on("tool_execution_end", event => { calls.delete(event.toolCallId); grants.delete(event.toolCallId); });
  return {
    binding: () => binding,
    authority: () => authority,
    async withOperation(parentToolCallId, canonicalMcpOperation, expectedArgs, execute) {
      if (failure || !calls.has(parentToolCallId) || grants.has(parentToolCallId) || !/^[a-z][a-z0-9_]*$/.test(canonicalMcpOperation)) throw new Error("Invalid T3 composed operation scope");
      const grant = { operation: canonicalMcpOperation, args: structuredClone(expectedArgs), consumed: false };
      grants.set(parentToolCallId, grant);
      try { return await execute(); }
      finally { if (grants.get(parentToolCallId) === grant) grants.delete(parentToolCallId); }
    },
  };
}
