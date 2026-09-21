import type { AgentDefinition } from "./definitions.ts";

export type DelegationAudience = "caller" | "coordinator" | "strategist" | "teamlead" | "council" | "leaf";

export interface DelegationContextOptions {
  audience: DelegationAudience;
  definitions: ReadonlyMap<string, AgentDefinition>;
  permitted?: readonly string[];
}

const STEWARD_GUIDANCE = `Consult \`subagent\` with \`agent: "steward"\` when a reviewer or validator agent reports findings about implemented work and you need to assess whether those findings warrant additional work. Provide the requested outcome, completed work, findings, and proposed follow-up. Steward advises whether further work is justified; it does not approve implementation.

Do not consult Steward before starting requested implementation, including user-authorized fixes from a code review. Do not send it implementation plans, task decomposition, or the orchestrator's own investigation. Handle corrections directly when the evidence proves the correction. Reuse its assessment for the same finding.`;

const CALLER_GUIDANCE = `## Delegation guidance

Consult \`subagent\` with \`agent: "strategist"\` for implementation-plan execution or user-authorized work suited to parallel subagents or Team Leads. Delegate a standalone job to a single subagent or Team Lead only when the user explicitly requests it or delegation conserves context; explain the context-conservation reason when applicable, and skip the Strategist consultation in either case. Otherwise work directly, including when Strategist recommends one worker without an exception. An explicit single-agent handoff also bypasses consultation when handing off plan work. When the user requests delegation while you continue another discussion, launch the requested agent in the background and continue the discussion.

${STEWARD_GUIDANCE}

Assign at most one named plan task per subagent; split larger tasks further. Run ready independent assignments concurrently with disjoint write ownership. Integrate prerequisites before dependent work. Ask only about interpretations changing behavior, scope, or acceptance.`;

function coordinatorGuidance(taskSizing = "Assign at most one named plan task per subagent; split larger tasks into independently verifiable outcomes."): string {
  return `## Delegation guidance

${taskSizing} A Team Lead may coordinate several assignments. Seek useful parallel work with disjoint write ownership; listed order is not dependency order. Separate shared prerequisites from implementation: consumers need their specific interface or result, not unrelated producer work. Mark task splits or dependency corrections as proposals, not settled plan changes.`;
}

const STRATEGIST_GUIDANCE = `${coordinatorGuidance("Assign at most one named plan task per subagent. Treat it as an upper boundary, not an assignment size. Split multiple independently provable outcomes into smaller assignments with specific finishes, preserving task requirements.")}

Recommend direct execution when delegation adds no value, one worker for a bounded outcome, or direct parallel workers for independent outcomes. Recommend a Team Lead only when ongoing dependency coordination or integration helps; name that responsibility.

Use catalog defaults unless evidence warrants an override. Luna low/medium/high fits well-defined work; Luna xhigh or Sol low fits unresolved choices or interacting interfaces. Astra low is for cross-system decisions, competing interpretations, or repeated failed assignments. Luna Strategist requires at least high effort. Steward uses Luna high/xhigh; Sol or Astra for Steward requires prior user approval. Astra above high is user-selected only.`;

const TEAMLEAD_GUIDANCE = `## Steward

${STEWARD_GUIDANCE}

Use Luna high or xhigh for Steward.

## Unsuccessful assignments

Inspect the subagent's evidence and prerequisites before retrying. Retry the same bounded assignment once with the next model family only when the subagent had the required inputs and functioning tools but could not solve it: Luna to Sol, or Sol to Astra. Carry the evidence into the retry and report the escalation to the parent. For crashes, timeouts, missing prerequisites, environment or tool failures, and unresolved user decisions, address the cause or ask the parent instead of changing models.`;

const COUNCIL_GUIDANCE = `## Council guidance

Run a council only when the user explicitly requested one. Use non-writing members for independent openings, focused rebuttal, and synthesis. Retain useful member contexts. Report strongest arguments, changed positions, disagreements, and evidence gaps without forcing agreement or implementation.`;

function catalogEntries(definitions: ReadonlyMap<string, AgentDefinition>, permitted?: readonly string[]): string {
  const allowed = permitted ? new Set(permitted) : undefined;
  return [...definitions.values()]
    .filter((definition) => !allowed || allowed.has(definition.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .map((definition) => `- ${definition.name}: ${definition.description} (model default: ${definition.model ?? "explicit model required"}; effort default: ${definition.effort ?? "low"})`)
    .join("\n");
}

export function delegationContext(options: DelegationContextOptions): string {
  if (options.audience === "leaf") return "";
  const entries = catalogEntries(options.definitions, options.permitted);
  const catalog = options.audience === "strategist"
    ? "## Recommendation options\nRecommend only among roles the caller may dispatch. Seeing this catalog grants you no dispatch authority."
    : options.audience === "teamlead"
      ? "## Permitted subagent roles\nOnly the listed roles may be commissioned."
      : "## Available agent roles\nCatalog visibility does not grant dispatch permission. Councils remain explicit-user-request only.";
  const guidance = options.audience === "strategist"
    ? STRATEGIST_GUIDANCE
    : options.audience === "teamlead"
      ? TEAMLEAD_GUIDANCE
      : options.audience === "coordinator"
        ? coordinatorGuidance()
        : options.audience === "council"
          ? COUNCIL_GUIDANCE
          : CALLER_GUIDANCE;
  return `${guidance}\n\n${catalog}\n${entries || "- none"}`;
}

export function composedAgentPrompt(
  definition: AgentDefinition,
  definitions: ReadonlyMap<string, AgentDefinition>,
  parentDelegates?: readonly string[],
): string {
  let context = "";
  if (definition.name === "strategist") {
    context = delegationContext({ audience: "strategist", definitions, permitted: parentDelegates });
  } else if (definition.name === "teamlead") {
    context = delegationContext({ audience: "teamlead", definitions, permitted: definition.delegates });
  } else if (definition.name === "council") {
    context = delegationContext({ audience: "council", definitions, permitted: definition.delegates });
  } else if (definition.delegates.length > 0) {
    context = delegationContext({ audience: "coordinator", definitions, permitted: definition.delegates });
  }
  return context ? `${definition.prompt}\n\n${context}` : definition.prompt;
}
