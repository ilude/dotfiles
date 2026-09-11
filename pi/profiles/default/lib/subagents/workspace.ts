import { realpathSync, statSync } from "node:fs";
import { parse } from "node:path";
export function workspaceRoot(value: string): string {
  const root = realpathSync.native(value);
  if (!statSync(root).isDirectory() || root === parse(root).root) throw new Error("Workspace must be a non-root existing directory");
  return root;
}
