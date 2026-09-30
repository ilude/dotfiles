import { createRequire } from "node:module";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
const { createJiti } = createRequire(join(process.env.PI_CODING_AGENT_DIR, "package.json"))("jiti");
const loader = createJiti(import.meta.url);
const { requestParent, waitForParentEvents } = await loader.import("../../lib/subagents/transport.ts");
process.on("exit", code => writeFileSync(`${process.env.PI_LIFETIME_APP_FILE}.app-exit`, JSON.stringify({ code })));
const endpoint = JSON.parse(process.env.PI_SUBAGENT_ENDPOINT);
const authority = JSON.parse(process.env.PI_SUBAGENT_AUTHORITY);
writeFileSync(process.env.PI_LIFETIME_APP_FILE, JSON.stringify({ pid: process.pid, hostPid: process.ppid, authority, endpoint, admissionEnv: process.env.PI_HERDR_SUCCESSOR_ADMISSION_ENDPOINT }));
await requestParent(endpoint, { type: "app-ready", payload: { tools: [...authority.tools, ...(process.env.PI_CLOSEOUT_SUCCESSOR === "1" ? ["closeout_successor_handoff"] : [])] } });
while (true) {
  try {
    const batch = await waitForParentEvents(endpoint, "visible-app");
    for (const command of batch.commands) {
      await requestParent(endpoint, { type: "app-ack", payload: command.id });
      if (command.message === "fixture-exit") process.exit(0);
      if (command.message === "fixture-input") {
        await requestParent(endpoint, { type: "turn", payload: { text: "fixture accepted input", turn: 1 } });
      }
    }
  } catch {
    // An ordinary fixture deliberately ignores app parent loss. Its actual
    // production host must enforce ordinary process termination independently.
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
