import type { AgentDefinition } from "./definitions.ts";

export type DelegationAudience = "caller" | "coordinator" | "strategist" | "teamlead" | "council" | "leaf";

export interface DelegationContextOptions {
  audience: DelegationAudience;
  definitions: ReadonlyMap<string, AgentDefinition>;
  permitted?: readonly string[];
}

const CALLER_GUIDANCE = `## Delegation guidance

Delegate only for bounded implementation, parallel investigation, specialist research, or requested independent review; otherwise work directly. Before delegating, consult \`subagent\` with \`agent: "strategist"\` and reuse its advice for related assignments.

After review findings or an unexpected agreed check or deployment outcome, consult \`subagent\` with \`agent: "steward"\` before a follow-up fix or another MR, build, or deploy cycle. Handle directly only corrections proved by the evidence. Reuse advice for the same finding; consult again when the finding or proposed fix changes. Agent advice is not an approval gate.

Assign at most one named plan task per worker; split larger tasks further. Run ready independent assignments concurrently with disjoint write ownership. Integrate prerequisites before dependent work. Ask only about interpretations changing behavior, scope, or acceptance.`;

const COMMON_COORDINATOR_GUIDANCE = `## Delegation guidance

Assign at most one named plan task per worker; split larger tasks by independently verifiable responsibility. Actively find useful parallel work rather than treating listed task order as dependencies. Separate shared prerequisites from independent implementation and define disjoint write ownership. Incorporate the specific interface or result a consumer needs before launching it; unrelated producer work need not block it. Recommend task splits or dependency corrections where the plan unnecessarily serializes work, clearly distinguishing proposals from the current plan. Base worker selection on the named outcome and checks, available inputs, interfaces, unresolved choices, and observed failures.`;

const STRATEGIST_GUIDANCE = `${COMMON_COORDINATOR_GUIDANCE}

Recommend direct execution when delegation would not help. State the evidence for role, model, and effort choices, and label remaining judgment. Luna low, medium, or high fits well-defined work; Luna xhigh or Sol low fits a named unresolved choice or interacting interfaces. Use Sol low for Strategist. Use Astra low only for decisions spanning several systems, competing interpretations, or repeated failed assignments. Strategist cannot use Luna below high effort. Steward uses Luna high or xhigh; Sol or Astra for Steward requires prior user approval. Astra above high is user-selected only. Ask the caller when differing interpretations change behavior, scope, or acceptance.`;

const TEAMLEAD_GUIDANCE = `${COMMON_COORDINATOR_GUIDANCE}

Coordinate permitted leaves and integrate their evidence. After review findings or an unexpected agreed check or deployment outcome, consult Steward before a follow-up fix or another MR, build, or deploy cycle. Handle directly only corrections proved by the evidence. Reuse advice for the same finding; consult again when the finding or proposed fix changes. Steward uses Luna high or xhigh; Sol or Astra for Steward requires prior user approval. After an unsuccessful worker result, inspect the result and prerequisites first. One stronger-family retry of the same bounded assignment is allowed when the worker had required inputs and working tools but could not solve it: Luna to Sol, or Sol to Astra. Carry the evidence forward, do not chain retries, and tell the parent when you use one. Crashes, timeouts, missing prerequisites, environment or tool failures, and unresolved user decisions do not justify a stronger model.`;

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
    : "## Available agent roles\nCatalog visibility does not grant dispatch permission. Councils remain explicit-user-request only.";
  const guidance = options.audience === "strategist"
    ? STRATEGIST_GUIDANCE
    : options.audience === "teamlead" || options.audience === "coordinator"
      ? TEAMLEAD_GUIDANCE
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
