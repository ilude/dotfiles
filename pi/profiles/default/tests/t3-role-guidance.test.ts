import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, Skill } from "@earendil-works/pi-coding-agent";
import type { SystemMessage } from "@earendil-works/pi-ai";
import { getCurrentSystemPrompt } from "@earendil-works/pi-ai";
import { buildSystemPromptSections } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js";
import { loadDefinitions } from "../lib/subagents/definitions.ts";
import { composedAgentPrompt, delegationContext, T3_ROLE_OPERATIONS_GUIDANCE } from "../lib/subagents/guidance.ts";
import { resolveRoleSnapshot } from "../lib/subagents/authority.ts";
import { projectT3Guidance, registerT3RoleGuidance, T3_EXTERNAL_CLIENT_GUIDANCE } from "../lib/subagents/t3/guidance.ts";
import type { T3RoleRuntime } from "../lib/subagents/t3/bootstrap.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

const profile = fileURLToPath(new URL("../", import.meta.url));
const catalog = loadDefinitions(profile, false, profile).agents;
// Contract fixture for the installed bridge's named section. No live generated file dependency.
const bridge = "## T3 Code orchestration\n\n- Subagents: use your native tool when the child uses your provider. Use delegate_task for another provider.\n- Every new delegate review or re-check is a new delegate_task.\n- In your reply, mention a thread by its link, verbatim.\n\n### Visuals and preview\nKeep generic visual behavior.";
afterEach(() => vi.unstubAllEnvs());
const names = (text: string) => [...text.matchAll(/^- ([^:]+):/gm)].map(match => match[1]);
function render(sections: Record<string, string>, skills: Skill[] = []): SystemMessage {
  return { role: "system", content: "", timestamp: 0, sections: buildSystemPromptSections({ cwd: profile, selectedTools: ["read"], sections, skills, contextFiles: [{ path: "/project/AGENTS.md", content: "ACTUAL_PROJECT_CONTEXT_TRUST_UNCHANGED" }] }) } satisfies SystemMessage;
}
function caller() {
  return render({ "t3-role-caller": `${delegationContext({ audience: "caller", definitions: catalog, backend: "t3" })}\n\n${T3_ROLE_OPERATIONS_GUIDANCE}\n\n${T3_EXTERNAL_CLIENT_GUIDANCE}`, t3_code_orchestration: bridge });
}

