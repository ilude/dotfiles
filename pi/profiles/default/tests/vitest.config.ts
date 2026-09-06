import { fileURLToPath } from "node:url";
import legacy from "../../legacy/tests/vitest.config.ts";

export default {
  ...legacy,
  root: fileURLToPath(new URL("..", import.meta.url)),
  resolve: { alias: { ...legacy.resolve.alias, "@earendil-works/pi-coding-agent": fileURLToPath(new URL("./pi-web-api.ts", import.meta.url)), typebox: fileURLToPath(new URL("../../legacy/node_modules/typebox/build/index.mjs", import.meta.url)) } },
  test: { ...legacy.test, include: ["tests/web-tools*.test.ts"], setupFiles: [], coverage: { enabled: false } },
};
