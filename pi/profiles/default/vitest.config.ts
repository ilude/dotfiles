import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@earendil-works/pi-coding-agent": fileURLToPath(new URL("./tests/pi-web-api.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 15_000,
    // Loopback fetch children exceeded their deadlines with unbounded Windows workers.
    // The same full suite passed with four workers.
    maxWorkers: 4,
    coverage: { enabled: false },
  },
});
