import { resolve } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CloseoutManifest, CloseoutResult } from "../plan-integration/contracts.ts";
import { requestParent, waitForParentEvents, type ChildEndpoint, type ParentCommand } from "./transport.ts";
import { SUCCESSOR_HANDOFF_TOOL } from "./successor-host.ts";
import { registerProfileCommand } from "../profile-command.ts";
import { writeSubagentLineage } from "./lineage.ts";
import { samePlatformPath } from "../path-identity.ts";

interface SuccessorAuthority {
  id: string; agent: "integrator"; tools: string[]; delegates: []; cwd: string;
  closeout: { manifest: CloseoutManifest; provenance: { source: "subagent-runtime"; version: 1; childId: string; agent: "integrator"; parentSessionId: string; targetCheckout: string } };
}
export function successorSystemPrompt(base: string, tools: readonly string[], prompt: string, manifest: CloseoutManifest): string {
  return `${base}\n\nYou are the restricted Integrator closeout successor. Your frozen tools are [${[...new Set([...tools, SUCCESSOR_HANDOFF_TOOL])].sort().join(", ")}]. Do not delegate, push, deploy, delete the task branch, or expand the manifest scope. Accept direct operator input and ask consequential questions here. Use closeout_successor_handoff for staged integration, originating-session handoff, and cleanup. Remain available after reporting; normal settlement does not close your pane.\n${prompt}\nAuthenticated closeout manifest:\n${JSON.stringify(manifest)}`;
}
function closeoutResult(value: unknown): CloseoutResult {
  if (!value || typeof value !== "object") throw new Error("Canonical closeout result missing");
  const r = value as CloseoutResult;
  if (!["INTEGRATION READY", "COMPLETED", "MERGE BLOCKED", "USER INPUT REQUIRED", "CLEANUP PENDING"].includes(r.outcome)
    || typeof r.targetCommit !== "string" || typeof r.taskCommit !== "string"
    || !["not-needed", "created", "restored", "retained", "ambiguous", "missing"].includes(r.stashState)
    || !["not-started", "already-merged", "merged", "conflict", "failed"].includes(r.merge)
    || !["not-started", "already-committed", "committed", "failed"].includes(r.metadata)
    || !["registered", "deregistered", "remnant-removed", "missing"].includes(r.worktree)
    || typeof r.archivedPlanVerified !== "boolean" || typeof r.activeSpecAbsent !== "boolean"
    || !Array.isArray(r.retainedArtifacts) || !r.retainedArtifacts.every(item => typeof item === "string")
    || !Array.isArray(r.evidence) || !r.evidence.every(item => typeof item === "string")) throw new Error("Invalid canonical closeout result");
  return r;
}

