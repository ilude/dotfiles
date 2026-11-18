import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAgentDir, ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import subagents from "../extensions/subagents.ts";
import { resetSubagentRuntime } from "../lib/subagents/runtime.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

// Uses the active default profile's real login and makes two small model requests.
// The tool registration/context shell is local; selection, child launch and responses are real.
describe.skipIf(process.env.PI_SUBAGENT_LIVE !== "1")("bare family launch with real subscription access", () => {
  it.each(["sol", "luna"])("completes a bare %s tool call with an empty cached auth snapshot", async family => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-model-route-live-"));
    const modelRuntime = await ModelRuntime.create({
      authPath: join(getAgentDir(), "auth.json"), modelsPath: join(getAgentDir(), "models.json"),
      refreshOnCreate: false, allowModelNetwork: false,
    });
    try {
      const modelRegistry = new ModelRegistry(modelRuntime);
      const candidate = modelRegistry.getAll().find(model => model.provider === "openai" && model.id === (family === "sol" ? "gpt-6.1-sol" : "gpt-6-luna"));
      expect(candidate).toBeDefined();
      expect(modelRegistry.hasConfiguredAuth(candidate!)).toBe(false);
      const pi = createMockPi();
      subagents(pi as never);
      const ctx = createMockCtx({ cwd, modelRegistry, isProjectTrusted: () => false, isIdle: () => true });
      const result = await pi._getTool("subagent")!.execute("live-route", {
        agent: "advisor", model: family, effort: "low", surface: "headless", background: false,
        blockingReason: "This bounded acceptance check needs the completed child response.",
        instructions: "Bounded model-routing acceptance check. Reply with exactly MODEL_ROUTE_OK. Do not call tools, read files, delegate, or change anything.",
      }, AbortSignal.timeout(90_000), undefined, ctx);
      expect(result.isError, JSON.stringify(result.details)).not.toBe(true);
      expect(result.details.model).toBe(`openai/${candidate!.id}`);
      expect(result.details.outcome, result.details.error ?? result.details.result).toBe("complete");
      expect(result.details.result).toContain("MODEL_ROUTE_OK");
    } finally {
      await resetSubagentRuntime();
      await modelRuntime.settleCredentialWrites();
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 100_000);
});
