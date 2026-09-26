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

if (process.argv.length !== 3 || process.argv[2] !== "closeout") {
  fail("Usage: node <canonical plan-integration.mjs> closeout");
} else {
  try {
    const authority = JSON.parse(process.env.PI_SUBAGENT_AUTHORITY ?? "null");
    const handoff = authority?.closeout;
    const provenance = handoff?.provenance;
    if (authority?.agent !== "integrator" || authority.parentId !== undefined || !Array.isArray(authority.delegates) || authority.delegates.length !== 0
      || provenance?.source !== "subagent-runtime" || provenance.version !== 1 || provenance.agent !== "integrator"
      || provenance.childId !== authority.id || provenance.targetCheckout !== handoff?.manifest?.targetCheckout
      || !provenance.parentSessionId || !process.env.PI_SUBAGENT_ENDPOINT) {
      throw new Error("Authenticated Integrator closeout authority is unavailable");
    }
    const { closeout, validateCloseoutManifest } = await loader.import("../lib/plan-integration/closeout.ts");
    validateCloseoutManifest(handoff.manifest);
    if (handoff.manifest.noMerge || resolve(process.cwd()) !== resolve(handoff.manifest.targetCheckout)
      || resolve(authority.cwd) !== resolve(handoff.manifest.targetCheckout)) {
      throw new Error("Closeout target does not match the authorized manifest");
    }
    process.stdout.write(`${JSON.stringify(closeout(handoff.manifest), null, 2)}\n`);
  } catch (error) {
    fail(`Plan integration closeout failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
