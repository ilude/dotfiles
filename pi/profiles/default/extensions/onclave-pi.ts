// Onclave owns the adapter. This profile only locates and loads it.
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function resolveOnclaveAdapter(start = dirname(realpathSync(fileURLToPath(import.meta.url)))): string {
  let current = start;
  for (;;) {
    const candidate = join(current, "modules", "onclave", "extensions", "onclave-pi", "src", "onclave-pi.ts");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) throw new Error("Onclave adapter source was not found. Initialize modules/onclave in this checkout.");
    current = parent;
  }
}

export default async function registerOnclave(pi: ExtensionAPI): Promise<void> {
  const adapter = await import(pathToFileURL(resolveOnclaveAdapter()).href);
  adapter.default(pi);
}
