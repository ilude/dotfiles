import path from "node:path";

function windowsPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^[\\/]{2}[^\\/]/.test(value);
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
