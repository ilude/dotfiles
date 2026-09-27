import * as fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";

export type InstructionSource = {
  id: string;
  label: string;
  filePath: string;
  body: string;
  applyTo?: string;
};
export type DiscoveryResult = {
  boundary: string;
  sources: InstructionSource[];
  warnings: string[];
};

type Root = { owner: string; directory: string; realDirectory: string };
const MAX_WARNINGS = 8;
const MAX_SHELL_ARGS = 256;
const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

function warn(warnings: string[], message: string): void {
  if (warnings.length < MAX_WARNINGS && !warnings.includes(message)) warnings.push(message);
}
function relativeLabel(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}
function inside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`));
}
function realPathOrNearest(target: string): string | undefined {
  let current = target;
  const suffix: string[] = [];
  while (true) {
    try {
      const real = fs.realpathSync(current);
      return path.join(real, ...suffix);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code !== "ENOENT" && code !== "ENOTDIR") return undefined;
      const parent = path.dirname(current);
      if (parent === current) return undefined;
      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
}
function isDirectory(target: string): boolean {
  try { return fs.statSync(target).isDirectory(); } catch { return false; }
}
function ancestors(target: string, stop: string): string[] {
  const result: string[] = [];
  let current = target;
  while (inside(stop, current)) {
    result.push(current);
    if (current === stop) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return result;
}
function instructionRoot(owner: string): Root | undefined {
  const directory = path.join(owner, ".pi", "instructions");
  if (!isDirectory(directory)) return undefined;
  const realDirectory = realPathOrNearest(directory);
  if (!realDirectory) return undefined;
  return { owner, directory, realDirectory };
}
function globRegex(pattern: string): RegExp {
  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!;
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") {
          i++;
          source += "(?:.*/)?";
        } else source += ".*";
      } else source += "[^/]*";
    } else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}
export function matchesInstructionGlob(pattern: string, relativePath: string): boolean {
  const glob = pattern.replaceAll("\\", "/").replace(/^\.\//, "");
  const target = relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!glob || glob.startsWith("/") || /^[a-z]:\//i.test(glob)) return false;
  return globRegex(glob).test(target);
}

function parseInstructionText(source: string, filePath: string, label: string, warnings: string[]): InstructionSource | undefined {
  let body = source;
  let applyTo: string | undefined;
  if (source.startsWith("---\n") || source.startsWith("---\r\n")) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
    if (!match) {
      warn(warnings, `Invalid frontmatter: ${label}`);
      return undefined;
    }
    const document = parseDocument(match[1] ?? "", { version: "1.2", uniqueKeys: true, strict: true });
    let value: unknown;
    try { value = document.toJS({ maxAliasCount: 0 }); }
    catch {
      warn(warnings, `Invalid frontmatter: ${label}`);
      return undefined;
    }
    if (document.errors.length || document.warnings.length || !value || typeof value !== "object" || Array.isArray(value)) {
      warn(warnings, `Invalid frontmatter: ${label}`);
      return undefined;
    }
    const record = value as Record<string, unknown>;
    if (Object.hasOwn(record, "applyTo")) {
      if (typeof record.applyTo !== "string" || !record.applyTo.trim() || record.applyTo.includes("\0")) {
        warn(warnings, `Invalid applyTo frontmatter: ${label}`);
        return undefined;
      }
      applyTo = record.applyTo;
    }
    body = source.slice(match[0].length);
  }
  return { id: label, label, filePath, body, ...(applyTo === undefined ? {} : { applyTo }) };
}
function parseInstruction(filePath: string, boundary: string, warnings: string[]): InstructionSource | undefined {
  const label = relativeLabel(boundary, filePath);
  let source: string;
  try { source = fs.readFileSync(filePath, "utf8"); }
  catch { warn(warnings, `Unable to read instruction file: ${label}`); return undefined; }
  return parseInstructionText(source, filePath, label, warnings);
}

/** Re-read a reserved candidate after its tool operation, without changing call-time matching. */
export function readCurrentInstruction(source: InstructionSource, warnings: string[]): InstructionSource | undefined {
  let content: string;
  try { content = fs.readFileSync(source.filePath, "utf8"); }
  catch { warn(warnings, `Unable to read instruction file: ${source.label}`); return undefined; }
  const current = parseInstructionText(content, source.filePath, source.label, warnings);
  return current ? { ...source, body: current.body } : undefined;
}

function inventory(root: Root, boundary: string, warnings: string[]): InstructionSource[] {
  const files: string[] = [];
  const visited = new Set<string>();
  const walk = (directory: string): void => {
    let real: string;
    try { real = fs.realpathSync(directory); } catch { return; }
    if (!inside(root.realDirectory, real) || visited.has(real)) return;
    visited.add(real);
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const realFile = fs.realpathSync(target);
          if (inside(root.realDirectory, realFile)) files.push(target);
        } catch { /* A disappearing file is omitted from the inventory. */ }
      }
    }
  };
  walk(root.directory);
  return files.sort((a, b) => compareText(relativeLabel(root.directory, a), relativeLabel(root.directory, b)))
    .flatMap(file => {
      const source = parseInstruction(file, boundary, warnings);
      return source ? [source] : [];
    });
}

/** Index instructions from explicit targets. Paths outside the outer discovered root are ignored. */
export function discoverScopedInstructions(sessionCwd: string, targets: string[]): DiscoveryResult {
  const cwd = path.resolve(sessionCwd);
  const boundaryRoots: Root[] = [];
  for (const owner of [...ancestors(cwd, path.parse(cwd).root)].reverse()) {
    const root = instructionRoot(owner);
    if (root) boundaryRoots.push(root);
  }
  const boundary = boundaryRoots[0]?.owner ?? cwd;
  const boundaryReal = realPathOrNearest(boundary);
  const warnings: string[] = [];
  if (!boundaryReal) return { boundary, sources: [], warnings };
  const roots = new Map<string, Root>();
  for (const root of boundaryRoots) {
    if (inside(boundaryReal, root.realDirectory)) roots.set(root.realDirectory, root);
  }

  const resolvedTargets = targets.map(target => path.resolve(cwd, target));
  for (const target of resolvedTargets) {
    const realTarget = realPathOrNearest(target);
    if (!realTarget || !inside(boundaryReal, realTarget)) continue;
    const directory = isDirectory(target) ? target : path.dirname(target);
    for (const owner of ancestors(directory, boundary)) {
      const root = instructionRoot(owner);
      if (root && inside(boundaryReal, root.realDirectory)) roots.set(root.realDirectory, root);
    }
  }

  const targetRelativeByOwner = new Map<string, string[]>();
  for (const [realDirectory, root] of roots) {
    const scopedTargets: string[] = [];
    for (const target of resolvedTargets) {
      const realTarget = realPathOrNearest(target);
      if (!realTarget || !inside(boundaryReal, realTarget) || !inside(root.owner, target)) continue;
      scopedTargets.push(relativeLabel(root.owner, target));
    }
    targetRelativeByOwner.set(realDirectory, scopedTargets);
  }

  const orderedRoots = [...roots.values()].sort((a, b) => {
    const depth = (value: string) => value.split(path.sep).length;
    return depth(a.owner) - depth(b.owner) || compareText(relativeLabel(boundary, a.owner), relativeLabel(boundary, b.owner));
  });
  const sources: InstructionSource[] = [];
  for (const root of orderedRoots) {
    const relativeTargets = targetRelativeByOwner.get(root.realDirectory) ?? [];
    if (!relativeTargets.length) continue;
    for (const source of inventory(root, boundary, warnings)) {
      if (source.applyTo === undefined || relativeTargets.some(target => matchesInstructionGlob(source.applyTo!, target))) sources.push(source);
    }
  }
  return { boundary, sources, warnings };
}

function isPathLike(value: string): boolean {
  return !!value && !value.startsWith("-") && !/^(?:https?:|file:|data:)/i.test(value) &&
    !/[\$`*?{}]/.test(value) && !/^(?:\d+|[|&;<>]+)$/.test(value) &&
    (value.startsWith(".") || value.startsWith("~") || value.startsWith("/") || value.includes("/") || value.includes("\\") || /\.[A-Za-z0-9_-]{1,12}$/.test(value));
}
function shellWords(command: string, powershell: boolean): string[] {
  const result: string[] = [];
  command = command.slice(0, 32_768).replace(/\$\([^)]*\)|\$\{[^}]*\}|`[^`]*`/g, " ");
  let word = "";
  let quote = "";
  let escaped = false;
  for (const char of command) {
    if (escaped) { word += char; escaped = false; continue; }
    if (!powershell && char === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ""; else word += char; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/.test(char) || "|;&()<>".includes(char)) {
      if (word) result.push(word), word = "";
      if (result.length >= MAX_SHELL_ARGS) break;
    } else word += char;
  }
  if (word && result.length < MAX_SHELL_ARGS) result.push(word);
  return result;
}
const commandNames = new Set(["cat", "head", "tail", "less", "more", "open", "type", "get-content", "set-content", "add-content", "remove-item", "mkdir", "touch", "cp", "mv", "rm", "del", "ls", "dir", "find", "grep", "rg", "fd", "code", "notepad", "vim", "nano", "cd", "pushd", "set-location"]);
function shellTargets(command: string, powershell: boolean): string[] {
  const words = shellWords(command, powershell);
  const result: string[] = [];
  let commandPosition = true;
  let priorCommand = "";
  for (const word of words) {
    const lower = word.toLowerCase();
    if (commandPosition) {
      const base = path.win32.basename(lower);
      if (["cd", "pushd", "set-location"].includes(base)) { priorCommand = base; commandPosition = false; continue; }
      if (commandNames.has(base)) { priorCommand = base; commandPosition = false; continue; }
      commandPosition = false;
      continue;
    }
    if (commandNames.has(lower)) { priorCommand = lower; continue; }
    const navigationTarget = ["cd", "pushd", "set-location"].includes(priorCommand);
    const literalNavigation = navigationTarget && !!word && !word.startsWith("-") && !/[\u0000$`*?{}]/.test(word) && !/^(?:https?:|file:)/i.test(word);
    if (literalNavigation || isPathLike(word)) result.push(word);
  }
  return [...new Set(result)];
}

