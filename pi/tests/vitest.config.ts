import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentDir = path.resolve(__dirname, "..").replace(/\\/g, "/");

const piNodeModules = path.join(
  process.env.APPDATA || "",
  "npm/node_modules/@mariozechner/pi-coding-agent/node_modules"
);

export default defineConfig({
  root: agentDir,
  resolve: {
    alias: {
      "@mariozechner/pi-coding-agent": path.join(piNodeModules, "../dist/index.js"),
      "@mariozechner/pi-ai": path.join(piNodeModules, "@mariozechner/pi-ai/dist/index.js"),
      "@mariozechner/pi-tui": path.join(piNodeModules, "@mariozechner/pi-tui/dist/index.js"),
      "@mariozechner/pi-agent-core": path.join(piNodeModules, "@mariozechner/pi-agent-core/dist/index.js"),
      "@sinclair/typebox": path.join(piNodeModules, "@sinclair/typebox"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    mockReset: true,
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
        "lib/model-routing.ts",
      ],
      reportsDirectory: "tests/coverage",
    },
  },
});
