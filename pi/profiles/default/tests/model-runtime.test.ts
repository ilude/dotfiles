import { afterEach, expect, it, vi } from "vitest";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createProfileModelRuntime } from "../lib/model-runtime.ts";

vi.mock("@earendil-works/pi-coding-agent", () => ({
	getAgentDir: () => "/test-profile",
	ModelRuntime: { create: vi.fn(async () => ({})) },
}));
afterEach(() => vi.clearAllMocks());

it("creates independent runtimes with profile-local paths and caller-owned signals", async () => {
	const firstSignal = new AbortController().signal;
	const secondSignal = new AbortController().signal;
	const first = await createProfileModelRuntime(firstSignal);
	const second = await createProfileModelRuntime(secondSignal);
	expect(first).not.toBe(second);
	const options = {
		authPath: join("/test-profile", "auth.json"), modelsPath: join("/test-profile", "models.json"),
		modelsStorePath: join("/test-profile", "models-store.json"), allowModelNetwork: false,
	};
	expect(ModelRuntime.create).toHaveBeenNthCalledWith(1, { ...options, signal: firstSignal });
	expect(ModelRuntime.create).toHaveBeenNthCalledWith(2, { ...options, signal: secondSignal });
});
