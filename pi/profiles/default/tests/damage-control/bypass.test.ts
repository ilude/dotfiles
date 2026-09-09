import { expect, it } from "vitest";
import { bypassEligibility } from "../../lib/damage-control/bypass.ts";
import type { Analysis, Decision, Effect, ToolRequest } from "../../lib/damage-control/types.ts";

const request: ToolRequest = { tool: "bash", language: "bash", callId: "fixture", cwd: "/repo", text: "rm -rf output", input: { command: "rm -rf output" } };
const decision: Decision = { outcome: "user", origin: "review", reviewDisposition: "ask", reason: "confirm" };
const effect = (overrides: Partial<Effect> = {}): Effect => ({ id: "effect-1", kind: "filesystem", operation: "delete", sources: [], targets: [{ resolution: "static", path: "/repo/output" }], destinations: [], context: { cwd: "/repo", language: "bash", executable: "rm" }, range: { start: 0, end: 13 }, resolution: "static", ...overrides } as Effect);
const analysis = (effects: Effect[], matches: Analysis["matches"] = []): Analysis => ({ effects, matches, uncertainties: [], health: { status: "ready" }, internal: { docker: [] } });
const facts = { platform: "posix" as const, cwd: "/repo", home: "/home/operator", profile: "/profile", repo: "/repo", realpath: async (path: string) => path };

it("allows only a valid contextual ask for a contained local rm", () => {
  expect(bypassEligibility(request, analysis([effect()]), decision, facts)).toMatchObject({ eligible: true });
  expect(bypassEligibility(request, analysis([effect()]), { outcome: "user", origin: "review", reviewDisposition: "failure", reason: "review unavailable" }, facts)).toMatchObject({ eligible: false });
});

it("rejects unresolved, protected, mixed remote, and out-of-repository effects", () => {
  const unknown = effect({ resolution: "unknown", reason: "variable unresolved", targets: [{ resolution: "unknown", expression: "$TARGET", reason: "unresolved" }] });
  const network = effect({ kind: "network", operation: "metadata", targets: [{ resolution: "static", path: "https://example.test" }], context: { cwd: "/repo", language: "bash", executable: "curl" } });
  expect(bypassEligibility(request, analysis([unknown]), decision, facts)).toMatchObject({ eligible: false });
  expect(bypassEligibility(request, analysis([effect()], [{ ruleId: "root", action: "block", applicability: "confirmed", reason: "root", effects: ["effect-1"] }]), decision, facts)).toMatchObject({ eligible: false });
  expect(bypassEligibility(request, analysis([effect(), network]), decision, facts)).toMatchObject({ eligible: false });
  expect(bypassEligibility(request, analysis([effect({ targets: [{ resolution: "static", path: "/other/output" }] })]), decision, facts)).toMatchObject({ eligible: false });
});

it("rejects remote Git rules and Docker volumes", () => {
  const git = effect({ kind: "git", operation: "mutate", targets: [], context: { cwd: "/repo", language: "bash", executable: "git" } });
  const docker = effect({ kind: "docker", operation: "delete", targets: [{ resolution: "static", path: "docker://local/fixture" }], context: { cwd: "/repo", language: "bash", executable: "docker", daemon: "default", mountedData: true } });
  expect(bypassEligibility(request, analysis([git], [{ ruleId: "git-push-delete-branch", action: "review", applicability: "confirmed", reason: "remote", effects: ["effect-1"] }]), decision, facts)).toMatchObject({ eligible: false });
  expect(bypassEligibility(request, analysis([docker]), decision, facts)).toMatchObject({ eligible: false });
});
