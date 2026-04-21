import { defineConfig } from "vitest/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentDir = path.resolve(__dirname, "..").replace(/\\/g, "/");

function resolvePiNodeModules() {
  const candidates = [
    path.join(
      process.env.BUN_INSTALL || path.join(os.homedir(), ".bun"),
      "install/global/node_modules"
    ),
    path.join(process.env.APPDATA || "", "npm/node_modules"),
  ].filter(Boolean);

  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(
      `Could not locate pi-coding-agent node_modules. Checked: ${candidates.join(", ")}`
    );
  }
  return match;
}

const piNodeModules = resolvePiNodeModules();
const piPackageRoot = path.join(piNodeModules, "@mariozechner/pi-coding-agent");

export default defineConfig({
  root: agentDir,
  resolve: {
    alias: {
      "@mariozechner/pi-coding-agent": path.join(piPackageRoot, "dist/index.js"),
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
