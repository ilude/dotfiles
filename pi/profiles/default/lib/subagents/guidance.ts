import type { AgentDefinition } from "./definitions.ts";

export type DelegationAudience = "caller" | "coordinator" | "strategist" | "teamlead" | "council" | "leaf";

export interface DelegationContextOptions {
  audience: DelegationAudience;
  definitions: ReadonlyMap<string, AgentDefinition>;
  permitted?: readonly string[];
}

const CALLER_GUIDANCE = `## Delegation guidance

Delegate only for bounded implementation, parallel investigation, specialist research, or requested independent review. Otherwise work directly. Before delegating, normally consult \`subagent\` with \`agent: "strategist"\`. Reuse its advice for related assignments. Strategist advice is recommendation-only; the caller decides and proceeds without an approval gate.

Normally consult \`subagent\` with \`agent: "steward"\` after receiving review or validation findings, before assigning or implementing follow-up fixes. Handle obvious bounded corrections directly. Supply the request, agreed checks, findings, and proposed fixes together. Reuse its advice for the same findings; consult again for new findings or a changed proposed fix, not merely because another check ran. If there are no findings, continue the existing task or closeout. Steward advises; the caller decides and proceeds.

Use small assignments split by responsibility. Normally give one plan T? section to an implementation worker and bound review and validation separately. Inspect and incorporate a prerequisite worker's result before launching fresh dependent work. Independent reads and disjoint writes may run in parallel.

Base selection on observable facts: the named outcome and checks, available or missing inputs, prerequisite results, interfaces that must agree, unresolved design choices, competing explanations, and observed failure cases. State the evidence for model and effort choices briefly and label remaining judgment. Do not infer difficulty from file count or use scoring, routing tables, mandatory report formats, or effort ladders.

Luna low, medium, or high fits most well-defined work with understood solutions; Luna xhigh or Sol low can address a named unresolved design choice or interacting interfaces. Use Sol low for Strategist; use Astra low when its decision spans several systems, has competing interpretations, or follows repeated failed assignments. Strategist cannot use Luna below high effort. Steward uses Luna high or xhigh. Before selecting Sol or Astra for Steward, present a concrete justification and obtain user approval; do not automatically retry Steward with a larger model. Without approval, use Luna high/xhigh or ask the user to resolve the underlying scope ambiguity. Reviewer severity, security terminology, finding count, or an inconclusive Luna result alone do not justify a larger model. Sol medium or high can address decisions spanning several named implementation layers or multiple evidenced failure cases. Astra low, medium, or high is available when justified; Astra above high is user-selected only. Match effort to remaining reasoning. Ask the user when differing interpretations change requested behavior, scope, or agreed acceptance.

After an unsuccessful worker result, inspect the result and prerequisites first. One automatic stronger-family retry of the same bounded assignment is allowed, except for Steward, only when the worker attempted it with required inputs and working tools but could not solve it: Luna to Sol, or Sol to Astra. Carry partial work, evidence, and the actual failure forward, choose effort proportionately, and do not chain automatic retries. A crash, timeout, missing prerequisite, environment or tool failure, or unresolved user decision alone is not evidence for a stronger model. A Team Lead that uses the retry must tell its parent.`;

const COMMON_COORDINATOR_GUIDANCE = `## Delegation guidance

Use small assignments split by responsibility. Inspect and incorporate prerequisite results before launching dependent work. Independent reads and disjoint writes may run in parallel. Base worker selection on the named outcome and checks, available inputs, interfaces, unresolved choices, and observed failures.`;

const STRATEGIST_GUIDANCE = `${COMMON_COORDINATOR_GUIDANCE}

Recommend direct execution when delegation would not help. State the evidence for role, model, and effort choices, and label remaining judgment. Luna low, medium, or high fits well-defined work; Luna xhigh or Sol low fits a named unresolved choice or interacting interfaces. Use Sol low for Strategist. Use Astra low only for decisions spanning several systems, competing interpretations, or repeated failed assignments. Strategist cannot use Luna below high effort. Ask the caller when differing interpretations change behavior, scope, or acceptance.`;

const TEAMLEAD_GUIDANCE = `${COMMON_COORDINATOR_GUIDANCE}

Coordinate permitted leaves and integrate their evidence. Normally consult Steward after review or validation findings before non-obvious follow-up fixes; Steward uses Luna high or xhigh, and Sol or Astra for Steward requires prior user approval. After an unsuccessful worker result, inspect the result and prerequisites first. One stronger-family retry of the same bounded assignment is allowed when the worker had required inputs and working tools but could not solve it: Luna to Sol, or Sol to Astra. Carry the evidence forward, do not chain retries, and tell the parent when you use one. Crashes, timeouts, missing prerequisites, environment or tool failures, and unresolved user decisions do not justify a stronger model.`;

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
