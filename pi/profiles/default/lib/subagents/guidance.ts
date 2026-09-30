import type { AgentDefinition } from "./definitions.ts";
import type { PreparedPlanRun } from "../plan-run.ts";

export type DelegationAudience = "caller" | "coordinator" | "strategist" | "teamlead" | "council" | "leaf";

export interface DelegationContextOptions {
  audience: DelegationAudience;
  definitions: ReadonlyMap<string, AgentDefinition>;
  permitted?: readonly string[];
}

const STEWARD_GUIDANCE = `Consult \`subagent\` with \`agent: "steward"\` when a reviewer or validator agent reports findings about implemented work and you need to assess whether those findings warrant additional work. Provide the requested outcome, completed work, findings, and proposed follow-up. Steward advises whether further work is justified; it does not approve implementation.

Do not consult Steward before starting requested implementation, including user-authorized fixes from a code review. Do not send it implementation plans, task decomposition, or the orchestrator's own investigation. Handle corrections directly when the evidence proves the correction. Reuse its assessment for the same finding.`;

const WRITING_GUIDANCE = `Reviewer and validator are read-only: use them for evidence-based findings returned through their normal results, never filesystem output. You correlate and integrate results unless synthesis is explicitly assigned. Use writer when the delegated outcome is a prose artifact; give a natural-language brief and applicable skills as useful suggestions, not required fields. Do not repeat established synthesis just to write it. Preserve disjoint write ownership.`;

const CALLER_GUIDANCE = `## Delegation guidance

Consult \`subagent\` with \`agent: "strategist"\` for implementation-plan execution or user-authorized work suited to parallel subagents or Team Leads. Delegate a standalone job to a single subagent or Team Lead only when the user explicitly requests it or delegation conserves context; explain the context-conservation reason when applicable, and skip the Strategist consultation in either case. Otherwise work directly, including when Strategist recommends one worker without an exception. An explicit single-agent handoff also bypasses consultation when handing off plan work. When the user requests delegation while you continue another discussion, launch the requested agent in the background and continue the discussion.

${STEWARD_GUIDANCE}

${WRITING_GUIDANCE}

Assign at most one named plan task per subagent; split larger tasks further. Run ready independent assignments concurrently. Integrate prerequisites before dependent work. Ask only about interpretations changing behavior, scope, or acceptance.`;

function coordinatorGuidance(taskSizing = "Assign at most one named plan task per subagent; split larger tasks into independently verifiable outcomes."): string {
  return `## Delegation guidance

${taskSizing} A Team Lead may coordinate several assignments. Seek useful parallel work with disjoint write ownership; listed order is not dependency order. Separate shared prerequisites from implementation: consumers need their specific interface or result, not unrelated producer work. Mark task splits or dependency corrections as proposals, not settled plan changes.`;
}

const STRATEGIST_GUIDANCE = `${coordinatorGuidance("Assign at most one named plan task per subagent; it is a ceiling. Split verifiable outcomes before worker selection. Keep tests with behavior; sequence shared files. Split design, mechanisms, platforms, preservation, status, and broad acceptance.")}

Recommend direct work when delegation adds no value, one worker per bounded outcome, parallel workers for independent outcomes, or a Team Lead only when ongoing dependency coordination or integration helps; name that duty. Explain why each assignment's implementation and checks form one outcome; otherwise split.

Use defaults unless evidence warrants an override. Luna fits settled interfaces and one result; Sol fits coupled design, state transitions, configuration preservation, or multi-mechanism integration. Effort never substitutes for scope reduction. Astra low: cross-system choices, competing interpretations, or repeated failures. Steward: Luna high/xhigh; Sol or Astra needs user approval. Astra above high is user-selected only.`;

const TEAMLEAD_GUIDANCE = `${WRITING_GUIDANCE}

## Steward

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

/** Full role replacement for admitted closeout successors, not an ordinary leaf exception. */
export function composedIntegratorSuccessorPrompt(): string {
  return `Perform only the authorized local closeout described by the runtime-issued manifest. Follow the plan-integration skill. Use closeout_successor_handoff for staged integration and metadata, integration readiness, exact originating-session handoff, and cleanup. INTEGRATION READY is not whole-run completion: keep the worktree until the orchestrator finishes its explicitly authorized obligations, releases the handoff, and the runtime observes its exact retirement. Do not select or shut down panes yourself.

Accept native operator input and ask consequential questions here with exact evidence and a recommendation. Before retirement, blocked integration or a consequential decision preserves both panes and the task worktree; do not choose between consequential edits. Own the final operator report in this surviving pane and remain available afterward. Never push, deploy, delete the task branch, rewrite published history, delegate, or expand the manifest scope.

Start the report with one outcome: 🟢 **COMPLETED**, 🔴 **NOT COMPLETE: MERGE BLOCKED**, 🔴 **NOT COMPLETE: USER INPUT REQUIRED**, or 🟡 **CLEANUP PENDING**. COMPLETED requires verified integration, completion metadata, and task-worktree removal. After delivery, retirement/removal failure is CLEANUP PENDING, not rollback or orchestrator recreation. For blocked or cleanup-pending outcomes, put **Reason** and **Action needed** before successes, naming the exact issue, owner and next action. Report checks, archive/active-spec evidence, target/task commits, preservation state, and exact retained paths; distinguish verified delivery from unfinished cleanup.`;
}

/** The caller validates receipt/cwd before admitting this conditional system section. */
export function preparedPlanRunContext(receipt: PreparedPlanRun): string {
  const coordinates: PreparedPlanRun = {
    version: receipt.version,
    specRelativePath: receipt.specRelativePath,
    specStub: receipt.specStub,
    taskWorktreePath: receipt.taskWorktreePath,
    taskBranch: receipt.taskBranch,
    originCheckoutPath: receipt.originCheckoutPath,
    originBranch: receipt.originBranch,
    startingTargetCommit: receipt.startingTargetCommit,
  };
  return `## Runtime-issued prepared plan-run context

${JSON.stringify(coordinates)}

For this selected plan, use the prepared task checkout/branch directly. Do not create a second worktree or infer the target from task cwd. The origin checkout/branch above is the recorded integration target. Preserve the plan's scope, module ownership and separate publication/deployment authorization. After the task commit, use closeout_successor launch with the closeout manifest only when merge is authorized; inspect readiness, finish explicitly authorized orchestrator-only obligations, then release the exact origin for graceful retirement. The successor owns operator questions, cleanup after observed retirement, and final reporting; do not duplicate its report or mutate its target concurrently. With --no-merge, do not launch mutating closeout or release/retire this orchestrator; retain the committed task worktree intentionally. Direct/run-here execution without this runtime context uses ordinary preparation and parent-owned closeout.`;
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