describe("T3 full request guidance composition", () => {
  it("selects backend prompt at snapshot resolution without changing shared definitions or native composition", () => {
    const original = structuredClone([...catalog]);
    for (const name of ["developer", "teamlead", "strategist", "council", "integrator"]) {
      const role = catalog.get(name)!;
      const snapshot = resolveRoleSnapshot({ agent: name, backend: "t3", profile, cwd: profile, projectTrusted: false, model: "fixture/model" });
      expect(snapshot.prompt).toBe(composedAgentPrompt(role, catalog, undefined, "t3"));
      expect(snapshot.prompt).not.toMatch(/`subagent`|\bsubagent_control\b|\bsubagent_parent\b|cancel-question action|process and pane/);
      expect(snapshot.backendTools).not.toContain("subagent");
      expect(composedAgentPrompt(role, catalog)).toContain(role.prompt);
    }
    expect([...catalog]).toEqual(original);
  });

  it("gives the caller one deterministic catalog and preserves generic root tools/context without native routing", () => {
    const full = getCurrentSystemPrompt([projectT3Guidance(caller(), false)]);
    expect(names(full).filter(name => catalog.has(name))).toEqual([...catalog.keys()].sort());
    expect(full).toContain('agent: "strategist"');
    expect(full).toContain("t3_delegate_role");
    expect(full).toContain("reviewer or validator agent reports findings about implemented work");
    expect(full).toContain("Do not consult Steward before starting requested implementation");
    expect(full).toContain("Use writer");
    expect(full).toContain("Councils remain explicit-user-request only");
    expect(full).toContain("ACTUAL_PROJECT_CONTEXT_TRUST_UNCHANGED");
    expect(full).toContain("Generic delegation: use delegate_task");
    expect(full).toContain("Keep generic visual behavior");
    expect(full).not.toContain("use your native tool");
    expect(full).not.toContain("private role body");
    expect(full).toContain("Work Opus uses Bedrock; personal Opus prefers ccyl");
    expect(full).toContain("any authorized task type");
    expect(full).toContain("existing Git identity");
    expect(full).toContain("claude_usage");
    expect(full).toContain("AWS Grok is permitted for either project category");
    expect(delegationContext({ audience: "caller", definitions: new Map([...catalog].reverse()), backend: "t3" })).toBe(delegationContext({ audience: "caller", definitions: catalog, backend: "t3" }));
  });

  it.each(["developer", "teamlead", "council", "strategist", "integrator"])("renders %s with only its policy, permitted roles and selected skills, including old system patches", name => {
    const role = catalog.get(name)!;
    const prompt = composedAgentPrompt(role, catalog, ["developer", "reviewer"], "t3");
    const selectedSkill = readFileSync(`${profile}/skills/testing/SKILL.md`, "utf8");
    const message = render({ "subagent-role": prompt, "selected-role-skills": selectedSkill, t3_code_orchestration: bridge, "t3-role-caller": "UNRELATED_ROOT_CATALOG" }, [{ name: "unrelated", description: "UNRELATED_SKILL_CATALOG", filePath: "/unrelated/SKILL.md", baseDir: "/unrelated", disableModelInvocation: false, sourceInfo: { path: "/unrelated/SKILL.md", source: "fixture", scope: "temporary", origin: "top-level" } }]);
    const messages = [caller(), message].map(item => projectT3Guidance(item, true));
    const full = getCurrentSystemPrompt(messages);
    expect(full).toContain("ACTUAL_PROJECT_CONTEXT_TRUST_UNCHANGED");
    expect(full).toContain(role.prompt);
    expect(full).toContain(selectedSkill);
    expect(full).not.toContain(T3_EXTERNAL_CLIENT_GUIDANCE);
    expect(full).not.toMatch(/UNRELATED_ROOT_CATALOG|UNRELATED_SKILL_CATALOG|T3 Code orchestration|Generic T3 Code operations|use your native tool/);
    if (name === "teamlead") {
      expect(full).toContain("Commission a Strategist");
      expect(full).toContain("implemented work");
      expect(full).toContain("Use writer");
    }
    const permitted = name === "strategist" ? ["developer", "reviewer"] : role.delegates;
    expect(names(full).filter(value => catalog.has(value))).toEqual([...permitted].sort());
    expect(full.indexOf(role.prompt)).toBeLessThan(full.indexOf(selectedSkill));
    expect(full).toContain("not an OS sandbox");
    expect(full).not.toMatch(/yield-and-discuss|cancel-question action|closeout_successor|original full-width caller/);
  });

  it("projects after a late bridge hook and preserves declarations and non-system conversation exactly", async () => {
    vi.stubEnv("PI_CODING_AGENT_DIR", profile);
    const pi = createMockPi();
    const runtime: T3RoleRuntime = { binding: () => undefined, authority: () => undefined, withOperation: async (_id, _op, _args, execute) => execute() };
    registerT3RoleGuidance(pi as unknown as ExtensionAPI, runtime);
    const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
    await pi._getHook("before_agent_start")[0].handler(event, { cwd: profile, isProjectTrusted: () => false });
    event.systemPromptOptions.sections.t3_code_orchestration = bridge; // CLI bridge loads after profile.
    const head = render(event.systemPromptOptions.sections);
    head.toolsAdded = [{ name: "delegate_task", description: "generic unchanged", parameters: { type: "object" } }];
    const user = { role: "user", content: "USER_ASSIGNMENT_UNCHANGED", timestamp: 1 };
    const projected = await pi._getHook("context_with_system")[0].handler({ messages: [head, user] }, {});
    expect(projected.messages[0].toolsAdded).toBe(head.toolsAdded);
    expect(projected.messages[1]).toBe(user);
    const full = getCurrentSystemPrompt(projected.messages);
    expect(full).toContain(T3_EXTERNAL_CLIENT_GUIDANCE);
    expect(full).toContain('target.providerInstanceId: "ccyl"');
    expect(full).toContain('target.options.effort: "high"');
    expect(full).toContain("read its effective Claude settings");
    expect(full).toContain("personal-project Opus preference");
    expect(full).toContain("implementation as well as advisory tasks");
    expect(full).toContain("orchestrator owns the ccyl Opus seat");
    expect(full).toContain("shared five-hour/weekly quota and resets");
    expect(full).toContain("including after a failed Pi-role attempt");
    expect(full).toContain("not an automatic fallback or a Pi-enforced role");
    expect(full).toContain("background:true");
    expect(full).toContain("blockingReason");
    expect(full).toContain("not a retained-thread message");
    expect(full).not.toContain("use your native tool");
  });

  it("compares deterministic composed bytes, not provider cache performance", () => {
    const callerBytes = Buffer.byteLength(getCurrentSystemPrompt([projectT3Guidance(caller(), false)]));
    for (const name of ["developer", "teamlead", "strategist"]) {
      const role = catalog.get(name)!;
      const prompt = composedAgentPrompt(role, catalog, ["developer"], "t3");
      const roleMessage = render({ "subagent-role": prompt, t3_code_orchestration: bridge });
      const before = Buffer.byteLength(getCurrentSystemPrompt([caller(), roleMessage]));
      const after = Buffer.byteLength(getCurrentSystemPrompt([caller(), roleMessage].map(item => projectT3Guidance(item, true))));
      expect(after).toBeLessThan(before);
      expect(after).toBeLessThan(9000); // Bound role + permitted catalog + Pi base/project context.
      expect(composedAgentPrompt(role, new Map([...catalog].reverse()), ["developer"], "t3")).toBe(prompt);
      console.info(`${name}: composed bytes before=${before} after=${after}; caller=${callerBytes}`);
    }
  });
});
