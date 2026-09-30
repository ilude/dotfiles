import { resolve } from "node:path";
import { childLaunch } from "./launch.ts";
import type { LaunchSpec } from "./rpc.ts";
import type { ChildEndpoint } from "./transport.ts";
import { loadDefinitions } from "./definitions.ts";
import { validateCloseoutManifest } from "../plan-integration/closeout.ts";
import { samePlatformPath } from "../path-identity.ts";

/** Admission is Integrator-only, never an alternate lifetime for arbitrary roles. */
export function admitSuccessor(value: unknown, profile: string, endpoint: ChildEndpoint): LaunchSpec {
  if (!value || typeof value !== "object") throw new Error("Invalid successor admission");
  const input = value as { profile?: unknown; spec?: LaunchSpec };
  const spec = input.spec;
  const role = loadDefinitions(profile, false, profile).agents.get("integrator");
  if (typeof input.profile !== "string" || !samePlatformPath(resolve(input.profile), resolve(profile)) || !role || !spec
    || spec.definition?.name !== "integrator" || spec.parentId !== undefined || spec.surface !== "visible"
    || !spec.closeoutManifest || spec.closeoutManifest.noMerge || spec.closeoutParentSessionId !== endpoint.origin
    || spec.origin !== endpoint.origin || !samePlatformPath(spec.cwd, spec.closeoutManifest.targetCheckout)
    || !Array.isArray(spec.definition.tools) || JSON.stringify([...spec.definition.tools].sort()) !== JSON.stringify([...role.tools].sort())
    || !Array.isArray(spec.definition.delegates) || spec.definition.delegates.length
    || typeof spec.instructions !== "string" || !spec.instructions.trim() || typeof spec.model !== "string" || !spec.model.trim()
    || !["off", "minimal", "low", "medium", "high", "xhigh"].includes(spec.effort)
    || !Array.isArray(spec.skills) || spec.skills.length !== 1 || !samePlatformPath(resolve(spec.skills[0]!), resolve(profile, "skills/plan-integration/SKILL.md"))) {
    throw new Error("Invalid restricted Integrator successor admission");
  }
  validateCloseoutManifest(spec.closeoutManifest);
  // JSON capture prevents the admission sender or later host consumers mutating authority.
  const captured: LaunchSpec = JSON.parse(JSON.stringify(spec));
  captured.definition = { ...role, tools: [...role.tools], delegates: [], skills: [...role.skills] };
  captured.retained = true;
  return captured;
}

export function successorLaunch(spec: LaunchSpec, profile: string, endpoint: ChildEndpoint) {
  const config = childLaunch(spec, endpoint.child, profile, endpoint);
  const index = config.args.findIndex(arg => arg.endsWith("subagent-child.ts"));
  if (index < 0) throw new Error("Restricted child extension missing");
  config.args[index] = resolve(profile, "extensions/closeout-successor.ts");
  // Pi's CLI tool list is also the ceiling for extension tools. Only this
  // successor launch admits the exact originating-session handoff capability.
  const toolsIndex = config.args.indexOf("--tools");
  if (toolsIndex < 0) throw new Error("Restricted successor tool ceiling missing");
  config.args[toolsIndex + 1] = [...spec.definition.tools, "closeout_successor_handoff"].join(",");
  return { args: config.args, env: { ...config.env, PI_CLOSEOUT_SUCCESSOR: "1", PI_HERDR_CLOSEOUT_SUCCESSOR: "", PI_HERDR_SUBAGENT: "" } };
}
