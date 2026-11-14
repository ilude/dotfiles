import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** Offline stand-in for the separately sourced generated T3 bridge. */
export default function bridge(pi: ExtensionAPI) {
  if (process.env.PI_T3_BOOTSTRAP_COORDINATOR !== "1") return;
  for (const [name, exposure] of [["mcp__t3-code__delegate_task", "direct"], ["mcp__t3_code__delegate_task", "hidden"]] as const) pi.registerTool({
    name, exposure, label: name, description: "RAW_BRIDGE_DECLARATION_MUST_STAY_PRIVATE", parameters: Type.Object({ task: Type.String() }, { additionalProperties: true }),
    async execute(_id, args) {
      appendFileSync(`${process.env.PI_T3_BOOTSTRAP_EVIDENCE}.bridge`, JSON.stringify(args) + "\n");
      return { content: [{ type: "text", text: "Offline bridge reached" }], details: {}, structuredContent: { structuredContent: { childThreadId: "grandchild", childRunId: "grandchild-run", taskId: "nested-task", status: "completed" } } };
    },
  });
}
