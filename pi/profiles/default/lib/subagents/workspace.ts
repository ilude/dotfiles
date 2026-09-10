import { realpathSync, statSync } from "node:fs";
import { isAbsolute, parse, relative, sep } from "node:path";
export function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}
export function workspaceRoot(value: string): string {
  const root = realpathSync.native(value);
  if (!statSync(root).isDirectory() || root === parse(root).root) throw new Error("Workspace must be a non-root existing directory");
  return root;
}
