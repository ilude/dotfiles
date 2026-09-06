import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function createDisposableRemediation(root) {
  await mkdir(path.join(root, "worktree"), { recursive: true });
  await writeFile(path.join(root, "worktree", "README.md"), "fixture-only remediation\n");
  return path.join(root, "worktree");
}
