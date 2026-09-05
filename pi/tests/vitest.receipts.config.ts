import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sdkRoot = process.env.PI_TEST_SDK_ROOT?.trim();
if (!sdkRoot) {
	throw new Error(
		"PI_TEST_SDK_ROOT is required for the actual-SDK receipt seam test; set it to the maintained SDK source worktree.",
	);
}

const sdk = path.resolve(sdkRoot);
if (!fs.existsSync(sdk)) {
	throw new Error(`PI_TEST_SDK_ROOT does not exist: ${sdk}`);
}

const source = (relativePath: string) => path.join(sdk, relativePath);

export default defineConfig({
	root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
	resolve: {
		alias: [
			{ find: /^@earendil-works\/pi-telemetry$/, replacement: source("packages/telemetry/src/index.ts") },
			{ find: /^@earendil-works\/pi-telemetry\/testing$/, replacement: source("packages/telemetry/src/testing/index.ts") },
			{ find: /^@earendil-works\/pi-ai$/, replacement: source("packages/ai/src/index.ts") },
			{ find: /^@earendil-works\/pi-ai\/compat$/, replacement: source("packages/ai/src/compat.ts") },
			{ find: /^@earendil-works\/pi-ai\/oauth$/, replacement: source("packages/ai/src/oauth.ts") },
			{ find: /^@earendil-works\/pi-ai\/providers\/(.+)$/, replacement: `${source("packages/ai/src/providers")}/$1.ts` },
			{ find: /^@earendil-works\/pi-agent-core$/, replacement: source("packages/agent/src/index.ts") },
			{ find: /^@earendil-works\/pi-tui$/, replacement: source("packages/tui/src/index.ts") },
			{ find: /^@earendil-works\/pi-coding-agent$/, replacement: source("packages/coding-agent/src/index.ts") },
		],
	},
	test: {
		globals: true,
		environment: "node",
		include: ["tests/background-receipts.sdk.ts"],
		setupFiles: ["tests/setup.ts"],
		testTimeout: 30000,
		hookTimeout: 30000,
	},
});