/** Extract only tool-argument targets; tool results and output text are intentionally not accepted. */
export function extractScopedInstructionTargets(toolName: string, args: unknown, cwd: string): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  const record = args as Record<string, unknown>;
  const targets: string[] = [];
  const add = (value: unknown) => { if (typeof value === "string" && value.trim()) targets.push(value); };
  if (["bash", "powershell", "pwsh"].includes(toolName.toLowerCase())) {
    const powershell = ["powershell", "pwsh"].includes(toolName.toLowerCase());
    for (const key of ["command", "script", "input"]) if (typeof record[key] === "string") targets.push(...shellTargets(record[key] as string, powershell));
    return [...new Set(targets)];
  }
  if (["grep", "find", "ls"].includes(toolName.toLowerCase()) && record.path === undefined) add(cwd);
  if (["read", "edit", "write", "grep", "find", "ls"].includes(toolName.toLowerCase())) add(record.path);
  for (const key of ["path", "file_path", "workdir"]) add(record[key]);
  return [...new Set(targets)];
}

/** Stable framing for a single batch of source bodies. */
export function formatScopedInstructions(sources: InstructionSource[]): string {
  if (!sources.length) return "";
  const blocks = sources.map(source => `<!-- pi-scoped-instruction:${source.id} -->\n${source.body}`);
  return `\n\n<scoped-project-instructions>\n${blocks.join("\n\n")}\n</scoped-project-instructions>`;
}
