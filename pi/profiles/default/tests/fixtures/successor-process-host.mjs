import { hostCloseoutSuccessor } from "../../../../../scripts/pi-closeout-successor-host.mjs";
import { hostSubagent } from "../../../../../scripts/pi-subagent-host.mjs";
import { writeFileSync } from "node:fs";
process.on("exit", code => writeFileSync(`${process.env.PI_LIFETIME_APP_FILE}.host-exit`, JSON.stringify({ code })));
const [entry, profile, endpoint, mode] = process.argv.slice(2);
if (mode === "successor") await hostCloseoutSuccessor(entry, profile, endpoint);
else await hostSubagent(entry, profile, endpoint);
