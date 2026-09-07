import * as fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ShellSearch, ToolRequest } from "./types.ts";

export type SearchInventory = { status: "resolved"; paths: string[] } | { status: "unknown"; reason: string };
/** Filename-only native search inventory. Never opens matching file contents,
 * downloads binaries, or executes the model's search pattern as shell code. */
export async function enumerateSearch(request: ToolRequest, root: string, profile: string, signal?: AbortSignal): Promise<SearchInventory> {
  if (request.tool !== "grep" && request.tool !== "find") return { status: "unknown", reason: "Not a native search request" };
  const binary = request.tool === "grep" ? "rg" : "fd";
  const args = request.tool === "grep" ? ["--files", "--hidden", "--null"] : ["--glob", "--color=never", "--hidden", "--print0"];
  if (request.tool === "grep") {
    if (request.input.glob) args.push("--glob", request.input.glob);
    args.push("--", root);
  } else {
    let insideGit = false;
    for (let current = root;; current = path.dirname(current)) {
      try { await fs.access(path.join(current, ".git")); insideGit = true; break; } catch { /* Metadata only. */ }
      if (current === path.dirname(current)) break;
    }
    if (!insideGit) args.push("--no-require-git");
    // One extra result detects truncation rather than claiming complete scope.
    args.push("--max-results", "2001");
    let pattern = request.input.pattern;
    if (pattern.includes("/")) {
      args.push("--full-path");
      if (!pattern.startsWith("/") && !pattern.startsWith("**/") && pattern !== "**") pattern = `**/${pattern}`;
      if (process.platform === "win32") pattern = pattern.replaceAll("/", String.raw`[/\\]`);
    }
    args.push("--", pattern, root);
  }
  return runInventory(binary, args, request.cwd, profile, signal);
}

async function runInventory(binary: string, args: string[], cwd: string, profile: string, signal?: AbortSignal): Promise<SearchInventory> {
  if (binary === "rg" && process.env.RIPGREP_CONFIG_PATH) return { status: "unknown", reason: "External ripgrep configuration requires explicit scope resolution" };
  let executable = path.join(profile, "bin", binary + (process.platform === "win32" ? ".exe" : ""));
  try { await fs.access(executable); } catch { executable = binary; }
  if (signal?.aborted) return { status: "unknown", reason: "Search scope inspection cancelled" };
  return new Promise(resolve => {
    const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = []; let bytes = 0; let done = false;
    const finish = (result: SearchInventory) => {
      if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); child.kill(); resolve(result);
    };
    const abort = () => finish({ status: "unknown", reason: "Search scope inspection cancelled" });
    const timer = setTimeout(() => finish({ status: "unknown", reason: "Search scope inspection exceeded its 1500ms bound" }), 1500);
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 256 * 1024) finish({ status: "unknown", reason: "Search scope inventory exceeds its byte bound" });
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.on("error", () => finish({ status: "unknown", reason: `Native ${binary} metadata executable unavailable; search scope cannot be established` }));
    child.on("close", code => {
      if (done) return;
      if (code !== 0 && !(binary === "rg" && code === 1)) return finish({ status: "unknown", reason: "Native search metadata failed; scope unresolved" });
      const paths = Buffer.concat(chunks).toString("utf8").split("\0").filter(Boolean);
      finish(paths.length > 2000 ? { status: "unknown", reason: "Search scope exceeds its 2000-entry bound" } : { status: "resolved", paths });
    });
  });
}

const scopeValues = new Set(["-g", "--glob", "--iglob", "-t", "--type", "-T", "--type-not", "--type-add", "--type-clear", "--max-depth", "--max-filesize"]);
const dataValues = new Set(["-e", "--regexp", "-f", "--file", "-A", "-B", "-C", "--context", "-m", "--max-count", "-j", "--threads", "--encoding", "--engine", "--color", "--colors", "--replace"]);
const scopeFlags = new Set(["--hidden", "--no-hidden", "--no-ignore", "--no-ignore-vcs", "--no-ignore-parent", "--no-ignore-global", "--follow", "--no-follow", "--one-file-system"]);
const dataFlags = new Set(["--files", "--line-number", "--no-line-number", "--fixed-strings", "--ignore-case", "--smart-case", "--word-regexp", "--line-regexp", "--invert-match", "--count", "--count-matches", "--files-with-matches", "--files-without-match", "--quiet", "--no-messages", "--json", "--heading", "--no-heading", "--null", "--text", "--binary", "--pcre2", "--multiline", "--multiline-dotall", "--no-mmap", "--mmap"]);
export type SearchArgument = { known: true; value: string } | { known: false; expression: string; reason: string };

