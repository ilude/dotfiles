import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentDir = path.resolve(__dirname, "..").replace(/\\/g, "/");

// Pi TypeScript dependencies live at pi/node_modules: native deps via
// pi/package.json + pnpm install, and @earendil-works packages plus typebox via
// pi-deps-link-setup symlinking pnpm-global into pi/node_modules.
const piNodeModules = path.resolve(__dirname, "../node_modules");
const piPackageRoot = path.join(
	piNodeModules,
	"@earendil-works/pi-coding-agent",
);
if (!fs.existsSync(piPackageRoot)) {
	throw new Error(
		`Could not locate Pi dependencies at ${piNodeModules}. Run: ~/.dotfiles/install`,
	);
}

export default defineConfig({
	root: agentDir,
	resolve: {
		alias: {
			"@earendil-works/pi-ai/providers/all": path.join(
				piNodeModules,
				"@earendil-works/pi-ai/dist/providers/all.js",
			),
			"@earendil-works/pi-coding-agent": path.join(
				piPackageRoot,
				"dist/index.js",
			),
			"@earendil-works/pi-ai/compat": path.join(
				piNodeModules,
				"@earendil-works/pi-ai/dist/compat.js",
			),
			"@earendil-works/pi-ai": path.join(
				piNodeModules,
				"@earendil-works/pi-ai/dist/index.js",
			),
			"@earendil-works/pi-tui": path.join(
				piNodeModules,
				"@earendil-works/pi-tui/dist/index.js",
			),
			"@earendil-works/pi-agent-core": path.join(
				piNodeModules,
				"@earendil-works/pi-agent-core/dist/index.js",
			),
		},
	},
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.test.ts"],
		setupFiles: ["tests/setup.ts"],
		mockReset: true,
		maxWorkers: process.platform === "win32" ? 4 : 8,
		testTimeout: 30000,
		hookTimeout: 30000,
		coverage: {
			provider: "v8",
			include: [
				"extensions/pwsh.ts",
				"extensions/web-tools.ts",
				"extensions/tool-search.ts",
				"extensions/workflow-commands.ts",
				"lib/model-routing.ts",
				"lib/commit/**",
				"lib/observability.ts",
			],
			reportsDirectory: "tests/coverage",
		},
	},
});
