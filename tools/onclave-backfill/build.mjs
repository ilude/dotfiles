import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const profile = join(root, "..", "..", "pi", "profiles", "default");
const tsc = join(profile, "node_modules", "typescript", "bin", "tsc");
execFileSync(process.execPath, [tsc, "-p", join(root, "tsconfig.build.json")], { cwd: profile, stdio: "inherit" });

async function patch(directory) {
  for (const name of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, name.name);
    if (name.isDirectory()) await patch(path);
    else if (name.name.endsWith(".js")) {
      const source = await readFile(path, "utf8");
      const patched = source.replace(/((?:from\s+|import\(\s*)["'])(\.[^"']+)(["'])/g, (match, prefix, specifier, quote) => {
        if (/\.(?:js|json|node)$/.test(specifier)) return match;
        return `${prefix}${specifier}.js${quote}`;
      });
      if (patched !== source) await writeFile(path, patched);
    }
  }
}
await patch(join(root, "dist"));