/** One argv pass supplies both shell effects and safe filename-only inventory.
 * Unknown/preprocessor/configuration options never reach the subprocess. */
export function parseSearchArguments(executable: "grep" | "rg", args: readonly SearchArgument[]) {
  const files: SearchArgument[] = [];
  const patternFiles: SearchArgument[] = [];
  const inventoryArgs = ["--files", "--null"];
  const metadataOnly = executable === "rg" && args.some(item => item.known && item.value === "--files");
  const recursive = args.some(item => item.known && (item.value === "--recursive" || /^-[^-]*[rR]/.test(item.value)));
  let hasPattern = metadataOnly;
  let unresolvedPattern: SearchArgument | undefined;
  let literal = false;
  let safeInventory = args.every(item => item.known && !item.value.includes("\0"));
  for (let i = 0; i < args.length; i++) {
    const item = args[i];
    if (!item.known) {
      if (!hasPattern) { hasPattern = true; unresolvedPattern = item; } else files.push(item);
      continue;
    }
    const arg = item.value;
    if (arg === "--" && !literal) { literal = true; continue; }
    if (literal || !arg.startsWith("-")) {
      if (!hasPattern) hasPattern = true; else files.push(item);
      continue;
    }
    const key = arg.split("=", 1)[0];
    if (scopeValues.has(key) || dataValues.has(key) || key === "--ignore-file" || key === "--pre") {
      const value: SearchArgument | undefined = arg.includes("=") ? { known: true, value: arg.slice(arg.indexOf("=") + 1) } : args[++i];
      if (!value?.known) safeInventory = false;
      if (scopeValues.has(key)) {
        inventoryArgs.push(arg);
        if (!arg.includes("=") && value?.known) inventoryArgs.push(value.value);
      } else if (key === "-e" || key === "--regexp") {
        hasPattern = true;
        if (!value?.known) unresolvedPattern = value;
      } else if (key === "-f" || key === "--file") {
        hasPattern = true;
        patternFiles.push(value ?? { known: false, expression: "<missing>", reason: `${executable} pattern file is missing` });
      } else if (key === "--ignore-file" || key === "--pre") safeInventory = false;
    } else if (/^-[gtT].+/.test(arg)) inventoryArgs.push(arg);
    else if (/^-[ef].+/.test(arg)) {
      hasPattern = true;
      if (arg[1] === "f") patternFiles.push({ known: true, value: arg.slice(2) });
    } else if (scopeFlags.has(arg)) inventoryArgs.push(arg);
    else if (dataFlags.has(arg) || /^-[ABCmj]\d+$/.test(arg)) continue;
    else if (/^-[nHiwFvscqlNazoxSIPUubL]+$/.test(arg)) {
      const unrestricted = [...arg].filter(char => char === "u").length;
      if (unrestricted) inventoryArgs.push("--no-ignore");
      if (unrestricted > 1) inventoryArgs.push("--hidden");
      if (arg.includes("L")) inventoryArgs.push("--follow");
    } else safeInventory = false;
  }
  return { files, patternFiles, metadataOnly, recursive, hasPattern, unresolvedPattern, inventoryArgs: safeInventory ? inventoryArgs : undefined };
}

export function rgInventoryArgs(search: ShellSearch, root: string): string[] | undefined {
  return search.inventoryArgs ? [...search.inventoryArgs, "--", root] : undefined;
}

export async function enumerateShellRg(search: ShellSearch, root: string, cwd: string, profile: string, signal?: AbortSignal): Promise<SearchInventory> {
  const args = rgInventoryArgs(search, root);
  return args ? runInventory("rg", args, cwd, profile, signal) : { status: "unknown", reason: "Ripgrep arguments or configuration require a transparent supported search rewrite" };
}
