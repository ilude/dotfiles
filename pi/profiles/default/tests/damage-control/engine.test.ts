import { describe, expect, it } from "vitest";
import { decide } from "../../lib/damage-control/engine.ts";
import type { Analysis, Evidence, RuleMatch } from "../../lib/damage-control/types.ts";
const match = (id: string, action: RuleMatch["action"], applicability: RuleMatch["applicability"] = "confirmed"): RuleMatch => ({ ruleId: id, action, applicability, effects: ["e"], reason: id });
function run(matches: RuleMatch[], review?: Parameters<typeof decide>[2], overrides: Partial<Analysis> = {}) {
  const analysis: Analysis = { effects: [], matches, uncertainties: [], health: { status: "ready" }, ...overrides };
  const evidence: Evidence = { callId: "call", operation: "inert fixture", operator: [], untrusted: { effects: analysis.effects, matches, uncertainties: analysis.uncertainties }, omissions: [] };
  return decide(analysis, evidence, review);
}
describe("complete-invocation decisions", () => {
  it("later confirmed block beats an earlier ask or reviewed cleanup", () => {
    expect(run([match("first", "user"), match("second", "block")]).outcome).toBe("block");
    expect(run([match("cleanup", "review"), match("protected-upload", "block")], { status: "valid", verdict: "allow", reason: "cleanup", dismissedCandidates: [] }).outcome).toBe("block");
  });
  it("routine work never asks Luna, mandatory user approval is fresh on every call", () => {
    expect(run([]).outcome).toBe("allow");
    for (let i = 0; i < 3; i++) expect(run([match("persistent", "user"), match("lower", "review")]).outcome).toBe("user");
  });
  it("explains only the rules responsible for the decision in plain language", () => {
    const duplicate = { ...match("legacy-008", "user"), reason: "rm with recursive or force flags" };
    const decision = run([
      { ...match("legacy-007", "user"), reason: "rm with recursive or force flags" },
      duplicate,
      { ...match("unrelated", "review"), reason: "unrelated candidate" },
    ], undefined, { uncertainties: ["cat is missing a required operand"] });
    expect(decision).toEqual({ outcome: "user", reason: "- rm with recursive or force flags" });
  });
  it("reviews false positives without authorizing actual hard effects", () => {
    const candidate = match("regex", "block", "candidate");
    expect(run([candidate]).outcome).toBe("review");
    expect(run([candidate], { status: "valid", verdict: "allow", reason: "inert string", dismissedCandidates: ["regex"] }).outcome).toBe("allow");
    expect(run([candidate], { status: "valid", verdict: "allow", reason: "trust me", dismissedCandidates: [] }).outcome).toBe("user");
    expect(run([candidate], { status: "valid", verdict: "allow", reason: "wrong rule", dismissedCandidates: ["other"] }).outcome).toBe("user");
  });
  it("cannot let generic approval waive an unresolved prohibited target", () => {
    expect(run([match("user", "user"), match("possible-key", "block", "candidate")]).outcome).toBe("user");
  });
  it("retains an approval on review failure, with origin distinct from policy", () => {
    expect(run([match("cleanup", "review")], { status: "timeout", reason: "deadline" })).toMatchObject({ outcome: "user", origin: "review" });
    expect(run([match("possible", "block", "candidate")], { status: "timeout", reason: "deadline" }).outcome).toBe("user");
  });
  it("required enforcement failure wins over all approvals", () => {
    expect(run([], undefined, { health: { status: "failed", reason: "missing grammar" } }).outcome).toBe("block");
  });
});
