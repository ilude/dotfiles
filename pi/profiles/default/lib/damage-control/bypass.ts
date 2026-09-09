import { contains, type PathFacts } from "./paths.ts";
import type { Analysis, Decision, Effect, ToolRequest } from "./types.ts";

export type BypassEligibility = { eligible: true; reason: string } | { eligible: false; reason: string };

const remoteGitRules = /^(?:git-push|git-rewrite-history)/;
const environmentRules = new Set([
  "environment-file-access-may-expose-secrets",
  "environment-file-read-write-may-expose-or-modify-secrets",
]);

function targetsAreLocal(effect: Effect, facts: PathFacts): boolean {
  const operands = [...effect.targets, ...effect.sources, ...effect.destinations];
  return operands.length > 0 && operands.every(target => target.resolution === "static"
    && contains(effect.context.cwd, target.path, facts)
    && target.path !== effect.context.cwd);
}

/**
 * Determines whether /dc off may suppress a contextual approval. This consumes
 * parser and path-analysis output. It does not infer safety from command text.
 */
export function bypassEligibility(request: ToolRequest, analysis: Analysis, decision: Decision, facts: PathFacts): BypassEligibility {
  if (request.tool !== "bash" && request.tool !== "powershell") return { eligible: false, reason: "Only parsed shell operations are bypassable" };
  if (decision.outcome !== "user" || decision.origin !== "review" || decision.reviewDisposition !== "ask") return { eligible: false, reason: "Only a valid contextual ask is bypassable" };
  if (analysis.health.status !== "ready" || analysis.uncertainties.length > 0) return { eligible: false, reason: "Analysis is incomplete" };
  if (analysis.matches.some(match => match.applicability === "confirmed" && (match.action === "block" || match.action === "user"))) return { eligible: false, reason: "A confirmed policy boundary applies" };
  if (analysis.matches.some(match => remoteGitRules.test(match.ruleId))) return { eligible: false, reason: "Remote Git operations are not bypassable" };
  if (!analysis.effects.length) return { eligible: false, reason: "No parsed operation establishes eligibility" };

  const environmentOperation = analysis.matches.some(match => environmentRules.has(match.ruleId));
  let family: "rm" | "git" | "docker" | "environment" | undefined;
  for (const effect of analysis.effects) {
    if (effect.resolution !== "static" || [...effect.targets, ...effect.sources, ...effect.destinations].some(target => target.resolution !== "static")) return { eligible: false, reason: "An operation target is unresolved" };
    if (effect.kind === "network" || effect.kind === "database" || effect.kind === "execution") return { eligible: false, reason: "The invocation contains a non-local effect" };
    if (effect.kind === "docker") {
      if (effect.context.mountedData || !effect.context.daemon) return { eligible: false, reason: "Docker volume or daemon facts are not eligible" };
      if (family && family !== "docker") return { eligible: false, reason: "The invocation mixes operation families" };
      family = "docker";
      continue;
    }
    if (effect.kind === "git") {
      const invocation = analysis.internal?.git?.find(item => item.effectId === effect.id);
      if (!invocation || invocation.remote || invocation.endpointOverride) return { eligible: false, reason: "Git locality is not established" };
      if (family && family !== "git") return { eligible: false, reason: "The invocation mixes operation families" };
      family = "git";
      continue;
    }
    if (effect.kind === "filesystem") {
      if (!targetsAreLocal(effect, facts)) return { eligible: false, reason: "A filesystem target is not contained by the working directory" };
      const executable = effect.context.executable?.toLowerCase();
      const next = environmentOperation ? "environment" : (["rm", "remove-item", "rmdir", "del", "erase"].includes(executable ?? "") ? "rm" : family === "git" ? "git" : undefined);
      if (!next || (family && family !== next)) return { eligible: false, reason: "The filesystem operation is outside an eligible family" };
      family = next;
    }
  }
  return family ? { eligible: true, reason: `Eligible local ${family} contextual approval` } : { eligible: false, reason: "No eligible operation family was parsed" };
}
