import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { parse as parseYaml } from "yaml";

import { EFFORTS, type AgentEffort } from "./options.ts";
export { EFFORTS, resolveAgentEffort, resolveModel, type AgentEffort } from "./options.ts";
export interface AgentDefinition { name: string; description: string; tools: string[]; delegates: string[]; model?: string; effort?: AgentEffort; skills: string[]; prompt: string; source: "profile" | "project"; filePath: string }
export interface DefinitionCatalog { agents: Map<string, AgentDefinition>; errors: string[]; projectDir?: string }
const NAME = /^[a-z][a-z0-9_-]*$/;
const scalar = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : undefined;
function list(v: unknown, required = false): string[] | undefined {
  if (Array.isArray(v) && v.every(x => typeof x === "string")) return v.map(String).map(x => x.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map(x => x.trim()).filter(Boolean);
  return v === undefined && !required ? [] : undefined;
}
function parse(filePath: string, source: AgentDefinition["source"]): AgentDefinition {
  const content = readFileSync(filePath, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) throw new Error("YAML frontmatter is required");
  const parsed: unknown = parseYaml(match[1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("frontmatter must be a mapping");
  const f = parsed as Record<string, unknown>;
  const body = match[2];
  const name = scalar(f.name), description = scalar(f.description), tools = list(f.tools, true);
  if (!name || !NAME.test(name) || !description || !tools) throw new Error("required name, description, and tools are invalid");
  if (name !== basename(filePath, ".md")) throw new Error("definition name must match filename");
  const delegates = list(f.delegates), skills = list(f.skills);
  if (!delegates || !skills) throw new Error("delegates and skills must be lists");
  for (const field of ["model", "effort"] as const) {
    if (f[field] !== undefined && !scalar(f[field])) throw new Error(`${field} must be a nonblank string`);
  }
  if (![...tools, ...delegates, ...skills].every(NAME.test.bind(NAME))) throw new Error("tool, delegate, or skill name is invalid");
  const effort = scalar(f.effort);
  if (effort && !EFFORTS.includes(effort as AgentEffort)) throw new Error(`invalid effort ${effort}`);
  return Object.freeze({ name, description, tools: Object.freeze([...new Set(tools)]) as unknown as string[], delegates: Object.freeze([...new Set(delegates)]) as unknown as string[], model: scalar(f.model), effort: effort as AgentEffort | undefined, skills: Object.freeze([...new Set(skills)]) as unknown as string[], prompt: body.trim(), source, filePath });
}
function files(dir: string): string[] { try { return readdirSync(dir, { withFileTypes: true }).filter(e => (e.isFile() || e.isSymbolicLink()) && e.name.endsWith(".md")).map(e => join(dir, e.name)).sort(); } catch { return []; } }
function nearest(cwd: string): string | undefined { let at = resolve(cwd); for (;;) { const p = join(at, ".pi", "agents"); if (existsSync(p) && statSync(p).isDirectory()) return realpathSync.native(p); const up = dirname(at); if (up === at) return; at = up; } }
export function loadDefinitions(cwd: string, projectTrusted: boolean, agentDir = getAgentDir()): DefinitionCatalog {
  const profileDir = join(agentDir, "agents"), projectDir = projectTrusted ? nearest(cwd) : undefined;
  const agents = new Map<string, AgentDefinition>(), errors: string[] = [];
  const sources: Array<readonly [string, AgentDefinition["source"]]> = [[profileDir, "profile"]];
  if (projectDir) sources.push([projectDir, "project"]);
  for (const [dir, source] of sources) {
    const disabled=new Set<string>();
    for (const file of files(dir)) {
      let hinted = file.replace(/^.*[\\/]/, "").replace(/\.md$/, "");
      try { const d = parse(file, source); hinted = d.name; agents.set(d.name, d); }
      catch (e) {
        if(source==="project"){
          disabled.add(hinted);
          try{const match=/^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file,"utf8"));const name=match?scalar(parseYaml(match[1])?.name):undefined;if(name&&NAME.test(name))disabled.add(name)}catch{/* Filename remains a tombstone when frontmatter cannot be parsed. */}
        }
        errors.push(`${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    for(const name of disabled)agents.delete(name);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of agents.values()) {
      const invalid = d.delegates.find(child => !agents.has(child) || agents.get(child)!.delegates.length > 0);
      if (invalid) {
        errors.push(`${d.filePath}: unknown or coordinator delegate ${invalid}`);
        agents.delete(d.name);
        changed = true;
      }
    }
  }
  return { agents, errors, projectDir };
}
