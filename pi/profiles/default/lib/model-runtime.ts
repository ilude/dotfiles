import { join } from "node:path";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";

/** Configuration is shared; every call creates a separately owned runtime. */
export function createProfileModelRuntime(signal?: AbortSignal): Promise<ModelRuntime> {
	const profile = getAgentDir();
	return ModelRuntime.create({
		authPath: join(profile, "auth.json"),
		modelsPath: join(profile, "models.json"),
		modelsStorePath: join(profile, "models-store.json"),
		allowModelNetwork: false,
		signal,
	});
}
