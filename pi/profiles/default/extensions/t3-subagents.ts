import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { selectedSubagentBackend } from "../lib/subagents/authority.ts";
import { createT3RoleRuntime, type T3BootstrapOptions, type T3RoleRuntime } from "../lib/subagents/t3/bootstrap.ts";
import { registerT3RoleTools } from "../lib/subagents/t3/launch.ts";
import { captureT3RoleGoal } from "../lib/subagents/t3/goal.ts";
import { prepareT3Closeout } from "../lib/subagents/t3/closeout.ts";
import { registerT3RoleGuidance } from "../lib/subagents/t3/guidance.ts";

/** Native children retain their backend even when they inherit T3 host markers. */
export function createT3Subagents(pi: ExtensionAPI, options?: T3BootstrapOptions): T3RoleRuntime | undefined {
  if (selectedSubagentBackend() !== "t3") return undefined;
  const runtime = createT3RoleRuntime(pi, options);
  registerT3RoleTools(pi, runtime, { ...options, prepareHandoff: prepareT3Closeout,
    captureGoal: (ctx, launchId, inherited) => captureT3RoleGoal(pi, ctx, launchId, inherited),
  });
  registerT3RoleGuidance(pi, runtime);
  return runtime;
}
export default createT3Subagents;
