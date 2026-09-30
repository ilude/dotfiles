import { createRequire } from "node:module";
import { join } from "node:path";

/** Called only by the setup-owned bootstrap's explicit successor branch. */
export async function hostCloseoutSuccessor(entry, profile, rawEndpoint) {
  const endpoint = JSON.parse(rawEndpoint);
  if (!endpoint || !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535
    || typeof endpoint.token !== "string" || !/^[a-f0-9]{64}$/.test(endpoint.token)
    || ![endpoint.child, endpoint.run, endpoint.origin].every(value => typeof value === "string" && value.trim())) {
    throw new Error("Invalid closeout successor admission endpoint");
  }
  const { createJiti } = createRequire(join(profile, "package.json"))("jiti");
  const jiti = createJiti(import.meta.url);
  const host = await jiti.import("../pi/profiles/default/lib/subagents/successor-host.ts");
  const outcome = await host.hostCloseoutSuccessor(entry, profile, endpoint);
  process.exitCode = outcome.code ?? (outcome.signal ? 128 : 1);
}
