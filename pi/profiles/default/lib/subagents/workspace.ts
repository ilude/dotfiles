import { lstatSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
const native = new Set(["read", "write", "edit", "grep", "find", "ls"]);
export function canonicalPath(path: string): string {
  let at = resolve(path);
  const missing: string[] = [];
  for (;;) {
    try {
      // A dangling symlink is not a missing leaf that may be safely appended.
      lstatSync(at);
      const actual = realpathSync.native(at);
      if (missing.length && !statSync(actual).isDirectory()) throw new Error("Path ancestor is not a directory");
      return resolve(actual, ...missing);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try { if (lstatSync(at).isSymbolicLink()) throw new Error("Dangling symbolic link"); } catch (probe) { if ((probe as NodeJS.ErrnoException).code !== "ENOENT") throw probe; }
      const parent = dirname(at);
      if (at === parent) throw new Error("No existing path ancestor");
      missing.unshift(basename(at));
      at = parent;
    }
  }
}
export function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}
export function workspaceRoot(value: string): string {
  const root = realpathSync.native(value);
  if (!statSync(root).isDirectory() || root === parse(root).root) throw new Error("Workspace must be a non-root existing directory");
  return root;
}
export function guardNativePath(root: string, skills: readonly string[], tool: string, input: Record<string, unknown>): void {
  if (!native.has(tool)) return;
  const value = input.path ?? (new Set(["grep", "find", "ls"]).has(tool) ? "." : undefined);
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error("Native tool requires a valid path");
  const target = canonicalPath(resolve(root, value));
  if (inside(root, target)) return;
  if (tool === "read" && skills.some(skill => target === canonicalPath(skill))) return;
  throw new Error("Native path is outside the assigned workspace");
}
