// Compatibility entry point for existing web-tool validation commands.
import { fileURLToPath } from "node:url";
import config from "../vitest.config.ts";

export default {
  ...config,
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: { ...config.test, include: ["tests/web-tools*.test.ts"] },
};
