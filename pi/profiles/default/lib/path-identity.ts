import path from "node:path";

function windowsPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^[\\/]{2}[^\\/]/.test(value);
}

/**
 * Repository IDs use / separators and . for the root; they are not native paths.
 * Only Windows treats backslashes as separators. Preserve POSIX literal names,
 * case, and path segments rather than turning unknown IDs into inventory entries.
 */
export function normalizeRepositoryId(value: string, style: "win32" | "posix" = process.platform === "win32" ? "win32" : "posix"): string {
  return style === "win32" ? value.replaceAll("\\", "/") : value;
}

/** Create an ID from absolute paths using the root's platform, on any host. */
export function repositoryId(root: string, repository: string): string {
  const style = windowsPath(root) ? "win32" : "posix";
  return normalizeRepositoryId(path[style].relative(root, repository) || ".", style);
}

/** Compare absolute path spellings using the semantics of the path's platform. */
export function samePlatformPath(left: string, right: string): boolean {
  return identity(left) === identity(right);
}

function identity(value: string): string {
  if (windowsPath(value)) {
    const normalized = path.win32.normalize(value.replaceAll("/", "\\"));
    const root = path.win32.parse(normalized).root;
    return (normalized.length === root.length ? root : normalized.replace(/[\\]+$/, "")).toLowerCase();
  }
  return path.posix.normalize(value).replace(/\/+$/, "") || "/";
}
