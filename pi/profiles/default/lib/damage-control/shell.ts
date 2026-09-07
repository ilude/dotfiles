import { open, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import * as TreeSitter from "web-tree-sitter";
import { parseSearchArguments, type SearchArgument } from "./search.ts";
import { sqlExecutableText } from "./sql.ts";
import type { Analysis, CompiledRule, DockerEndpoint, DockerEnvironmentKey, DockerInvocation, Effect, Language, RuleMatch, ShellSearch, Target, ToolRequest } from "./types.ts";

const SCRIPT_BYTE_LIMIT = 64 * 1024;
const NESTING_LIMIT = 8;
const UNKNOWN_CONTAINER_CWD = "/__damage_control_unknown_container_workdir__";

export type ShellDependencies = {
  rules?: readonly CompiledRule[];
  parseBudgetMs?: number;
  now?: () => number;
  home?: string;
  repositoryRoot?: string;
  /** Must return at most maxBytes bytes. The analyzer independently checks the result. */
  readScript?: (absolutePath: string, maxBytes: number) => Promise<string | undefined>;
  realpath?: (absolutePath: string) => Promise<string>;
  /** Metadata-only authorization, consulted after realpath and before readScript/open. */
  canReadScript?: (absolutePath: string) => Promise<boolean>;
  /** Effective default Docker context/daemon, when established by the host. */
  dockerContext?: string;
};

const require = createRequire(import.meta.url);
let initialized: Promise<void> | undefined;
const grammarFiles: Record<Language, string> = {
  bash: "tree-sitter-bash/tree-sitter-bash.wasm",
  powershell: "tree-sitter-powershell/tree-sitter-powershell.wasm",
  python: "tree-sitter-python/tree-sitter-python.wasm",
  javascript: "tree-sitter-javascript/tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript/tree-sitter-typescript.wasm",
};
const languages = new Map<Language, TreeSitter.Language>();

async function grammar(language: Language): Promise<TreeSitter.Language> {
  initialized ??= TreeSitter.Parser.init();
  await initialized;
  const cached = languages.get(language);
  if (cached) return cached;
  // A missing/incompatible required grammar is an enforcement failure, unlike a
  // valid parse which merely reaches its configured deadline.
  const loaded = await TreeSitter.Language.load(require.resolve(grammarFiles[language]));
  languages.set(language, loaded);
  return loaded;
}

export async function requireGrammars(): Promise<void> {
  await grammar("bash");
}

function unknown(expression: string, reason: string): Target {
  return { resolution: "unknown", expression, reason };
}

function staticTarget(value: string, cwd: string, home: string): Target {
  if (!value || /\0/.test(value)) return unknown(value, "target is empty or contains NUL");
  if (cwd === UNKNOWN_CONTAINER_CWD && (value === "~" || value.startsWith("~/"))) return unknown(value, "Docker exec container home is not established");
  if (/[*?\[]/.test(value)) return unknown(value, "target contains a glob");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return { resolution: "static", path: value };
  const containerPath = cwd.startsWith("/");
  const p = containerPath ? path.posix : path;
  const expanded = value === "~" ? home : value.startsWith("~/") || value.startsWith("~\\") ? p.join(home, value.slice(2)) : value;
  return { resolution: "static", path: p.resolve(cwd, expanded) };
}

function resourceTarget(value: string, scheme: string): Target {
  if (!value || /[$%*?`]/.test(value)) return unknown(value, "resource identity is dynamically resolved");
  return { resolution: "static", path: `${scheme}://${value}` };
}

type Scope = { cwd: string; stdinOwner?: number; variables: Map<string, string>; unknownVariables: Set<string>; functions: Map<string, TreeSitter.Node> };
type Value = SearchArgument;
type CommandRecord = { text: string; language: Language; executableEnd: number; effects: string[]; matchable: boolean };
type State = {
  effects: Effect[];
  uncertainties: string[];
  records: CommandRecord[];
  nextEffect: number;
  budget: number;
  now: () => number;
  home: string;
  dependencies: ShellDependencies;
  repositoryRoot: string;
  docker: DockerInvocation[];
  searches: ShellSearch[];
  semanticMatches: RuleMatch[];
};

function valueTarget(value: Value, cwd: string, home: string): Target {
  return value.known ? staticTarget(value.value, cwd, home) : unknown(value.expression, value.reason);
}

function addEffect(
  state: State,
  kind: Effect["kind"],
  operation: Effect["operation"],
  scope: Scope,
  language: Language,
  executable: string,
  range: { start: number; end: number },
  targets: Target[] = [],
  sources: Target[] = [],
  destinations: Target[] = [],
  reason?: string,
): Effect {
  const unresolved = [...targets, ...sources, ...destinations].find((item) => item.resolution === "unknown");
  const why = reason ?? (unresolved?.resolution === "unknown" ? unresolved.reason : undefined);
  const base = {
    id: `effect-${++state.nextEffect}`,
    kind,
    operation,
    sources,
    targets,
    destinations,
    context: { cwd: scope.cwd, language, executable },
    range,
  };
  const result: Effect = why ? { ...base, resolution: "unknown", reason: why } : { ...base, resolution: "static" };
  state.effects.push(result);
  return result;
}

function addUnknown(state: State, scope: Scope, language: Language, executable: string, range: { start: number; end: number }, reason: string, expression = executable): Effect {
  state.uncertainties.push(reason);
  return addEffect(state, "execution", "unknown", scope, language, executable, range, [unknown(expression, reason)], [], [], reason);
}

function addOpaqueExecution(state: State, scope: Scope, language: Language, executable: string, range: { start: number; end: number }, reason: string): Effect {
  state.uncertainties.push(reason);
  return addEffect(state, "execution", "execute", scope, language, executable, range, [], [], [], reason);
}

function cloneScope(scope: Scope): Scope {
  return { cwd: scope.cwd, stdinOwner: scope.stdinOwner, variables: new Map(scope.variables), unknownVariables: new Set(scope.unknownVariables), functions: new Map(scope.functions) };
}

function shellVariable(name: string, scope: Scope): Value {
  const key = name.replace(/^\$\{?|\}$/g, "");
  const found = scope.variables.get(key);
  return found === undefined
    ? { known: false, expression: name, reason: `variable ${name} is ${scope.unknownVariables.has(key) ? "not statically resolved" : "not statically assigned"}` }
    : { known: true, value: found };
}

function decodeBashText(text: string, scope: Scope): Value {
  if (text.startsWith("'") && text.endsWith("'")) return { known: true, value: text.slice(1, -1) };
  let body = text;
  let double = false;
  if (body.startsWith('"') && body.endsWith('"')) { body = body.slice(1, -1); double = true; }
  let result = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\" && i + 1 < body.length) {
      const next = body[++i];
      if (!double || ['"', "\\", "$", "`", "\n"].includes(next)) result += next === "\n" ? "" : next;
      else result += `\\${next}`;
      continue;
    }
    if (c === "$" && body[i + 1] === "(") return { known: false, expression: text, reason: "command substitution does not have a static string value" };
    if (c === "`" || c === "*" || c === "?") return { known: false, expression: text, reason: "shell expansion is not statically resolved" };
    if (c === "$" && body[i + 1] === "{") {
      const end = body.indexOf("}", i + 2);
      if (end < 0) return { known: false, expression: text, reason: "unterminated variable expansion" };
      const variable = shellVariable(body.slice(i, end + 1), scope);
      if (!variable.known) return variable;
      result += variable.value; i = end; continue;
    }
    if (c === "$" && /[A-Za-z_]/.test(body[i + 1] ?? "")) {
      const match = body.slice(i + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/)!;
      const variable = shellVariable(`$${match[0]}`, scope);
      if (!variable.known) return variable;
      result += variable.value; i += match[0].length; continue;
    }
    if (c === "$") return { known: false, expression: text, reason: "special or positional shell expansion is not statically assigned" };
    result += c;
  }
  return { known: true, value: result };
}

function decodePowerShellText(text: string, scope: Scope): Value {
  if (text.startsWith("'") && text.endsWith("'")) return { known: true, value: text.slice(1, -1).replaceAll("''", "'") };
  let body = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
  if (/^(?:-whatif:)?\$(?:true|false)$/i.test(body)) return { known: true, value: body };
  body = body.replace(/`([`"'$])/g, "$1");
  let unresolved: Value | undefined;
  const value = body.replace(/\$(?:\{([A-Za-z_][\w:]*)\}|([A-Za-z_][\w:]*))/g, (whole, braced: string, plain: string) => {
    const key = (braced ?? plain).toLowerCase();
    const found = scope.variables.get(key);
    if (found === undefined) { unresolved = { known: false, expression: whole, reason: `variable ${whole} is not statically assigned` }; return whole; }
    return found;
  });
  if (unresolved) return unresolved;
  if (/\$\(|@\(/.test(body)) return { known: false, expression: text, reason: "PowerShell subexpression is not a static string" };
  return { known: true, value };
}

function decoded(node: TreeSitter.Node, language: Language, scope: Scope): Value {
  return language === "bash" ? decodeBashText(node.text, scope) : decodePowerShellText(node.text, scope);
}

function rangeOf(node: TreeSitter.Node, offset: number, forced?: { start: number; end: number }): { start: number; end: number } {
  return forced ?? { start: offset + node.startIndex, end: offset + node.endIndex };
}

async function parse(language: Language, source: string, state: State): Promise<{ tree?: TreeSitter.Tree; timedOut: boolean }> {
  const loaded = await grammar(language);
  const parser = new TreeSitter.Parser();
  try {
    parser.setLanguage(loaded);
    const deadline = state.now() + state.budget;
    // web-tree-sitter 0.26.9's declaration says void, but its documented and
    // implemented callback return value cancels parsing. A boolean-returning
    // function is assignable to a void callback, so no unsafe cast is needed.
    const tree = parser.parse(source, null, { progressCallback: () => state.now() >= deadline });
    return tree ? { tree, timedOut: false } : { timedOut: true };
  } finally {
    parser.delete();
  }
}

function commandArguments(node: TreeSitter.Node, language: Language): TreeSitter.Node[] {
  if (language === "bash") return node.childrenForFieldName("argument");
  const elements = node.childForFieldName("command_elements");
  if (!elements) return [];
  return elements.namedChildren
    .filter((child) => child.type !== "command_argument_sep" && child.type !== "redirection")
    .flatMap((child) => child.type === "array_literal_expression" && child.namedChildren.length > 1 ? child.namedChildren : [child]);
}

function commandNameNode(node: TreeSitter.Node): TreeSitter.Node | undefined {
  return node.childForFieldName("name") ?? node.childForFieldName("command_name") ?? undefined;
}

const psAliases: Record<string, string> = {
  ri: "remove-item", rm: "remove-item", del: "remove-item", erase: "remove-item", rd: "remove-item", rmdir: "remove-item",
  gc: "get-content", cat: "get-content", type: "get-content", echo: "write-output",
  cd: "set-location", chdir: "set-location", sl: "set-location", cls: "clear-host",
  wget: "invoke-webrequest", iwr: "invoke-webrequest", curl: "invoke-webrequest",
};

function executableName(value: string, language: Language): string {
  const clean = value.replace(/^&\s*/, "").replace(/^.*[\\/]/, "").replace(/\.(?:exe|cmd|bat)$/i, "").toLowerCase();
  return language === "powershell" ? (psAliases[clean] ?? clean) : clean;
}

type NormalizedInvocation = {
  executable: string;
  actualArgs: Value[];
  wrappers: string[];
  environmentAssignments: Map<string, string>;
  unresolved?: { executable: string; reason: string; expression: string };
};

function normalizeInvocation(rawExecutable: Value, args: Value[], language: Language): NormalizedInvocation | undefined {
  if (!rawExecutable.known) return undefined;
  let executable = executableName(rawExecutable.value, language);
  let actualArgs = args;
  const wrappers: string[] = [];
  const environmentAssignments = new Map<string, string>();
  while (["sudo", "env", "command", "nohup"].includes(executable)) {
    wrappers.push(executable);
    let i = 0;
    while (i < actualArgs.length) {
      const option = actualArgs[i];
      if (!option?.known) break;
      if (option.value === "--") { i++; break; }
      if (executable === "env" && /^[A-Za-z_][A-Za-z0-9_]*=/.test(option.value)) {
        const equals = option.value.indexOf("=");
        environmentAssignments.set(option.value.slice(0, equals), option.value.slice(equals + 1));
        i++;
        continue;
      }
      if (!option.value.startsWith("-")) break;
      const optionName = option.value.split("=", 1)[0];
      const takesValue = executable === "sudo"
        ? ["-u", "-g", "-h", "-p", "-C", "-T", "--user", "--group", "--host", "--prompt", "--close-from", "--command-timeout"].includes(optionName)
        : executable === "env"
          ? ["-u", "--unset", "-C", "--chdir", "-S", "--split-string"].includes(optionName)
          : false;
      i += takesValue && !option.value.includes("=") ? 2 : 1;
    }
    const next = actualArgs[i];
    if (!next?.known) {
      return {
        executable,
        actualArgs,
        wrappers,
        environmentAssignments,
        unresolved: {
          executable,
          reason: `${executable} wrapped executable is unresolved`,
          expression: next && !next.known ? next.expression : "<missing>",
        },
      };
    }
    executable = executableName(next.value, language);
    actualArgs = actualArgs.slice(i + 1);
  }
  return { executable, actualArgs, wrappers, environmentAssignments };
}

function optionOperands(values: Value[], optionsWithValues: Set<string>): Value[] {
  const result: Value[] = [];
  let literal = false;
  for (let i = 0; i < values.length; i++) {
    const item = values[i];
    if (!item.known) { result.push(item); continue; }
    if (!literal && item.value === "--") { literal = true; continue; }
    if (!literal && optionsWithValues.has(item.value.toLowerCase())) { if (i + 1 < values.length) i++; continue; }
    if (!literal && item.value.startsWith("-")) continue;
    result.push(item);
  }
  return result;
}

function targets(values: Value[], scope: Scope, state: State): Target[] {
  return values.map((item) => valueTarget(item, scope.cwd, state.home));
}

function operationAfterOptions(args: Value[], optionsWithValues: Set<string>): { command?: string; rest: Value[] } {
  let i = 0;
  while (i < args.length) {
    const item = args[i];
    if (!item.known) return { rest: args.slice(i) };
    if (item.value === "--") { i++; break; }
    if (!item.value.startsWith("-")) break;
    const key = item.value.split("=", 1)[0].toLowerCase();
    i += optionsWithValues.has(key) && !item.value.includes("=") ? 2 : 1;
  }
  const command = args[i];
  return { command: command?.known ? command.value.toLowerCase() : undefined, rest: args.slice(i + 1) };
}

function requireOperands(state: State, items: Target[], scope: Scope, language: Language, executable: string, range: { start: number; end: number }, operation: Effect["operation"], kind: Effect["kind"] = "filesystem"): Effect {
  if (!items.length) {
    const reason = `${executable} is missing a required operand`;
    state.uncertainties.push(reason);
    return addEffect(state, kind, operation, scope, language, executable, range, [unknown("<missing>", reason)], [], [], reason);
  }
  return addEffect(state, kind, operation, scope, language, executable, range, items);
}

function parseGit(args: Value[]): { subcommand?: string; operands: Value[]; directories: Value[] } {
  const takesValue = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);
  const directories: Value[] = [];
  let i = 0;
  while (i < args.length) {
    const value = args[i];
    if (!value.known) return { operands: args.slice(i), directories };
    if (!value.value.startsWith("-")) break;
    const attachedDirectory = value.value.startsWith("-C") && value.value !== "-C" ? value.value.slice(2) : undefined;
    const key = attachedDirectory !== undefined ? "-C" : value.value.split("=")[0];
    if (key === "-C") {
      const directory = attachedDirectory === undefined ? args[i + 1] : { known: true as const, value: attachedDirectory };
      if (directory) directories.push(directory);
    }
    if (takesValue.has(key) && !value.value.includes("=") && attachedDirectory === undefined) i += 2; else i++;
  }
  const command = args[i];
  if (!command?.known) return { operands: args.slice(i), directories };
  return { subcommand: command.value.toLowerCase(), operands: args.slice(i + 1), directories };
}

type DockerFacts = { subcommand?: string; rest: Value[]; context?: string; uncertain?: string; dynamic: boolean; endpoint: DockerEndpoint };
const dockerEnvironmentKeys: DockerEnvironmentKey[] = ["DOCKER_CONTEXT", "DOCKER_HOST", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"];

function dockerEnvironment(scope?: Scope): { values: Partial<Record<DockerEnvironmentKey, string>>; unresolved?: string } {
  const values: Partial<Record<DockerEnvironmentKey, string>> = {};
  if (!scope) return { values };
  for (const key of dockerEnvironmentKeys) {
    const candidates = [key, key.toLowerCase(), `env:${key.toLowerCase()}`];
    const unknownKey = candidates.find(candidate => scope.unknownVariables.has(candidate));
    if (unknownKey) return { values, unresolved: `${key} is assigned but not statically resolved` };
    const found = candidates.map(candidate => scope.variables.get(candidate)).find(value => value !== undefined);
    if (found !== undefined) values[key] = found;
  }
  return { values };
}

function dockerFacts(args: Value[], defaultContext?: string, scope?: Scope): DockerFacts {
  const environment = dockerEnvironment(scope);
  let dynamic = environment.unresolved !== undefined;
  let uncertain = environment.unresolved;
  let context = environment.values.DOCKER_CONTEXT || defaultContext;
  let host = environment.values.DOCKER_HOST || undefined;
  const globalArgs: string[] = [];
  let i = 0;
  const valueOptions = new Set(["--context", "-c", "-H", "--host", "--config", "--log-level", "--tlscacert", "--tlscert", "--tlskey"]);
  const forwarded = new Set(["--context", "-c", "-H", "--host", "--config", "--tls", "--tlsverify", "--tlscacert", "--tlscert", "--tlskey"]);
  while (i < args.length) {
    const item = args[i];
    if (!item.known) {
      uncertain = "Docker global option or context is dynamically resolved";
      const endpoint: DockerEndpoint = { executable: "docker", cwd: scope?.cwd ?? process.cwd(), globalArgs, environment: environment.values, contextHint: context, hostOverride: host, unresolved: uncertain };
      return { rest: args.slice(i), context, uncertain, dynamic: true, endpoint };
    }
    const raw = item.value;
    if (!raw.startsWith("-") || raw === "-") break;
    let key = raw.split("=", 1)[0];
    let attached = raw.includes("=") ? raw.slice(raw.indexOf("=") + 1) : undefined;
    if (/^-H.+/.test(raw) && !raw.startsWith("-H=")) { key = "-H"; attached = raw.slice(2); }
    if (/^-c.+/.test(raw) && !raw.startsWith("-c=")) { key = "-c"; attached = raw.slice(2); }
    let optionValue: Value | undefined;
    if (valueOptions.has(key)) {
      optionValue = attached === undefined ? args[++i] : { known: true, value: attached };
      if (!optionValue?.known) {
        uncertain = `Docker ${key} value is missing or dynamically resolved`;
        dynamic = true;
      }
    }
    if (forwarded.has(key)) {
      globalArgs.push(raw);
      if (valueOptions.has(key) && attached === undefined && optionValue?.known) globalArgs.push(optionValue.value);
    }
    if (optionValue?.known) {
      if (key === "--context" || key === "-c") context = optionValue.value;
      if (key === "--host" || key === "-H") host = optionValue.value;
    }
    i++;
  }
  if (!uncertain && !context && !host) uncertain = "Effective Docker context/daemon is not established";
  const endpoint: DockerEndpoint = {
    executable: "docker", cwd: scope?.cwd ?? process.cwd(), globalArgs, environment: environment.values,
    contextHint: context, hostOverride: host, ...(dynamic ? { unresolved: uncertain } : {}),
  };
  const command = args[i];
  const subcommand = command?.known ? command.value.toLowerCase() : undefined;
  return { subcommand, rest: args.slice(i + 1), context: host ?? context, uncertain, dynamic, endpoint };
}

function dockerOperation(subcommand: string, rest: Value[]): { subcommand: string; rest: Value[] } {
  if (!["container", "volume", "image", "system", "compose"].includes(subcommand)) return { subcommand, rest };
  let i = 0;
  const composeValueOptions = new Set(["-f", "--file", "-p", "--project-name", "--profile", "--project-directory", "--env-file", "--parallel", "--progress", "--ansi"]);
  while (subcommand === "compose" && i < rest.length) {
    const option = rest[i];
    if (!option?.known || !option.value.startsWith("-")) break;
    const key = option.value.split("=", 1)[0].toLowerCase();
    i += composeValueOptions.has(key) && !option.value.includes("=") ? 2 : 1;
  }
  const command = rest[i];
  if (!command?.known) return { subcommand: `${subcommand} <unknown>`, rest: rest.slice(i + 1) };
  return { subcommand: `${subcommand} ${command.value.toLowerCase()}`, rest: rest.slice(i + 1) };
}

function valueText(value: Value): string {
  return value.known ? value.value : value.expression;
}

function knownOptions(args: Value[]): string[] {
  const options: string[] = [];
  for (const item of args) {
    if (!item.known) continue;
    if (item.value === "--") break;
    if (item.value.startsWith("-")) options.push(item.value.toLowerCase());
  }
  return options;
}

function hasKnownNoEffect(executable: string, args: Value[], language: Language): boolean {
  const options = knownOptions(args);
  const whatIfCommands = new Set([
    "remove-item", "rmdir", "set-content", "add-content", "out-file", "new-item", "copy-item", "move-item", "rename-item",
    "remove-itemproperty", "format-volume", "clear-disk", "initialize-disk", "set-executionpolicy", "stop-process",
  ]);
  if (language === "powershell" && whatIfCommands.has(executable)) {
    const whatIf = args.findIndex((item) => item.known && item.value.toLowerCase() === "-whatif");
    const whatIfValue = args[whatIf + 1];
    if (whatIf >= 0 && !(whatIfValue?.known && whatIfValue.value.toLowerCase() === "$false")) return true;
    if (options.some((item) => /^-whatif:(?:\$?true|1)$/.test(item))) return true;
  }
  if (executable === "git") {
    const git = parseGit(args);
    const gitOptions = knownOptions(git.operands);
    return git.subcommand !== undefined
      && ["add", "clean", "push", "rm"].includes(git.subcommand)
      && gitOptions.some((item) => item === "--dry-run" || /^-[^-]*n/.test(item));
  }
  if (executable === "rsync") return options.some((item) => item === "--dry-run" || /^-[^-]*n/.test(item));
  if (executable === "kubectl") return options.some((item) => item === "--dry-run" || /^--dry-run=(?:client|server|true)$/.test(item));
  if (executable === "helm") return options.some((item) => item === "--dry-run" || /^--dry-run=(?:client|server|true)$/.test(item));
  return false;
}

function policyRecord(rawExecutable: Value, args: Value[], language: Language, effects: string[]): CommandRecord {
  const normalized = normalizeInvocation(rawExecutable, args, language);
  if (!normalized || normalized.unresolved) {
    const text = rawExecutable.known ? executableName(rawExecutable.value, language) : "<dynamic>";
    return { text, language, executableEnd: text.length, effects, matchable: false };
  }
  const { executable, actualArgs, wrappers } = normalized;
  let policyArgs = actualArgs;
  if (["echo", "printf", "write-output", "out-host", "true", "false", "test", "[", "[[", "clear-host"].includes(executable)) {
    policyArgs = [];
  } else if (executable === "git") {
    const git = parseGit(actualArgs);
    policyArgs = git.subcommand ? [{ known: true, value: git.subcommand }, ...git.operands] : actualArgs;
  } else if (["docker", "podman"].includes(executable)) {
    const docker = dockerFacts(actualArgs);
    if (docker.subcommand) {
      const operation = dockerOperation(docker.subcommand, docker.rest);
      policyArgs = [...operation.subcommand.split(" ").map((value) => ({ known: true as const, value })), ...operation.rest];
    }
  } else if (executable === "mysqladmin") {
    const operation = operationAfterOptions(actualArgs, new Set(["-h", "--host", "-u", "--user", "-p", "--password", "-P", "--port", "-S", "--socket", "--protocol"]));
    if (operation.command) policyArgs = [{ known: true, value: operation.command }, ...operation.rest];
  } else if (executable === "redis-cli") {
    const operation = operationAfterOptions(actualArgs, new Set(["-h", "--host", "-p", "--port", "-a", "--pass", "--user", "-n", "--dbnum", "-u", "--uri"]));
    if (operation.command) policyArgs = [{ known: true, value: operation.command }, ...operation.rest];
  }
  const canonical = language === "powershell" && executable === "remove-item" ? "Remove-Item" : executable;
  const prefix = [...wrappers, canonical];
  const text = [...prefix, ...policyArgs.map(valueText)].join(" ");
  return {
    text,
    language,
    executableEnd: prefix.join(" ").length,
    effects,
    matchable: !hasKnownNoEffect(executable, actualArgs, language),
  };
}

function decodeEncodedPowerShell(value: Value | undefined): string | undefined {
  if (!value?.known) return undefined;
  try {
    const bytes = Buffer.from(value.value, "base64");
    if (!bytes.length || bytes.length > SCRIPT_BYTE_LIMIT) return undefined;
    return bytes.toString("utf16le").replace(/\0/g, "");
  } catch { return undefined; }
}

async function nativeReadScript(file: string, maxBytes: number): Promise<string | undefined> {
  const handle = await open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) return undefined;
    const bytes = Buffer.alloc(stat.size);
    const result = await handle.read(bytes, 0, bytes.length, 0);
    return bytes.subarray(0, result.bytesRead).toString("utf8");
  } finally { await handle.close(); }
}

function contained(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function obviousProtectedScript(file: string): boolean {
  const name = path.basename(file).toLowerCase();
  return /^\.env(?:\..+)?$/.test(name)
    || /service[-_.]?account/.test(name)
    || /(?:^|[-_.])private[-_.]?key(?:[-_.]|$)/.test(name)
    || /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\..+)?$/.test(name)
    || /\.(?:pem|p12|pfx|key)$/.test(name);
}

async function scriptSource(fileValue: Value, scope: Scope, state: State): Promise<{ file: Target; source?: string; reason?: string }> {
  const file = valueTarget(fileValue, scope.cwd, state.home);
  if (file.resolution === "unknown") return { file, reason: file.reason };
  if (/^[a-z]+:\/\//i.test(file.path)) return { file, reason: "script is not a local repository file" };
  try {
    const resolve = state.dependencies.realpath ?? realpath;
    const [root, resolvedFile] = await Promise.all([resolve(state.repositoryRoot), resolve(file.path)]);
    const resolvedTarget: Target = { resolution: "static", path: resolvedFile };
    if (!contained(root, resolvedFile)) return { file: resolvedTarget, reason: "script is outside the repository analysis boundary" };
    if (obviousProtectedScript(resolvedFile) && !state.dependencies.canReadScript) {
      return { file: resolvedTarget, reason: "script filename is protected and no metadata read authorization was supplied" };
    }
    if (state.dependencies.canReadScript && await state.dependencies.canReadScript(resolvedFile) !== true) {
      return { file: resolvedTarget, reason: "script source read was denied by metadata policy" };
    }
    const read = state.dependencies.readScript ?? nativeReadScript;
    const source = await read(resolvedFile, SCRIPT_BYTE_LIMIT);
    if (source === undefined || Buffer.byteLength(source, "utf8") > SCRIPT_BYTE_LIMIT) return { file, reason: `script is unavailable or exceeds the ${SCRIPT_BYTE_LIMIT}-byte bound` };
    return { file: resolvedTarget, source };
  } catch {
    return { file, reason: "repository script source could not be resolved without reading it" };
  }
}

async function analyzeEmbedded(language: Language, source: string, state: State, scope: Scope, depth: number, forcedRange: { start: number; end: number }): Promise<void> {
  if (depth > NESTING_LIMIT) { addUnknown(state, scope, language, "embedded", forcedRange, "nested execution depth exceeded", "<nested payload>"); return; }
  const parsed = await parse(language, source, state);
  if (!parsed.tree) {
    addUnknown(state, scope, language, "parser", forcedRange, `Parsing valid or unresolved ${language} input exceeded the ${state.budget} ms budget`, "<parse deadline>");
    return;
  }
  try {
    if (parsed.tree.rootNode.hasError) {
      state.uncertainties.push(`${language} input contains unresolved syntax`);
      addEffect(state, "execution", "unknown", scope, language, "parser", forcedRange, [unknown("<syntax>", `${language} syntax could not be fully resolved`)], [], [], `${language} syntax could not be fully resolved`);
    }
    if (language === "bash") await walkBash(parsed.tree.rootNode, state, scope, depth, 0, forcedRange);
    else if (language === "powershell") await walkPowerShell(parsed.tree.rootNode, state, scope, depth, 0, forcedRange);
    else await walkProgram(parsed.tree.rootNode, language, state, scope, depth, forcedRange);
  } finally { parsed.tree.delete(); }
}

async function analyzeScript(language: Language, fileValue: Value, state: State, scope: Scope, depth: number, range: { start: number; end: number }, executable: string, shareScope = false): Promise<void> {
  const loaded = await scriptSource(fileValue, scope, state);
  addEffect(state, "filesystem", "read", scope, language, executable, range, [loaded.file]);
  addEffect(state, "execution", "execute", scope, language, executable, range, [loaded.file]);
  if (loaded.source !== undefined) await analyzeEmbedded(language, loaded.source, state, shareScope ? scope : cloneScope(scope), depth + 1, range);
  else addUnknown(state, scope, language, executable, range, loaded.reason ?? "script source is unresolved", fileValue.known ? fileValue.value : fileValue.expression);
}

async function processRedirection(node: TreeSitter.Node, language: Language, state: State, scope: Scope, executable: string, offset: number, forced?: { start: number; end: number }): Promise<void> {
  const text = node.text;
  const range = rangeOf(node, offset, forced);
  if (node.type === "heredoc_redirect") {
    await processEmbeddedNodes(node, language, state, cloneScope(scope), 1, offset, forced);
    return;
  }
  let destination = node.childForFieldName("destination") ?? node.descendantsOfType(["redirected_file_name", "word", "generic_token"]).at(-1);
  if (destination?.type === "redirected_file_name") destination = destination.namedChildren.find((child) => child.type !== "command_argument_sep") ?? destination;
  if (!destination || /(?:>&|<&)/.test(text)) return;
  const item = valueTarget(decoded(destination, language, scope), scope.cwd, state.home);
  if (/<<<?/.test(text)) return;
  if (/(?:^|\s)<(?!<)/.test(text)) addEffect(state, "filesystem", "read", scope, language, executable, range, [item]);
  else addEffect(state, "filesystem", text.includes(">>") ? "write" : "truncate", scope, language, executable, range, [item]);
  await processEmbeddedNodes(destination, language, state, scope, 1, offset, forced);
}

async function processEmbeddedNodes(node: TreeSitter.Node, language: Language, state: State, scope: Scope, depth: number, offset: number, forced?: { start: number; end: number }): Promise<void> {
  if (language === "bash" && ["command_substitution", "process_substitution"].includes(node.type)) {
    await walkBash(node, state, cloneScope(scope), depth + 1, offset, forced);
    return;
  }
  if (language === "powershell" && ["sub_expression", "script_block_expression"].includes(node.type)) {
    await walkPowerShell(node, state, cloneScope(scope), depth + 1, offset, forced);
    return;
  }
  for (const child of node.namedChildren) await processEmbeddedNodes(child, language, state, scope, depth, offset, forced);
}

async function processInvocation(
  rawExecutable: Value,
  args: Value[],
  rawArgs: TreeSitter.Node[],
  language: Language,
  state: State,
  scope: Scope,
  depth: number,
  range: { start: number; end: number },
  originalText: string,
  pipedInput = false,
): Promise<string[]> {
  const before = state.effects.length;
  if (!rawExecutable.known) {
    addUnknown(state, scope, language, "<dynamic>", range, "executable is dynamically resolved", rawExecutable.expression);
    return state.effects.slice(before).map((item) => item.id);
  }
  const normalized = normalizeInvocation(rawExecutable, args, language)!;
  if (normalized.unresolved) {
    addUnknown(state, scope, language, normalized.unresolved.executable, range, normalized.unresolved.reason, normalized.unresolved.expression);
    return state.effects.slice(before).map((item) => item.id);
  }
  const { executable, actualArgs, wrappers, environmentAssignments } = normalized;
  const noEffect = hasKnownNoEffect(executable, actualArgs, language);
  const effectArgs = actualArgs.filter((item, index) => {
    const previous = actualArgs[index - 1];
    return !(item.known && /^\$(?:true|false)$/i.test(item.value) && previous?.known && previous.value.toLowerCase() === "-whatif");
  });

  const ordinaryOperands = () => optionOperands(effectArgs, new Set());
  const filesystemOperands = (options: string[] = []) => targets(optionOperands(effectArgs, new Set(options.map((item) => item.toLowerCase()))), scope, state);
  const knownHarmless = new Set(["echo", "printf", "write-output", "out-host", "pwd", "get-location", "true", "false", "test", "[", "[[", "sleep", "date", "uname", "hostname", "clear", "clear-host"]);

  if (noEffect) {
    // The command itself is a recognized simulation. Argument substitutions and
    // redirections are still analyzed below in their own executable contexts.
  } else if (["cd", "set-location", "pushd", "popd"].includes(executable)) {
    if (executable === "popd") addUnknown(state, scope, language, executable, range, "directory stack state is not statically tracked");
    else {
      const operand = optionOperands(actualArgs, new Set())[0];
      if (!operand) addUnknown(state, scope, language, executable, range, `${executable} is missing a directory operand`, "<missing>");
      else {
        const resolved = valueTarget(operand, scope.cwd, state.home);
        if (resolved.resolution === "static") scope.cwd = resolved.path;
        else addUnknown(state, scope, language, executable, range, resolved.reason, resolved.expression);
      }
    }
  } else if (knownHarmless.has(executable)) {
    // Arguments are data, but substitutions/redirections are handled separately.
    const unresolved = actualArgs.find((item) => !item.known && item.reason.startsWith("variable "));
    if (unresolved && !unresolved.known) addUnknown(state, scope, language, executable, range, unresolved.reason, unresolved.expression);
  } else if (["rm", "remove-item", "rmdir", "del", "erase"].includes(executable)) {
    requireOperands(state, filesystemOperands(["--filter", "--include", "--exclude", "-filter", "-include", "-exclude"]), scope, language, executable, range, "delete");
  } else if (["cat", "get-content", "head", "tail", "base64"].includes(executable)) {
    requireOperands(state, filesystemOperands(["-n", "--lines", "-c", "--bytes", "--encoding", "--delimiter"]), scope, language, executable, range, "read");
  } else if (["ls", "dir", "get-childitem", "stat", "file", "du"].includes(executable)) {
    const found = filesystemOperands(["--depth", "--time-style", "--format"]);
    addEffect(state, "filesystem", "metadata", scope, language, executable, range, found.length ? found : [staticTarget(".", scope.cwd, state.home)]);
  } else if (["grep", "rg"].includes(executable)) {
    const parsed = parseSearchArguments(executable as "grep" | "rg", actualArgs);
    const { files, patternFiles, metadataOnly, hasPattern, unresolvedPattern } = parsed;
    const recursive = parsed.recursive || (executable === "rg" && (metadataOnly || !pipedInput || executableName(rawExecutable.value, language) !== "rg"));
    if (files.length || recursive) {
      const effect = addEffect(state, "filesystem", metadataOnly ? "metadata" : "read", scope, language, executable, range, files.length ? targets(files, scope, state) : [staticTarget(".", scope.cwd, state.home)]);
      if (executable === "rg") state.searches.push({ effectId: effect.id, executable: "rg", inventoryArgs: scope.variables.has("RIPGREP_CONFIG_PATH") || scope.unknownVariables.has("RIPGREP_CONFIG_PATH") ? undefined : parsed.inventoryArgs });
    }
    if (patternFiles.length) addEffect(state, "filesystem", "read", scope, language, executable, range, targets(patternFiles, scope, state));
    if (!hasPattern) addUnknown(state, scope, language, executable, range, `${executable} is missing a search pattern`, "<missing>");
    else if (unresolvedPattern && !unresolvedPattern.known) addUnknown(state, scope, language, executable, range, `${executable} search pattern is unresolved`, unresolvedPattern.expression);
  } else if (executable === "find") {
    const roots: Value[] = [];
    let i = 0;
    while (i < actualArgs.length) {
      const root = actualArgs[i];
      if (!root?.known || root.value.startsWith("-") || root.value === "(" || root.value === "!") break;
      roots.push(root); i++;
    }
    const searchRoots = roots.length ? roots : [{ known: true as const, value: "." }];
    const deletes = actualArgs.some((item) => item.known && item.value === "-delete");
    addEffect(state, "filesystem", deletes ? "delete" : "metadata", scope, language, executable, range, targets(searchRoots, scope, state));
    const unresolved = actualArgs.find((item) => !item.known);
    if (unresolved && !unresolved.known) addUnknown(state, scope, language, executable, range, "find path or expression is unresolved", unresolved.expression);
    for (let at = 0; at < actualArgs.length; at++) {
      const predicate = actualArgs[at];
      if (predicate?.known && ["-exec", "-execdir"].includes(predicate.value)) {
        const end = actualArgs.findIndex((item, index) => index > at && item.known && [";", "+"].includes(item.value));
        const body = actualArgs.slice(at + 1, end < 0 ? undefined : end);
        if (!body.length) addUnknown(state, scope, language, "find", range, "find -exec payload is missing", "<missing>");
        else {
          const nestedEffects = await processInvocation(body[0], body.slice(1), [], language, state, cloneScope(scope), depth + 1, range, body.map(valueText).join(" "));
          state.records.push(policyRecord(body[0], body.slice(1), language, nestedEffects));
        }
        if (end >= 0) at = end;
      }
    }
  } else if (["curl", "wget", "invoke-webrequest", "invoke-restmethod", "scp", "rsync"].includes(executable)) {
    const sources: Target[] = [];
    const destinations: Target[] = [];
    for (let i = 0; i < actualArgs.length; i++) {
      const item = actualArgs[i];
      if (!item.known) continue;
      const lower = item.value.toLowerCase();
      const attached = item.value.match(/^(?:--upload-file|--data-binary|--data|--form|--infile)=(.*)$/i)?.[1]
        ?? item.value.match(/^-T(.+)$/)?.[1];
      if (attached !== undefined || ["-t", "--upload-file", "--data-binary", "--data", "--form", "-f", "--infile"].includes(lower)) {
        const operand: Value | undefined = attached === undefined ? actualArgs[++i] : { known: true, value: attached };
        if (operand) {
          const adjusted: Value = operand.known ? { known: true, value: (operand.value.match(/@(.+)$/)?.[1] ?? operand.value) } : operand;
          sources.push(adjusted.known && adjusted.value === "-" ? unknown("<stdin>", "upload reads dynamically supplied standard input") : valueTarget(adjusted, scope.cwd, state.home));
        } else sources.push(unknown("<missing>", `${executable} upload option is missing its operand`));
      } else if (item.value.startsWith("@")) sources.push(staticTarget(item.value.slice(1), scope.cwd, state.home));
      else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(item.value)) destinations.push({ resolution: "static", path: item.value });
    }
    if (!sources.length && ["scp", "rsync"].includes(executable)) {
      const operands = optionOperands(actualArgs, new Set(["-i", "-P", "-e", "--exclude", "--include"]));
      const remote = operands.at(-1);
      if (remote?.known && /^(?:[^/\s]+@)?[^/\s:]+:.+/.test(remote.value) && operands.length > 1) {
        sources.push(...targets(operands.slice(0, -1), scope, state));
        destinations.push({ resolution: "static", path: `${executable}://${remote.value}` });
      }
    }
    const unresolved: Target[] = actualArgs.flatMap((item) => item.known ? [] : [unknown(item.expression, item.reason)]);
    if (sources.length) addEffect(state, "network", "upload", scope, language, executable, range, [], sources, destinations.length ? destinations : unresolved.length ? unresolved : [unknown("<missing>", "upload destination is unresolved")]);
    else if (["scp", "rsync"].includes(executable)) addUnknown(state, scope, language, executable, range, `${executable} transfer direction is not statically established`, originalText);
    else if (!destinations.length) addUnknown(state, scope, language, executable, range, `${executable} URL or transfer operand is missing or unresolved`, unresolved[0]?.resolution === "unknown" ? unresolved[0].expression : "<missing>");
    else addEffect(state, "network", "metadata", scope, language, executable, range, destinations);
  } else if (["cp", "copy-item"].includes(executable)) {
    const items = optionOperands(actualArgs, new Set(["-t", "--target-directory"]));
    if (items.length < 2) addUnknown(state, scope, language, executable, range, `${executable} requires source and destination`, originalText);
    else {
      addEffect(state, "filesystem", "read", scope, language, executable, range, targets(items.slice(0, -1), scope, state));
      addEffect(state, "filesystem", "write", scope, language, executable, range, targets(items.slice(-1), scope, state), targets(items.slice(0, -1), scope, state));
    }
  } else if (["mv", "move-item", "rename-item"].includes(executable)) {
    const items = ordinaryOperands();
    if (items.length < 2) addUnknown(state, scope, language, executable, range, `${executable} requires source and destination`, originalText);
    else {
      addEffect(state, "filesystem", "delete", scope, language, executable, range, targets(items.slice(0, -1), scope, state));
      addEffect(state, "filesystem", "write", scope, language, executable, range, targets(items.slice(-1), scope, state), targets(items.slice(0, -1), scope, state));
    }
  } else if (["mkdir", "new-item", "touch", "tee", "set-content", "add-content", "out-file"].includes(executable)) {
    requireOperands(state, filesystemOperands(["-p", "--parents", "--mode", "--itemtype", "--value", "--encoding", "--filepath"]), scope, language, executable, range, executable === "tee" || executable === "add-content" ? "write" : "write");
  } else if (executable === "git") {
    const git = parseGit(actualArgs);
    const gitScope = cloneScope(scope);
    for (const directory of git.directories) {
      const resolved = valueTarget(directory, gitScope.cwd, state.home);
      if (resolved.resolution === "static") gitScope.cwd = resolved.path;
      else {
        addUnknown(state, gitScope, language, executable, range, resolved.reason, resolved.expression);
        break;
      }
    }
    if (!git.subcommand) addUnknown(state, gitScope, language, executable, range, "Git subcommand is unresolved", originalText);
    else {
      const lowerOperands = git.operands.filter((item): item is Extract<Value, { known: true }> => item.known).map((item) => item.value.toLowerCase());
      const gitTargets = optionOperands(git.operands, new Set(["--pathspec-from-file", "--strategy", "--recurse-submodules", "--format", "--pretty", "--max-count"]))
        .map((item) => item.known ? resourceTarget(item.value, "git") : unknown(item.expression, item.reason));
      const readOnly = new Set(["status", "diff", "log", "show", "grep", "blame", "rev-parse", "ls-files", "ls-tree", "cat-file", "help", "version"]);
      if (readOnly.has(git.subcommand)) {
        addEffect(state, "git", "metadata", gitScope, language, executable, range, gitTargets);
        if (git.subcommand === "grep") addEffect(state, "filesystem", "read", gitScope, language, executable, range, [staticTarget(".", gitScope.cwd, state.home)]);
      } else if (!["add", "am", "apply", "bisect", "branch", "checkout", "cherry-pick", "clean", "clone", "commit", "config", "fetch", "gc", "init", "merge", "mv", "notes", "pull", "push", "rebase", "reflog", "remote", "reset", "restore", "revert", "rm", "stash", "submodule", "switch", "tag", "update-index", "update-ref", "worktree"].includes(git.subcommand)) {
        const opaque = addUnknown(state, gitScope, language, executable, range, "Unrecognized Git subcommand or alias requires contextual review", originalText);
        opaque.operation = "execute";
      } else {
        addEffect(state, "git", "mutate", gitScope, language, executable, range, gitTargets);
        if (git.subcommand === "rm" && !lowerOperands.includes("--cached")) {
          const files = optionOperands(git.operands, new Set(["--pathspec-from-file"]));
          requireOperands(state, targets(files, gitScope, state), gitScope, language, executable, range, "delete");
        } else if (git.subcommand === "clean") {
          const files = optionOperands(git.operands, new Set(["-e", "--exclude"]));
          addEffect(state, "filesystem", "delete", gitScope, language, executable, range,
            files.length ? targets(files, gitScope, state) : [staticTarget(".", gitScope.cwd, state.home)]);
        } else if (git.subcommand === "reset" && lowerOperands.includes("--hard")) {
          addEffect(state, "filesystem", "write", gitScope, language, executable, range, [staticTarget(".", gitScope.cwd, state.home)]);
        } else if (git.subcommand === "restore" && !(lowerOperands.includes("--staged") && !lowerOperands.includes("--worktree"))) {
          const files = optionOperands(git.operands, new Set(["--source", "--pathspec-from-file"]));
          requireOperands(state, targets(files, gitScope, state), gitScope, language, executable, range, "write");
        } else if (git.subcommand === "checkout" && (lowerOperands.includes("--") || lowerOperands.some((item) => item.startsWith("--pathspec-from-file")))) {
          const separator = git.operands.findIndex((item) => item.known && item.value === "--");
          const files = separator >= 0 ? git.operands.slice(separator + 1) : [];
          addEffect(state, "filesystem", "write", gitScope, language, executable, range,
            files.length ? targets(files, gitScope, state) : [staticTarget(".", gitScope.cwd, state.home)]);
        }
      }
    }
  } else if (["docker", "podman"].includes(executable)) {
    const dockerScope = environmentAssignments.size ? cloneScope(scope) : scope;
    for (const [name, value] of environmentAssignments) {
      dockerScope.variables.set(name, value);
      dockerScope.unknownVariables.delete(name);
    }
    const facts = dockerFacts(actualArgs, state.dependencies.dockerContext, dockerScope);
    if (!facts.subcommand) addUnknown(state, scope, language, executable, range, facts.uncertain ?? "container command is missing or unresolved", originalText);
    else {
      const operation = dockerOperation(facts.subcommand, facts.rest);
      const subcommand = operation.subcommand;
      const rest = operation.rest;
      const metadataOnly = /^(?:ps|images|info|version|container ls|volume ls)$/.test(subcommand);
      const create = /^(?:create|container create|run|container run)$/.test(subcommand);
      const detachedRun = /^(?:run|container run)$/.test(subcommand) && rest.some(item => item.known && (/^-[^-]*d/.test(item.value) || /^--detach(?:=(?:true|1))?$/i.test(item.value)));
      const nativeCreationResult = /^(?:create|container create)$/.test(subcommand) || detachedRun;
      const containerDelete = /^(?:rm|container rm)$/.test(subcommand);
      const volumeDelete = /^(?:volume (?:rm|prune)|compose down)$/.test(subcommand)
        && (subcommand !== "compose down" || rest.some(item => item.known && ["-v", "--volumes"].includes(item.value.toLowerCase())));
      const deletion = containerDelete || volumeDelete || /^(?:rmi|image rm|system prune|compose down)$/.test(subcommand);
      const removeVolumes = volumeDelete || (containerDelete && rest.some(item => item.known && ["-v", "--volumes"].includes(item.value.toLowerCase().split("=", 1)[0])));
      const identityOptions = new Set(["--filter", "--format", "--until", "--rmi", "--env-file", "--name", "--stop-signal", "--time", "-t"]);
      const identities = optionOperands(rest, identityOptions);
      const identityRequired = containerDelete || /^(?:rmi|image rm|volume rm)$/.test(subcommand);
      const identityUncertain = identityRequired && !identities.length ? "Docker resource identity is missing" : undefined;
      let dockerReason = metadataOnly && !facts.dynamic ? undefined : facts.uncertain ?? identityUncertain;
      const dockerTargets = identities.map(item => item.known ? resourceTarget(`${facts.context ?? "<unknown>"}/${subcommand}/${item.value}`, "docker") : unknown(item.expression, item.reason));
      if (identityUncertain) dockerTargets.push(unknown("<missing>", identityUncertain));
      const effect = addEffect(state, "docker", deletion ? "delete" : metadataOnly ? "metadata" : "mutate", scope, language, executable, range, dockerTargets, [], [], dockerReason);
      effect.context.daemon = facts.context;
      effect.context.mountedData = removeVolumes;
      if (identities.length === 1 && identities[0].known) effect.context.resourceId = identities[0].value;
      if (dockerReason) state.uncertainties.push(dockerReason);

      let invocationOperation: DockerInvocation["operation"] = metadataOnly ? "metadata" : create ? "create" : containerDelete ? "delete-container" : volumeDelete ? "delete-volume" : "other";
      let resources = identities.filter((item): item is Extract<Value, { known: true }> => item.known).map(item => item.value);
      const nestedEffectIds: string[] = [];
      if (subcommand === "exec") {
        invocationOperation = "exec";
        let at = 0;
        let workdir: Value | undefined;
        const valueOptions = new Set(["-e", "--env", "--env-file", "-u", "--user", "-w", "--workdir", "--detach-keys"]);
        while (at < rest.length) {
          const item = rest[at];
          if (!item?.known || !item.value.startsWith("-") || item.value === "--") { if (item?.known && item.value === "--") at++; break; }
          const key = item.value.split("=", 1)[0].toLowerCase();
          const attached = item.value.includes("=") ? item.value.slice(item.value.indexOf("=") + 1) : undefined;
          if (valueOptions.has(key)) {
            const value = attached === undefined ? rest[++at] : { known: true as const, value: attached };
            if (key === "-w" || key === "--workdir") workdir = value;
          }
          at++;
        }
        const container = rest[at++];
        resources = container?.known ? [container.value] : [];
        const command = rest[at++];
        const nestedArgs = rest.slice(at);
        if (!container?.known || !command?.known) {
          const reason = "Docker exec container or command is unresolved";
          addUnknown(state, scope, language, executable, range, reason, originalText);
          dockerReason ??= reason;
        } else {
          const nestedScope = cloneScope(scope);
          nestedScope.cwd = workdir?.known && workdir.value.startsWith("/") ? workdir.value : UNKNOWN_CONTAINER_CWD;
          const beforeNested = state.effects.length;
          await processInvocation(command, nestedArgs, [], language, state, nestedScope, depth + 1, range, [command, ...nestedArgs].map(valueText).join(" "));
          nestedEffectIds.push(...state.effects.slice(beforeNested).map(item => item.id));
        }
      }
      effect.targets = resources.map(item => resourceTarget(`${facts.context ?? "<unknown>"}/${subcommand}/${item}`, "docker"));
      effect.context.resourceId = resources.length === 1 ? resources[0] : undefined;
      if (!dockerReason) {
        if (effect.resolution === "unknown") delete (effect as Effect & { reason?: string }).reason;
        effect.resolution = "static";
      }
      const invocation: DockerInvocation = {
        effectId: effect.id, operation: invocationOperation, resources, endpoint: facts.endpoint,
        nestedEffectIds, removesVolumes: removeVolumes, directCreation: nativeCreationResult && wrappers.length === 0,
      };
      if (executable === "docker") state.docker.push(invocation);
    }
  } else if (["psql", "mysql", "mariadb", "sqlite3", "sqlcmd"].includes(executable)) {
    if (actualArgs.length === 1 && actualArgs[0].known && ["--version", "--help"].includes(actualArgs[0].value)) {
      addEffect(state, "database", "metadata", scope, language, executable, range);
    } else {
      const payloads: Value[] = [];
      const payloadOptions = executable === "psql" ? ["-c", "--command"] : ["mysql", "mariadb"].includes(executable) ? ["-e", "--execute"] : executable === "sqlcmd" ? ["-Q", "-q"] : ["-cmd"];
      const fileOptions = executable === "psql" ? ["-f", "--file"] : executable === "sqlcmd" ? ["-i"] : executable === "sqlite3" ? ["-init"] : [];
      for (let i = 0; i < actualArgs.length; i++) {
        const item = actualArgs[i];
        if (!item.known) continue;
        if (fileOptions.includes(item.value.split("=", 1)[0]) || fileOptions.some(flag => flag.length === 2 && item.value.startsWith(flag) && item.value.length > 2)) {
          const source = item.value.includes("=") ? { known: true as const, value: item.value.slice(item.value.indexOf("=") + 1) } : fileOptions.includes(item.value) ? actualArgs[++i] : { known: true as const, value: item.value.slice(2) };
          if (source) addEffect(state, "filesystem", "read", scope, language, executable, range, targets([source], scope, state));
          addOpaqueExecution(state, scope, language, executable, range, "Database startup/script execution requires contextual review");
        } else if (payloadOptions.includes(item.value)) {
          payloads.push(actualArgs[++i] ?? { known: false, expression: "<missing>", reason: "Missing SQL payload" });
        } else if (payloadOptions.some(flag => flag.startsWith("--") && item.value.startsWith(`${flag}=`))) payloads.push({ known: true, value: item.value.slice(item.value.indexOf("=") + 1) });
        else if (payloadOptions.some(flag => flag.length === 2 && item.value.startsWith(flag) && item.value.length > 2)) payloads.push({ known: true, value: item.value.slice(2) });
        else if (executable === "sqlite3" && i === actualArgs.length - 1 && actualArgs.length >= 2 && !item.value.startsWith("-")) payloads.push(item);
      }
      if (!payloads.length) addOpaqueExecution(state, scope, language, executable, range, "Database script/stdin execution requires contextual review");
      for (const payload of payloads) {
        const sql = payload.known ? sqlExecutableText(payload.value, executable) : undefined;
        if (sql === undefined || /\b(?:EXEC|EXECUTE|DO|SOURCE|dblink_exec)\b|\\|(?:^|[;\n])\s*\.(?:read|shell|system|load)\b/i.test(sql)) {
          const effect = addOpaqueExecution(state, scope, language, executable, range, "SQL execution requires contextual review; procedural syntax is not statically resolved");
          // Keep possible prohibitions visible to the reviewer without claiming
          // that text inside unresolved SQL necessarily executes.
          for (const rule of state.dependencies.rules ?? []) {
            rule.compiled.lastIndex = 0;
            if (rule.languages.includes(language) && rule.compiled.test(payload.known ? payload.value : payload.expression)) state.semanticMatches.push({ ruleId: rule.id, action: rule.action, applicability: "candidate", reason: rule.reason, effects: [effect.id] });
          }
        } else {
          const effect = addEffect(state, "database", "execute", scope, language, executable, range);
          state.records.push({ text: sql, language, executableEnd: sql.length, effects: [effect.id], matchable: true });
        }
      }
    }
  } else if (executable === "dropdb") {
    const databases = optionOperands(actualArgs, new Set(["-h", "--host", "-p", "--port", "-U", "--username", "--maintenance-db"]));
    requireOperands(state, databases.map((item) => item.known ? resourceTarget(item.value, "database") : unknown(item.expression, item.reason)), scope, language, executable, range, "delete", "database");
  } else if (executable === "mysqladmin") {
    const operation = operationAfterOptions(actualArgs, new Set(["-h", "--host", "-u", "--user", "-p", "--password", "-P", "--port", "-S", "--socket", "--protocol"]));
    if (operation.command === "drop") {
      const databases = optionOperands(operation.rest, new Set());
      requireOperands(state, databases.map((item) => item.known ? resourceTarget(item.value, "database") : unknown(item.expression, item.reason)), scope, language, executable, range, "delete", "database");
    } else addOpaqueExecution(state, scope, language, executable, range, "mysqladmin operation is not modeled as a bounded database effect");
  } else if (executable === "redis-cli") {
    const operation = operationAfterOptions(actualArgs, new Set(["-h", "--host", "-p", "--port", "-a", "--pass", "--user", "-n", "--dbnum", "-u", "--uri"]));
    if (operation.command && ["flushall", "flushdb"].includes(operation.command)) {
      addEffect(state, "database", "delete", scope, language, executable, range, [resourceTarget(operation.command, "database")]);
    } else addOpaqueExecution(state, scope, language, executable, range, "redis-cli operation is not modeled as a bounded database effect");
  } else if (["format-volume", "clear-disk", "initialize-disk", "remove-itemproperty", "set-executionpolicy", "stop-process"].includes(executable)) {
    addEffect(state, "execution", "execute", scope, language, executable, range);
  } else if (["pnpm", "npm", "npx", "yarn", "uv"].includes(executable)) {
    const knownArgs = actualArgs.map(valueText);
    let nestedAt = -1;
    if (["pnpm", "npm", "yarn"].includes(executable)) {
      const execAt = knownArgs.findIndex((item) => ["exec", "x", "dlx"].includes(item.toLowerCase()));
      if (execAt >= 0) {
        nestedAt = execAt + 1;
        if (knownArgs[nestedAt] === "--") nestedAt++;
      }
    } else if (executable === "npx") nestedAt = knownArgs[0] === "--" ? 1 : 0;
    else if (executable === "uv" && knownArgs[0]?.toLowerCase() === "run") nestedAt = 1;
    if (nestedAt >= 0 && actualArgs[nestedAt]) {
      const nested = actualArgs[nestedAt];
      const nestedName = nested.known ? executableName(nested.value, language) : "<dynamic>";
      if (["pytest", "vitest", "tsc"].includes(nestedName)) addEffect(state, "execution", "execute", scope, language, nestedName, range);
      else {
        const nestedArgs = actualArgs.slice(nestedAt + 1);
        const nestedEffects = await processInvocation(nested, nestedArgs, [], language, state, cloneScope(scope), depth + 1, range, knownArgs.slice(nestedAt).join(" "));
        state.records.push(policyRecord(nested, nestedArgs, language, nestedEffects));
      }
    } else {
      const first = knownArgs[0]?.toLowerCase();
      const script = first === "run" ? knownArgs[1]?.toLowerCase() : first;
      if (["test", "typecheck", "build"].includes(script ?? "")) addEffect(state, "execution", "execute", scope, language, executable, range);
      else addOpaqueExecution(state, scope, language, executable, range, `${executable} invocation is not one of the statically supported developer operations`);
    }
  } else if (["pytest", "vitest", "tsc"].includes(executable)) {
    addEffect(state, "execution", "execute", scope, language, executable, range);
  } else if (["cut", "head", "jq", "sort", "tail", "tr", "uniq", "wc"].includes(executable)) {
    addEffect(state, "execution", "execute", scope, language, executable, range);
  } else if (["bash", "sh", "zsh", "dash", "ksh", "pwsh", "powershell", "cmd"].includes(executable)) {
    const encoded = actualArgs.findIndex((item) => item.known && /^-(?:e|enc|encodedcommand)$/i.test(item.value));
    const command = actualArgs.findIndex((item) => item.known && ["-c", "-command", "/c"].includes(item.value.toLowerCase()));
    const nestedLanguage: Language = ["pwsh", "powershell"].includes(executable) ? "powershell" : "bash";
    addEffect(state, "execution", "execute", scope, nestedLanguage, executable, range);
    if (encoded >= 0) {
      const payload = decodeEncodedPowerShell(actualArgs[encoded + 1]);
      if (payload === undefined) addUnknown(state, scope, nestedLanguage, executable, range, "PowerShell encoded payload is invalid, missing, dynamic, or exceeds the bound", "<encoded payload>");
      else await analyzeEmbedded("powershell", payload, state, cloneScope(scope), depth + 1, range);
    } else if (command >= 0) {
      const payload = actualArgs[command + 1];
      if (!payload?.known) addUnknown(state, scope, nestedLanguage, executable, range, `${executable} command payload is missing or unresolved`, payload && !payload.known ? payload.expression : "<missing>");
      else await analyzeEmbedded(nestedLanguage, payload.value, state, cloneScope(scope), depth + 1, range);
    } else {
      const script = optionOperands(actualArgs, new Set()).find((item) => !item.known || !item.value.startsWith("-"));
      if (!script) addUnknown(state, scope, nestedLanguage, executable, range, `${executable} has no statically analyzable command or script`, "<missing>");
      else await analyzeScript(nestedLanguage, script, state, scope, depth, range, executable);
    }
  } else if (["python", "python3", "node", "nodejs", "bun", "deno", "tsx"].includes(executable)) {
    const inline = actualArgs.findIndex((item) => item.known && ["-c", "-e", "--eval"].includes(item.value));
    const nestedLanguage: Language = executable.startsWith("python") ? "python" : executable === "tsx" ? "typescript" : "javascript";
    addEffect(state, "execution", "execute", scope, nestedLanguage, executable, range);
    if (inline >= 0) {
      const payload = actualArgs[inline + 1];
      if (!payload?.known) addUnknown(state, scope, nestedLanguage, executable, range, `${executable} inline payload is missing or unresolved`, payload && !payload.known ? payload.expression : "<missing>");
      else await analyzeEmbedded(nestedLanguage, payload.value, state, cloneScope(scope), depth + 1, range);
    } else {
      const script = optionOperands(actualArgs, new Set(["--loader", "--require", "-r"])).find((item) => !item.known || /\.(?:py|js|mjs|cjs|ts|tsx)$/i.test(item.value));
      if (!script) addUnknown(state, scope, nestedLanguage, executable, range, `${executable} invocation is not a supported inline or repository script form`, originalText);
      else await analyzeScript(nestedLanguage, script, state, scope, depth, range, executable);
    }
  } else if (["source", "."].includes(executable)) {
    const script = actualArgs[0];
    if (!script) addUnknown(state, scope, language, executable, range, `${executable} is missing a script operand`, "<missing>");
    else await analyzeScript(language, script, state, scope, depth, range, executable, true);
  } else if (["eval", "invoke-expression", "iex"].includes(executable)) {
    const payload = actualArgs[0];
    addEffect(state, "execution", "execute", scope, language, executable, range);
    if (!payload?.known) addUnknown(state, scope, language, executable, range, `${executable} payload is missing or dynamically resolved`, payload && !payload.known ? payload.expression : "<missing>");
    else await analyzeEmbedded(language, payload.value, state, cloneScope(scope), depth + 1, range);
  } else if (executable === "xargs") {
    const start = actualArgs.findIndex((item) => item.known && !item.value.startsWith("-"));
    if (start < 0) addUnknown(state, scope, language, executable, range, "xargs executable is missing or dynamically supplied", originalText);
    else {
      const dynamic = { known: false as const, expression: "<xargs input>", reason: "xargs appends dynamically supplied operands" };
      const nestedArgs = [...actualArgs.slice(start + 1), dynamic];
      const nestedEffects = await processInvocation(actualArgs[start], nestedArgs, [], language, state, cloneScope(scope), depth + 1, range, originalText);
      state.records.push(policyRecord(actualArgs[start], nestedArgs, language, nestedEffects));
    }
  } else {
    addOpaqueExecution(state, scope, language, executable || "<missing>", range, `effects of executable ${rawExecutable.value} require review because they are unsupported`);
  }

  // Substitutions are executable even when the outer command treats arguments as data.
  for (const argument of rawArgs) await processEmbeddedNodes(argument, language, state, cloneScope(scope), depth, range.start);
  return state.effects.slice(before).map((item) => item.id);
}

async function processBashCommand(node: TreeSitter.Node, state: State, scope: Scope, depth: number, offset: number, forced?: { start: number; end: number }): Promise<void> {
  const range = rangeOf(node, offset, forced);
  const name = commandNameNode(node);
  if (!name) { addUnknown(state, scope, "bash", "<missing>", range, "shell command has no statically resolved executable", node.text); return; }
  // Prefix assignments affect this process only. Keeping them in a cloned scope
  // lets Docker metadata reproduce endpoint selection without changing later commands.
  const assignments = node.namedChildren.filter(child => child.type === "variable_assignment");
  const commandScope = assignments.length ? cloneScope(scope) : scope;
  for (const assignment of assignments) {
    const variable = assignment.childForFieldName("name")?.text;
    const valueNode = assignment.childForFieldName("value");
    if (!variable) continue;
    const value = valueNode ? decoded(valueNode, "bash", scope) : { known: true as const, value: "" };
    if (value.known) { commandScope.variables.set(variable, value.value); commandScope.unknownVariables.delete(variable); }
    else { commandScope.variables.delete(variable); commandScope.unknownVariables.add(variable); }
  }
  const argsNodes = commandArguments(node, "bash");
  const executable = decoded(name, "bash", commandScope);
  const args = argsNodes.map((argument) => decoded(argument, "bash", commandScope));
  let effects: string[];
  const shellFunction = executable.known ? scope.functions.get(executable.value) : undefined;
  if (shellFunction) {
    const before = state.effects.length;
    const body = shellFunction.childForFieldName("body");
    if (body) await walkBash(body, state, scope, depth + 1, offset, forced);
    else addUnknown(state, scope, "bash", executable.known ? executable.value : "function", range, "shell function body is unresolved", node.text);
    effects = state.effects.slice(before).map((item) => item.id);
  } else effects = await processInvocation(executable, args, argsNodes, "bash", state, commandScope, depth, range, node.text, scope.stdinOwner === node.id);
  state.records.push(policyRecord(executable, args, "bash", effects));
}

async function walkBash(node: TreeSitter.Node, state: State, scope: Scope, depth: number, offset: number, forced?: { start: number; end: number }): Promise<void> {
  if (depth > NESTING_LIMIT) { addUnknown(state, scope, "bash", "embedded", rangeOf(node, offset, forced), "nested execution depth exceeded", node.text); return; }
  if (node.type === "command") { await processBashCommand(node, state, scope, depth, offset, forced); return; }
  if (node.type === "variable_assignment") {
    const name = node.childForFieldName("name")?.text;
    const valueNode = node.childForFieldName("value");
    if (name && valueNode) {
      const value = decoded(valueNode, "bash", scope);
      if (value.known) { scope.variables.set(name, value.value); scope.unknownVariables.delete(name); }
      else { scope.variables.delete(name); scope.unknownVariables.add(name); }
    }
    return;
  }
  if (node.type === "function_definition") {
    const name = node.childForFieldName("name")?.text;
    if (name) scope.functions.set(name, node);
    else addUnknown(state, scope, "bash", "function", rangeOf(node, offset, forced), "shell function name is unresolved", node.text);
    return;
  }
  if (node.type === "redirected_statement") {
    const body = node.childForFieldName("body") ?? node.namedChildren[0];
    if (body) await walkBash(body, state, scope, depth, offset, forced);
    const executable = body?.childForFieldName("name")?.text ?? "redirection";
    for (const redirect of node.childrenForFieldName("redirect")) await processRedirection(redirect, "bash", state, scope, executable, offset, forced);
    return;
  }
  if (node.type === "subshell") {
    const childScope = cloneScope(scope);
    for (const child of node.namedChildren) await walkBash(child, state, childScope, depth + 1, offset, forced);
    return;
  }
  if (node.type === "pipeline") {
    const commands = node.namedChildren.filter(child => child.type !== "comment");
    const redirectedInput = node.parent?.type === "redirected_statement" && node.parent.namedChildren.some(child => child.type.endsWith("redirect") && /^\s*(?:[0-9]+)?</.test(child.text));
    for (const [index, child] of commands.entries()) {
      const childScope = cloneScope(scope);
      childScope.stdinOwner = !redirectedInput && index > 0 && child.type === "command" && !child.descendantsOfType(["file_redirect", "heredoc_redirect", "herestring_redirect"]).length ? child.id : undefined;
      await walkBash(child, state, childScope, depth, offset, forced);
    }
    return;
  }
  if (["command_substitution", "process_substitution"].includes(node.type)) {
    for (const child of node.namedChildren) await walkBash(child, state, cloneScope(scope), depth + 1, offset, forced);
    return;
  }
  for (const child of node.namedChildren) await walkBash(child, state, scope, depth, offset, forced);
}

function psAssignment(node: TreeSitter.Node, scope: Scope): boolean {
  if (node.type !== "assignment_expression") return false;
  const variable = node.descendantsOfType("variable")[0]?.text.replace(/^\$/, "").toLowerCase();
  const valueNode = node.childForFieldName("value")?.descendantsOfType(["string_literal", "integer_literal", "real_literal"])[0];
  if (variable) {
    if (valueNode) {
      const value = decodePowerShellText(valueNode.text, scope);
      if (value.known) { scope.variables.set(variable, value.value); scope.unknownVariables.delete(variable); }
      else { scope.variables.delete(variable); scope.unknownVariables.add(variable); }
    } else {
      scope.variables.delete(variable);
      scope.unknownVariables.add(variable);
    }
  }
  return true;
}

async function processPowerShellCommand(node: TreeSitter.Node, state: State, scope: Scope, depth: number, offset: number, forced?: { start: number; end: number }): Promise<void> {
  const range = rangeOf(node, offset, forced);
  const name = node.childForFieldName("command_name") ?? node.childForFieldName("name") ?? node.descendantsOfType("command_name")[0];
  if (!name) { addUnknown(state, scope, "powershell", "<dynamic>", range, "PowerShell command name is unresolved", node.text); return; }
  const invocation = node.descendantsOfType("command_invokation_operator")[0]?.text;
  const commandArgs = commandArguments(node, "powershell");
  const dotSourced = invocation === ".";
  const argsNodes = dotSourced ? [name, ...commandArgs] : commandArgs;
  const executable: Value = dotSourced ? { known: true, value: "source" } : decoded(name, "powershell", scope);
  const args = argsNodes.map((argument) => decoded(argument, "powershell", scope));
  const effects = await processInvocation(executable, args, argsNodes, "powershell", state, scope, depth, range, node.text, scope.stdinOwner === node.id);
  const normalized = executable.known ? executableName(executable.value, "powershell") : "<dynamic>";
  const canonical = normalized === "remove-item" ? "Remove-Item" : normalized;
  state.records.push(policyRecord(executable, args, "powershell", effects));
  for (const redirect of node.descendantsOfType("redirection")) await processRedirection(redirect, "powershell", state, scope, canonical, offset, forced);
}

async function walkPowerShell(node: TreeSitter.Node, state: State, scope: Scope, depth: number, offset: number, forced?: { start: number; end: number }): Promise<void> {
  if (depth > NESTING_LIMIT) { addUnknown(state, scope, "powershell", "embedded", rangeOf(node, offset, forced), "nested execution depth exceeded", node.text); return; }
  if (psAssignment(node, scope)) return;
  if (node.type === "pipeline_chain") {
    const previous = scope.stdinOwner;
    try {
      for (const [index, child] of node.namedChildren.filter(child => child.type !== "comment").entries()) {
        scope.stdinOwner = index > 0 && child.type === "command" && !child.descendantsOfType("redirection").length ? child.id : undefined;
        await walkPowerShell(child, state, scope, depth, offset, forced);
      }
    } finally { scope.stdinOwner = previous; }
    return;
  }
  if (node.type === "command") { await processPowerShellCommand(node, state, scope, depth, offset, forced); return; }
  if (node.type === "ERROR" && node.namedChildren[0]?.type === "command_name") {
    const nameNode = node.namedChildren[0];
    const argsNodes = node.namedChildren.slice(1).filter((child) => child.type !== "command_argument_sep");
    const executable = decoded(nameNode, "powershell", scope);
    const args = argsNodes.map((argument) => decoded(argument, "powershell", scope));
    const range = rangeOf(node, offset, forced);
    const effects = await processInvocation(executable, args, argsNodes, "powershell", state, scope, depth, range, node.text);
    state.records.push(policyRecord(executable, args, "powershell", effects));
    return;
  }
  if (["sub_expression", "script_block_expression"].includes(node.type)) {
    for (const child of node.namedChildren) await walkPowerShell(child, state, cloneScope(scope), depth + 1, offset, forced);
    return;
  }
  for (const child of node.namedChildren) await walkPowerShell(child, state, scope, depth, offset, forced);
}

function literal(node: TreeSitter.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (["string", "string_literal", "template_string"].includes(node.type)) {
    const text = node.text;
    if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("`") && text.endsWith("`") && !text.includes("${"))) return text.slice(1, -1);
  }
  return undefined;
}

function callName(node: TreeSitter.Node): string {
  const fn = node.childForFieldName("function");
  if (!fn) return "";
  if (["identifier", "attribute", "member_expression"].includes(fn.type)) return fn.text.replace(/\?\./g, ".");
  return fn.text;
}

function callArguments(node: TreeSitter.Node): TreeSitter.Node[] {
  const args = node.childForFieldName("arguments");
  if (!args) return [];
  return args.namedChildren.filter((child) => !["comment"].includes(child.type));
}

async function walkProgram(root: TreeSitter.Node, language: "python" | "javascript" | "typescript", state: State, scope: Scope, depth: number, forcedRange: { start: number; end: number }): Promise<void> {
  const calls = root.descendantsOfType(language === "python" ? "call" : "call_expression");
  for (const call of calls) {
    const name = callName(call);
    const lower = name.toLowerCase();
    const args = callArguments(call);
    const first = literal(args[0]);
    const range = forcedRange;
    const fileTarget = first === undefined ? unknown(args[0]?.text ?? "<missing>", `${name || "call"} file operand is missing or dynamic`) : staticTarget(first, scope.cwd, state.home);
    if (/\b(?:unlink|unlinksync|rmdir|rmdirsync|rmtree|remove)$/.test(lower) || /\b(?:rm|rmsync)$/.test(lower)) {
      addEffect(state, "filesystem", "delete", scope, language, name, range, [fileTarget]);
    } else if (/\b(?:readfile|readfilesync|createreadstream|read_text|read_bytes)$/.test(lower)) {
      addEffect(state, "filesystem", "read", scope, language, name, range, [fileTarget]);
    } else if (/\b(?:writefile|writefilesync|createwritestream|write_text|write_bytes)$/.test(lower)) {
      addEffect(state, "filesystem", "truncate", scope, language, name, range, [fileTarget]);
    } else if (/\b(?:appendfile|appendfilesync)$/.test(lower)) {
      addEffect(state, "filesystem", "write", scope, language, name, range, [fileTarget]);
    } else if (language === "python" && lower === "open") {
      const mode = literal(args[1]) ?? "r";
      addEffect(state, "filesystem", mode.includes("w") ? "truncate" : mode.includes("a") || mode.includes("x") ? "write" : "read", scope, language, name, range, [fileTarget]);
    } else if (/\b(?:system|exec|execsync)$/.test(lower)) {
      addEffect(state, "execution", "execute", scope, language, name, range);
      if (first === undefined) addUnknown(state, scope, language, name, range, `${name} process payload is missing or dynamic`, args[0]?.text ?? "<missing>");
      else await analyzeEmbedded("bash", first, state, cloneScope(scope), depth + 1, range);
    } else if (/\b(?:spawn|spawnsync|execfile|execfilesync|popen|run|call|check_call|check_output)$/.test(lower)) {
      addOpaqueExecution(state, scope, language, name, range, `${name} structured process invocation requires review because it is not fully resolved`);
    } else {
      // The grammar parsed the call, but this bounded analyzer does not claim
      // arbitrary-program completeness. Unsupported calls are explicit only
      // when they are recognizable I/O/process namespaces.
      if (/^(?:fs|os|shutil|subprocess|child_process|pathlib|path\.)/.test(lower)) addUnknown(state, scope, language, name || "call", range, `unsupported ${language} I/O or process call`, call.text);
    }
  }
}

function ruleExec(rule: CompiledRule, record: CommandRecord): RegExpExecArray | null {
  if (!record.matchable || !rule.languages.includes(record.language)) return null;
  rule.compiled.lastIndex = 0;
  const result = rule.compiled.exec(record.text);
  rule.compiled.lastIndex = 0;
  // A rule may span options after the executable, but it may not begin in an
  // inert data argument. Nested executable contexts have their own records.
  return result && result.index <= record.executableEnd ? result : null;
}

export async function analyzeShell(request: ToolRequest, dependencies: ShellDependencies = {}): Promise<Analysis> {
  if (request.tool !== "bash" && request.tool !== "powershell") {
    return { effects: [], matches: [], uncertainties: ["shell analyzer received a non-shell request"], health: { status: "failed", reason: "unsupported request" } };
  }
  const state: State = {
    effects: [], uncertainties: [], records: [], nextEffect: 0,
    budget: dependencies.parseBudgetMs ?? 50,
    now: dependencies.now ?? Date.now,
    home: dependencies.home ?? os.homedir(),
    dependencies,
    repositoryRoot: path.resolve(dependencies.repositoryRoot ?? request.cwd),
    docker: [], searches: [], semanticMatches: [],
  };
  try {
    const parsed = await parse(request.language, request.input.command, state);
    if (!parsed.tree) {
      addUnknown(state, { cwd: request.cwd, variables: new Map(), unknownVariables: new Set(), functions: new Map() }, request.language, "parser", { start: 0, end: request.input.command.length }, `Parsing valid or unresolved ${request.language} input exceeded the ${state.budget} ms budget`, "<parse deadline>");
      return { effects: state.effects, matches: [], uncertainties: state.uncertainties, health: { status: "ready" }, internal: { docker: [] } };
    }
    const parseHadError = parsed.tree.rootNode.hasError;
    try {
      if (parseHadError) {
        state.uncertainties.push(`${request.language} input contains unresolved syntax`);
        addEffect(state, "execution", "unknown", { cwd: request.cwd, variables: new Map(), unknownVariables: new Set(), functions: new Map() }, request.language, "parser", { start: 0, end: request.input.command.length }, [unknown("<syntax>", `${request.language} syntax could not be fully resolved`)], [], [], `${request.language} syntax could not be fully resolved`);
      }
      const scope: Scope = { cwd: request.cwd, variables: new Map(), unknownVariables: new Set(), functions: new Map() };
      if (request.language === "bash") await walkBash(parsed.tree.rootNode, state, scope, 0, 0);
      else await walkPowerShell(parsed.tree.rootNode, state, scope, 0, 0);
    } finally { parsed.tree.delete(); }

    const matches = (dependencies.rules ?? []).flatMap((rule) => state.records.flatMap((record) => ruleExec(rule, record) ? [{
      ruleId: rule.id,
      action: rule.action,
      applicability: "confirmed" as const,
      reason: rule.reason,
      effects: record.effects,
    }] : []));
    const directCreation = state.docker.length === 1 && state.records.length === 1 && state.effects.length === 1 && !parseHadError;
    for (const invocation of state.docker) invocation.directCreation &&= directCreation;
    return { effects: state.effects, matches: [...matches, ...state.semanticMatches], uncertainties: [...new Set(state.uncertainties)], health: { status: "ready" }, internal: { docker: state.docker, searches: state.searches } };
  } catch (error) {
    return { effects: [], matches: [], uncertainties: [], health: { status: "failed", reason: error instanceof Error ? error.message : String(error) }, internal: { docker: [] } };
  }
}
