import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentDir = path.resolve(__dirname, "..").replace(/\\/g, "/");

// Pi TypeScript dependencies are managed by pi/extensions/pnpm-lock.yaml.
// Keep tests pointed at that pnpm install instead of global runtime packages.
const extensionsNodeModules = path.resolve(__dirname, "../extensions/node_modules");
const piPackageRoot = path.join(extensionsNodeModules, "@earendil-works/pi-coding-agent");
const piNodeModules = extensionsNodeModules;
const typeboxDir = path.join(extensionsNodeModules, "@sinclair/typebox");

if (!fs.existsSync(piPackageRoot)) {
  throw new Error(
    `Could not locate pnpm-managed Pi dependencies at ${extensionsNodeModules}. Run: cd pi/extensions && pnpm install --frozen-lockfile`
  );
}

export default defineConfig({
  root: agentDir,
  resolve: {
    alias: {
      "@earendil-works/pi-coding-agent": path.join(piPackageRoot, "dist/index.js"),
      "@earendil-works/pi-ai/oauth": path.join(piNodeModules, "@earendil-works/pi-ai/dist/oauth.js"),
      "@earendil-works/pi-ai": path.join(piNodeModules, "@earendil-works/pi-ai/dist/index.js"),
      "@earendil-works/pi-tui": path.join(piNodeModules, "@earendil-works/pi-tui/dist/index.js"),
      "@earendil-works/pi-agent-core": path.join(piNodeModules, "@earendil-works/pi-agent-core/dist/index.js"),
      "@sinclair/typebox": typeboxDir,
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    mockReset: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      include: [
        "extensions/pwsh.ts",
        "extensions/web-tools.ts",
        "extensions/ask-user.ts",
        "extensions/tool-search.ts",
        "extensions/todo.ts",
        "extensions/workflow-commands.ts",
        "extensions/prompt-router.ts",
        "extensions/agent-chain.ts",
        "lib/model-routing.ts",
        "lib/commit/**",
        "lib/observability.ts",
      ],
      reportsDirectory: "tests/coverage",
    },
  },
});
