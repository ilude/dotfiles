import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it, vi } from "vitest";

// Use the installed loader bundle, as in profile-reload-integration.test.ts.
const bundlePath = "../node_modules/@earendil-works/pi-coding-agent/dist/bundle/index.js";
const { DefaultResourceLoader, SettingsManager } = await import(bundlePath) as typeof import("@earendil-works/pi-coding-agent");

it("all default extension tools expose Bedrock-compatible inputs at startup and reload, including deferred tools", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-tool-schemas-"));
	vi.stubGlobal("fetch", async () => { throw new Error("Network disabled in tool-schema fixture"); });
	try {
		const loader = new DefaultResourceLoader({
			cwd, agentDir: resolve("."), settingsManager: SettingsManager.inMemory(),
			noContextFiles: true, noSkills: true, noThemes: true, noPromptTemplates: true,
		});
		// Load factories only: no session hooks, tool execution or model requests.
		for (const phase of ["startup", "reload"]) {
			await loader.reload();
			const loaded = loader.getExtensions();
			expect(loaded.errors, phase).toEqual([]);
			const tools = loaded.extensions.flatMap(extension => [...extension.tools.values()].map(tool => tool.definition));
			expect(tools.find(tool => tool.name === "log_analytics")?.exposure).toBe("deferred");
			for (const tool of tools) {
				const schema = JSON.parse(JSON.stringify(tool.parameters));
				expect(schema.type, `${phase}: ${tool.name} requires an object root`).toBe("object");
				for (const keyword of ["anyOf", "oneOf", "allOf"]) {
					expect(schema, `${phase}: ${tool.name} forbids top-level ${keyword}`).not.toHaveProperty(keyword);
				}
			}
		}
	} finally {
		vi.unstubAllGlobals();
		await rm(cwd, { recursive: true, force: true });
	}
}, 60_000);