/** Authenticates against the surviving launch host, never the originating parent. */
export function bindSuccessorSurface(pi: ExtensionAPI): void {
  if (process.env.PI_CLOSEOUT_SUCCESSOR !== "1") throw new Error("Restricted successor mode required");
  const rawAuthority = process.env.PI_SUBAGENT_AUTHORITY;
  const endpoint: ChildEndpoint = JSON.parse(process.env.PI_SUBAGENT_ENDPOINT ?? "null");
  const authority: SuccessorAuthority = JSON.parse(rawAuthority ?? "null");
  const provenance = authority?.closeout?.provenance;
  if (!authority || authority.agent !== "integrator" || !Array.isArray(authority.tools) || !authority.tools.every(tool => typeof tool === "string")
    || !Array.isArray(authority.delegates) || authority.delegates.length || "parentId" in authority
    || !endpoint || endpoint.child !== authority.id || endpoint.origin !== provenance?.parentSessionId
    || provenance.source !== "subagent-runtime" || provenance.version !== 1 || provenance.agent !== "integrator" || provenance.childId !== authority.id
    || authority.closeout.manifest.noMerge || !samePlatformPath(authority.cwd, authority.closeout.manifest.targetCheckout)
    || !samePlatformPath(provenance.targetCheckout, authority.cwd)) throw new Error("Invalid restricted successor authority");
  const allowed = new Set([...authority.tools, SUCCESSOR_HANDOFF_TOOL]);
  let ctx: ExtensionContext | undefined, unbind: (() => void) | undefined, prompt = "", last = "", error: string | undefined;
  let cleanupError: string | undefined;
  let released = false, retirementObserved = false;
  const releaseWaiters = new Set<() => void>();
  const seen = new Set<string>();
  const manifest = authority.closeout.manifest;
  registerProfileCommand(pi, "exit", { description: "Exit the Integrator successor", handler: async (_args, context) => context.shutdown() });
  pi.on("tool_call", event => {
    if (!allowed.has(event.toolName)) return { block: true, reason: `Tool ${event.toolName} is outside frozen Integrator authority` };
    if (event.toolName === "bash" && typeof event.input.command === "string") {
      const command = event.input.command;
      if (/plan-integration\.mjs["']?\s+closeout\s*$/.test(command)) return { block: true, reason: "Successor closeout must use the staged handoff" };
      if (/plan-integration\.mjs["']?\s+cleanup\s*$/.test(command) && !retirementObserved) return { block: true, reason: "Origin retirement must be observed before cleanup" };
    }
  });
  pi.on("before_agent_start", event => ({ systemPrompt: successorSystemPrompt(event.systemPrompt, authority.tools, prompt, manifest) }));
  pi.on("session_start", async (_event, context) => {
    ctx = context; unbind?.();
    const bootstrap = await requestParent(endpoint, { type: "bootstrap" }) as { authority?: unknown; prompt?: unknown; parentSessionId?: unknown };
    if (bootstrap.authority !== rawAuthority || bootstrap.parentSessionId !== endpoint.origin || typeof bootstrap.prompt !== "string") throw new Error("Successor host authority mismatch");
    prompt = bootstrap.prompt;
    pi.setActiveTools(pi.getAllTools().map(tool => tool.name).filter(tool => allowed.has(tool)));
    const sessionId = context.sessionManager.getSessionId(), sessionFile = context.sessionManager.getSessionFile();
    await requestParent(endpoint, { type: "session-identity", payload: { sessionId, sessionFile } });
    writeSubagentLineage(pi, context, "integrator", endpoint.origin, endpoint.origin);
    await requestParent(endpoint, { type: "app-ready", payload: { tools: pi.getActiveTools() } });
    const controller = new AbortController(); unbind = () => controller.abort();
    void (async () => {
      try {
        while (!controller.signal.aborted) {
          const batch = await waitForParentEvents(endpoint, "visible-app", controller.signal);
          if (batch.consumer !== "visible-app") throw new Error("Invalid successor events");
          for (const command of batch.commands as (ParentCommand & { cleanupError?: string })[]) {
            if (!seen.has(command.id)) {
              if (command.type === "message" && command.message) pi.sendUserMessage(command.message, { deliverAs: context.isIdle() ? "followUp" : "steer" });
              else if (command.type === "final-handoff" || command.type === "cleanup-pending") {
                cleanupError = command.type === "cleanup-pending" ? command.cleanupError ?? "Origin retirement was not verified" : undefined;
                retirementObserved = command.type === "final-handoff"; released = true;
                if (retirementObserved) process.env.PI_CLOSEOUT_SUCCESSOR_RELEASED = "1";
                for (const wake of releaseWaiters) wake();
              } else throw new Error("Invalid successor command");
              seen.add(command.id);
            }
            await requestParent(endpoint, { type: "app-ack", payload: command.id });
          }
        }
      } catch (failure) { if (!controller.signal.aborted) context.ui.notify(`Successor host unavailable: ${failure instanceof Error ? failure.message : String(failure)}`, "error"); }
    })();
  });
  pi.on("message_end", event => {
    if (event.message.role !== "assistant") return;
    last = event.message.content.filter(part => part.type === "text").map(part => part.text).join("\n");
    error = event.message.stopReason === "error" || event.message.stopReason === "aborted" ? event.message.errorMessage : undefined;
  });
  pi.on("agent_settled", async () => { await requestParent(endpoint, { type: "turn", payload: { text: last, error } }); });
  pi.on("turn_start", async () => { await requestParent(endpoint, { type: "app-activity", payload: { phase: "model" } }); });
  pi.on("tool_execution_start", async () => { await requestParent(endpoint, { type: "app-activity", payload: { phase: "tool" } }); });
  pi.on("session_shutdown", () => { unbind?.(); unbind = undefined; ctx = undefined; });
  pi.registerTool({
    name: SUCCESSOR_HANDOFF_TOOL, label: "Complete local closeout handoff",
    description: "Run canonical local integration and metadata, notify the exact origin, wait for its final handoff, observe its retirement, then clean up the manifest worktree. On a blocker preserve both panes and checkout. Keep this pane open and report the typed outcome here. No push, deployment, delegation, or model-selected shutdown target.",
    parameters: Type.Object({}),
    async execute(_id, _params, signal, _update, context) {
      const canonical = async (operation: "integrate" | "cleanup") => {
        const helper = resolve(process.env.PI_CODING_AGENT_DIR!, "scripts/plan-integration.mjs");
        const output = await context.executeTool("bash", { command: `node "${helper}" ${operation}` }, { signal });
        const text = output.result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
        if (output.isError) throw new Error(text);
        return closeoutResult(JSON.parse(text));
      };
      const integrated = await canonical("integrate");
      let result = integrated;
      if (integrated.outcome === "INTEGRATION READY") {
        await requestParent(endpoint, { type: "integration-ready", payload: integrated });
        ctx?.ui.setStatus("closeout-successor", "Integration ready; awaiting originating orchestrator handoff");
        if (!released) await new Promise<void>((resolveWait, reject) => {
          const finish = () => { releaseWaiters.delete(finish); signal?.removeEventListener("abort", abort); resolveWait(); };
          const abort = () => { releaseWaiters.delete(finish); reject(new Error("Handoff wait interrupted; panes and worktree retained")); };
          releaseWaiters.add(finish); signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) abort(); else if (released) finish();
        });
        try {
          if (!retirementObserved) throw new Error(cleanupError ?? "Origin retirement was not verified");
          result = await canonical("cleanup");
        } catch (failure) {
          result = { ...integrated, outcome: "CLEANUP PENDING", reason: failure instanceof Error ? failure.message : String(failure), action: `Integrator retains ${manifest.taskWorktree}; verify origin retirement, then retry cleanup`, retainedArtifacts: [...new Set([...integrated.retainedArtifacts, manifest.taskWorktree])] };
        }
      }
      ctx?.ui.setStatus("closeout-successor", result.outcome);
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
}
