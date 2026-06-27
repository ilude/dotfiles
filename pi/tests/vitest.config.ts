import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentDir = path.resolve(__dirname, "..").replace(/\\/g, "/");

// Pi TypeScript dependencies live at pi/node_modules: native deps via
// pi/package.json + pnpm install, and @earendil-works/@sinclair scopes via
// pi-deps-link-setup symlinking pnpm-global into pi/node_modules.
const piNodeModules = path.resolve(__dirname, "../node_modules");
const piPackageRoot = path.join(piNodeModules, "@earendil-works/pi-coding-agent");
const typeboxDir = path.join(piNodeModules, "@sinclair/typebox");

if (!fs.existsSync(piPackageRoot)) {
  throw new Error(
    `Could not locate Pi dependencies at ${piNodeModules}. Run: ~/.dotfiles/install`
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
