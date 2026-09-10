import type { AgentDefinition } from "./definitions.ts";

export type DelegationAudience = "caller" | "coordinator" | "strategist" | "leaf";

export interface DelegationContextOptions {
  audience: DelegationAudience;
  definitions: ReadonlyMap<string, AgentDefinition>;
  permitted?: readonly string[];
}

const SHARED_GUIDANCE = `## Delegation guidance

Delegate only for bounded implementation, parallel investigation, specialist research, or requested independent review. Otherwise work directly. Before delegating, normally consult \`subagent\` with \`agent: "strategist"\`. Reuse its advice for related assignments. Strategist advice is recommendation-only; the caller decides and proceeds without an approval gate.

Use small assignments split by responsibility. Normally give one plan T? section to an implementation worker and bound review and validation separately. Inspect and incorporate a prerequisite worker's result before launching fresh dependent work. Independent reads and disjoint writes may run in parallel.

Base selection on observable facts: the named outcome and checks, available or missing inputs, prerequisite results, interfaces that must agree, unresolved design choices, competing explanations, and observed failure cases. State the evidence for model and effort choices briefly and label remaining judgment. Do not infer difficulty from file count or use scoring, routing tables, mandatory report formats, or effort ladders.

Luna low, medium, or high fits most well-defined work with understood solutions; Luna xhigh or Sol low can address a named unresolved design choice or interacting interfaces. Sol medium or high can address decisions spanning several named implementation layers or multiple evidenced failure cases. Astra low, medium, or high is available when justified; Astra above high is user-selected only. Match effort to remaining reasoning. Ask the user when differing interpretations change requested behavior, scope, or agreed acceptance.

After an unsuccessful worker result, inspect the result and prerequisites first. One automatic stronger-family retry of the same bounded assignment is allowed only when the worker attempted it with required inputs and working tools but could not solve it: Luna to Sol, or Sol to Astra. Carry partial work, evidence, and the actual failure forward, choose effort proportionately, and do not chain automatic retries. A crash, timeout, missing prerequisite, environment or tool failure, or unresolved user decision alone is not evidence for a stronger model. A Team Lead that uses the retry must tell its parent.`;

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
  const heading = options.audience === "strategist"
    ? "## Recommendation options\nRecommend only among roles the caller may dispatch. Seeing this catalog grants you no dispatch authority."
    : "## Available agent roles\nCatalog visibility does not grant dispatch permission. Councils remain explicit-user-request only.";
  return `${SHARED_GUIDANCE}\n\n${heading}\n${entries || "- none"}`;
}

export function composedAgentPrompt(
  definition: AgentDefinition,
  definitions: ReadonlyMap<string, AgentDefinition>,
  parentDelegates?: readonly string[],
): string {
  let context = "";
  if (definition.name === "strategist") {
    context = delegationContext({ audience: "strategist", definitions, permitted: parentDelegates });
  } else if (definition.delegates.length > 0) {
    context = delegationContext({ audience: "coordinator", definitions, permitted: definition.delegates });
  }
  return context ? `${definition.prompt}\n\n${context}` : definition.prompt;
}
