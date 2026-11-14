import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SystemMessage } from "@earendil-works/pi-ai";
import { loadDefinitions } from "../definitions.ts";
import { delegationContext, T3_ROLE_OPERATIONS_GUIDANCE } from "../guidance.ts";
import type { T3RoleRuntime } from "./bootstrap.ts";

const CALLER_SECTION = "t3-role-caller";
const BRIDGE_SECTION = "t3_code_orchestration";

export const T3_EXTERNAL_CLIENT_GUIDANCE = `## ccyl subscription tasks

When the user names ccyl or the personal-project Opus preference selects it, the orchestrator uses generic T3 delegate_task with target.providerInstanceId: "ccyl", not t3_delegate_role, Pi\'s anthropic OAuth, Herdr, or a shell CLI. ccyl is authorized for implementation as well as advisory tasks. This is external-client work, including after a failed Pi-role attempt when the user explicitly selects ccyl, not an automatic fallback or a Pi-enforced role. Preserve the bounded assignment and disclose the harness difference; if Pi-specific enforcement or capabilities are required, report the incompatibility rather than dropping them. For a personal-project council, the orchestrator owns the ccyl Opus seat and passes its findings to the non-writing council.

Check orchestrator_capabilities for ccyl\'s configured subscription models/options. "ccyl Opus high" selects its advertised Opus subscription model with target.options.effort: "high"; do not send a Bedrock model ID or thinking option. "Use ccyl" without a model means its configured subscription default: read its effective Claude settings (model and effortLevel, honoring the instance\'s config directory) and map that selection to its advertised subscription catalog. Never inherit the parent\'s Pi model or invent a model. If it cannot be determined, ask which configured subscription model to use. A ccyl request does not authorize Bedrock mode. If ccyl is unavailable, report that route without substituting. Use background delegation and automatic delivery when independent work remains.`;

/** The installed bridge owns this section. Scope its generic routing, not its tools. */
export function scopedT3BridgeGuidance(section: string): string {
  return section.replace(/^(- Subagents:)[^\n]*/m,
    "- Generic delegation: use delegate_task for an untyped T3 child only when generic delegation is intended. Named Pi roles always use t3_delegate_role with the profile's frozen role policy, including same-provider and background work. Never bypass a failed role launch with generic delegation. The personal-project Opus preference or an explicit ccyl request selects external-client work before launch, not a fallback Pi-role launch.")
    .replace("## T3 Code orchestration", "## Generic T3 Code operations (not named-role routing)");
}

/** Request-only projection runs after all before_agent_start hooks, including a late bridge. */
export function projectT3Guidance(message: SystemMessage, roleBound: boolean): SystemMessage {
  if (!message.sections) return message;
  const sections = { ...message.sections };
  if (roleBound) {
    // Remove old patches as well as this turn's contribution, without touching project context.
    delete sections[BRIDGE_SECTION];
    delete sections[CALLER_SECTION];
    delete sections.skills;
  } else if (typeof sections[BRIDGE_SECTION] === "string") {
    sections[BRIDGE_SECTION] = scopedT3BridgeGuidance(sections[BRIDGE_SECTION]);
  }
  return { ...message, sections };
}

/** Entry wiring is owned by extensions/t3-subagents.ts. No native/Herdr registration. */
export function registerT3RoleGuidance(pi: ExtensionAPI, runtime: T3RoleRuntime): void {
  pi.on("before_agent_start", (event, ctx) => {
    if (runtime.binding()) { delete event.systemPromptOptions.sections[CALLER_SECTION]; return; }
    const catalog = loadDefinitions(ctx.cwd, ctx.isProjectTrusted(), getAgentDir());
    event.systemPromptOptions.sections[CALLER_SECTION] = `${delegationContext({ audience: "caller", definitions: catalog.agents, backend: "t3" })}\n\n## Named Pi roles in T3\n\n${T3_ROLE_OPERATIONS_GUIDANCE}\n\n${T3_EXTERNAL_CLIENT_GUIDANCE}`;
  });
  pi.on("context_with_system", event => ({
    messages: event.messages.map(message => message.role === "system" ? projectT3Guidance(message, Boolean(runtime.binding())) : message),
  }));
}
