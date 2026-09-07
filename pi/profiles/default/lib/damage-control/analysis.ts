import { readFile } from "node:fs/promises";
import { editTruncates, fileEffects } from "./adapters.ts";
import { canonicalize, contains, pathMatches, type PathFacts } from "./paths.ts";
import { analyzeShell } from "./shell.ts";
import type { Analysis, Policy, Settings, ToolRequest } from "./types.ts";

export type CreationFacts = { wasCreated: (path: string) => boolean; wasDockerCreated: (daemonId: string, containerId: string) => boolean };
export type AnalysisDependencies = { policy: Policy; settings: Settings; analyze?: typeof analyzeShell };

export async function analyzeRequest(request: ToolRequest, facts: PathFacts, _context: CreationFacts, dependencies: AnalysisDependencies): Promise<{ analysis: Analysis; createdPaths: string[] }> {
  const analysis: Analysis = request.tool === "bash" || request.tool === "powershell"
    ? await (dependencies.analyze ?? analyzeShell)(request, {
        rules: dependencies.policy.commands,
        parseBudgetMs: dependencies.settings.parseBudgetMs,
        repositoryRoot: facts.repo,
        canReadScript: async target => {
          const identity = await canonicalize(target, facts);
          return identity.status === "resolved" && pathMatches(identity.path, "read", dependencies.policy.paths, facts, "script-source").length === 0;
        },
      })
    : { effects: fileEffects(request), matches: [], uncertainties: [], health: { status: "ready" } };

  const scopedDeletes = new Set<string>();
  for (const effect of analysis.effects) {
    if (effect.kind !== "filesystem" && effect.operation !== "upload") continue;
    const operands = effect.operation === "upload" ? effect.sources : [...effect.targets, ...effect.sources];
    let scoped = effect.operation === "delete" && operands.length > 0;
    for (const target of operands) {
      if (target.resolution !== "static") { scoped = false; continue; }
      const identity = await canonicalize(target.path, { ...facts, cwd: effect.context.cwd });
      if (identity.status !== "resolved") { scoped = false; continue; }
      target.path = identity.path;
      const operation = effect.operation === "upload" ? "read" : effect.operation;
      if (["read", "metadata", "write", "delete", "truncate"].includes(operation)) {
        analysis.matches.push(...pathMatches(identity.path, operation as "read" | "metadata" | "write" | "delete" | "truncate", dependencies.policy.paths, facts, effect.id));
      }
      if (effect.operation === "delete" && (!contains(effect.context.cwd, identity.path, facts) || identity.path === effect.context.cwd)) scoped = false;
      if (request.tool === "edit" && !analysis.matches.some(m => m.action === "block" && m.applicability === "confirmed")) {
        const original = await readFile(identity.path, "utf8");
        if (editTruncates(original, request.input.edits)) analysis.matches.push(...pathMatches(identity.path, "truncate", dependencies.policy.paths, facts, effect.id));
      }
    }
    if (scoped && !analysis.matches.some(match => match.effects.includes(effect.id) && match.action === "block")) scopedDeletes.add(effect.id);
  }
  analysis.matches = analysis.matches.filter(match => !(match.effects.length && match.effects.every(id => scopedDeletes.has(id)) && (match.action === "user" || match.action === "review")));
  return { analysis, createdPaths: [] };
}
