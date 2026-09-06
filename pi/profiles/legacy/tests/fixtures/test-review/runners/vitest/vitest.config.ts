import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.fixture.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  projects: [
    {
      test: {
        name: "unit",
        include: ["tests/**/*.fixture.ts"],
        setupFiles: ["tests/setup.ts"],
      },
    },
  ],
});
