import path from "node:path";
import { describe, expect, it } from "vitest";
import featureMemoryExtension from "../extensions/feature-memory.ts";
import { createMockPi } from "./helpers/mock-pi.js";

describe("feature memory tool schema", () => {
	it("advertises only feature IDs matched in the current session", async () => {
		const pi = createMockPi();
		const repoRoot = path.resolve(import.meta.dirname, "../..");
		await featureMemoryExtension(pi as never, {
			repoRoot,
			registryPath: path.join(repoRoot, "pi", "feature-memory.json"),
			eventsDirectory: path.join(repoRoot, ".tmp", "feature-memory-test"),
		});
		const tool = pi._getTool("feature_memory_record")!;
		const schema = tool.parameters.properties.featureId;
		expect(schema.enum).toEqual([]);

		const beforeAgentStart = pi._getHook("before_agent_start")[0];
		await beforeAgentStart.handler({ prompt: "Investigate the MSYS2 bash crash" });

		expect(schema.enum).toEqual(["msys2-bash-crash"]);
		expect(pi.getActiveTools()).toContain("feature_memory_record");
	});
});
