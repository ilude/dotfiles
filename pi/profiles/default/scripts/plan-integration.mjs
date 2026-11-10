import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const profile = resolve(fileURLToPath(new URL("../", import.meta.url)));
const require = createRequire(import.meta.url);
const { createJiti } = require(realpathSync(resolve(profile, "node_modules/jiti")));
const loader = createJiti(import.meta.url, { tryNative: false, moduleCache: false, fsCache: false });

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

const operation = process.argv[2];
if (process.argv.length !== 3 || !["closeout", "integrate", "cleanup"].includes(operation)) {
  fail("Usage: node <canonical plan-integration.mjs> <closeout|integrate|cleanup>");
} else {
  try {
    const authority = JSON.parse(process.env.PI_SUBAGENT_AUTHORITY || "null");
    let handoff = authority?.closeout;
    let authorizedCwd = authority?.cwd;
    if (!authority && process.env.PI_T3_CLOSEOUT_ENDPOINT) {
      const endpoint = JSON.parse(process.env.PI_T3_CLOSEOUT_ENDPOINT);
      if (!endpoint || !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535
        || ![endpoint.child, endpoint.run, endpoint.origin, endpoint.token].every(value => typeof value === "string" && value)) throw new Error("Invalid T3 closeout endpoint");
      const { requestParent } = await loader.import("../lib/subagents/transport.ts");
      handoff = await requestParent(endpoint, { type: "t3-closeout-authority" });
      const p = handoff?.provenance;
      if (p?.source !== "t3-role-runtime" || p.version !== 1 || p.agent !== "integrator"
        || p.launchId !== endpoint.child || p.threadId !== endpoint.origin || !p.parentThreadId || !p.parentSessionId
        || p.targetCheckout !== handoff?.manifest?.targetCheckout) throw new Error("Authenticated T3 Integrator closeout authority is unavailable");
      authorizedCwd = p.targetCheckout;
    } else if (authority?.agent !== "integrator" || authority.parentId !== undefined || !Array.isArray(authority.delegates) || authority.delegates.length !== 0
      || handoff?.provenance?.source !== "subagent-runtime" || handoff.provenance.version !== 1 || handoff.provenance.agent !== "integrator"
      || handoff.provenance.childId !== authority.id || handoff.provenance.targetCheckout !== handoff?.manifest?.targetCheckout
      || !handoff.provenance.parentSessionId || !process.env.PI_SUBAGENT_ENDPOINT) {
      throw new Error("Authenticated Integrator closeout authority is unavailable");
    }
    const { closeout, validateCloseoutManifest } = await loader.import("../lib/plan-integration/closeout.ts");
    validateCloseoutManifest(handoff.manifest);
    if (handoff.manifest.noMerge || resolve(process.cwd()) !== resolve(handoff.manifest.targetCheckout)
      || resolve(authorizedCwd) !== resolve(handoff.manifest.targetCheckout)) {
      throw new Error("Closeout target does not match the authorized manifest");
    }
    process.stdout.write(`${JSON.stringify(closeout(handoff.manifest, { operation }), null, 2)}\n`);
  } catch (error) {
    fail(`Plan integration closeout failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
