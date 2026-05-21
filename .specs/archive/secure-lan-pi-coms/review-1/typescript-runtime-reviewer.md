---
reviewer: Pi TypeScript runtime and module-compatibility reviewer
status: complete
finding_count: 3
---

# Findings

- severity: high
  evidence: "The plan requires direct hub-to-hub wss:// transport, but pi/extensions/package.json has no WebSocket server dependency and only @types/node for Node APIs. TypeScript may expose a DOM WebSocket client type, but neither Node nor Pi extension code shown here provides a built-in WebSocket server/listener API. The plan only validates @noble/ed25519 dependency compatibility, not the WebSocket/TLS runtime surface."
  required_fix: "Add an explicit Wave 1 compatibility decision and smoke test for the WSS server/client runtime. Either add a concrete dependency such as ws plus its types to pi/extensions with pnpm, or document and test the exact Pi/Bun API used for server-side WSS before T4 implementation."

- severity: high
  evidence: "T4 requires self-signed TLS setup, but the plan does not name a certificate-generation API or dependency. Node's crypto module can create keys and signatures, but it does not provide a straightforward X.509 certificate builder. Without a selected cert library or generated test fixture strategy, implementation is likely to reach for an unplanned dependency or shell tool and mutate the wrong package/lock surface."
  required_fix: "Add a TLS certificate strategy to T2: choose a Pi/Bun-compatible certificate-generation dependency in pi/extensions or use deterministic test-only certificates stored/generated under pi/tests. Specify exactly which package.json and lockfile change, and add a focused runtime smoke test that starts a TLS/WSS listener with the selected cert path."

- severity: medium
  evidence: "The automation plan says `cd pi/extensions && pnpm add @noble/ed25519` and then `pnpm install --frozen-lockfile` after lock update. `pnpm add` already updates the lockfile, so the frozen install step is not the operation that validates the dependency decision, and T2 does not mention where test-only dependencies belong if Vitest fixtures import the crypto/WebSocket libraries directly."
  required_fix: "Make dependency placement deterministic: production runtime dependencies used by coms-lan.ts go only in pi/extensions/package.json and pi/extensions/pnpm-lock.yaml; test-only direct imports go in pi/tests/package.json and pi/tests/pnpm-lock.yaml. Update the plan commands to run pnpm add in the owning package, then verify with pnpm install --frozen-lockfile in both pi/extensions and pi/tests."
