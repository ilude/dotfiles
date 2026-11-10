import { join } from "node:path";
import type { T3CloseoutAuthority } from "./t3/closeout.ts";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { resolvePiClient } from "../herdr-host.ts";
import { loadDefinitions, type AgentDefinition } from "./definitions.ts";
import { composedAgentPrompt } from "./guidance.ts";
import { EFFORTS, resolveAgentEffort, resolveModel, resolveSkills, type AgentEffort } from "./options.ts";

export type SubagentBackend = "native" | "t3";
export interface BackendSelectionInput {
  mode?: "tui" | "rpc" | "json" | "print";
  env?: NodeJS.ProcessEnv;
  argv?: readonly string[];
}
/** Factory-time selection, before native tools, subscriptions or managers exist. */
export function selectedSubagentBackend(input: BackendSelectionInput = {}): SubagentBackend {
  const argv = input.argv ?? process.argv.slice(2);
  const index = argv.lastIndexOf("--mode");
  const mode = input.mode ?? (index >= 0 ? argv[index + 1] : argv.find(arg => arg.startsWith("--mode="))?.slice(7));
  return resolvePiClient(mode === "rpc" || mode === "json" ? mode : mode === "print" || argv.includes("--print") ? "print" : "tui", input.env ?? process.env) === "t3code" ? "t3" : "native";
}

export const T3_ROLE_TOOLS = Object.freeze({ subagent: "t3_delegate_role", subagent_control: "t3_role_control", subagent_parent: "t3_role_parent" });
export function backendToolName(canonical: string, backend: SubagentBackend): string {
  if (backend === "native") return canonical;
  switch (canonical) {
    case "subagent": return T3_ROLE_TOOLS.subagent;
    case "subagent_control": return T3_ROLE_TOOLS.subagent_control;
    case "subagent_parent": return T3_ROLE_TOOLS.subagent_parent;
    default: return canonical;
  }
}
export function backendToolNames(canonical: readonly string[], backend: SubagentBackend): readonly string[] {
  return Object.freeze([...new Set(canonical.map(name => backendToolName(name, backend)))]);
}

export type FrozenAgentDefinition = Readonly<Omit<AgentDefinition, "tools" | "delegates" | "skills">> & {
  readonly tools: readonly string[]; readonly delegates: readonly string[]; readonly skills: readonly string[];
};
export interface RoleSkillSource { readonly name: string; readonly source: "profile" | "project"; readonly filePath: string }
/** Serializable role data only. Runtime callbacks must never be added here. */
export interface RoleResolutionSnapshot {
  readonly version: 1;
  readonly backend: SubagentBackend;
  readonly definition: FrozenAgentDefinition;
  readonly prompt: string;
  readonly model: { readonly provider: string; readonly id: string; readonly qualified: string; readonly source: "explicit" | "definition" };
  readonly effort: AgentEffort;
  readonly effortSource: "explicit" | "definition" | "default";
  readonly skills: readonly RoleSkillSource[];
  readonly backendTools: readonly string[];
  readonly profile: string;
  readonly cwd: string;
  readonly projectTrusted: boolean;
}
export interface ResolveRoleOptions {
  agent: string; backend: SubagentBackend; profile: string; cwd: string; projectTrusted: boolean;
  model?: string; effort?: AgentEffort; skills?: readonly string[];
  parentDelegates?: readonly string[];
  modelRegistry?: ModelRegistry;
}
/** Uses the same trusted catalog, tombstones, aliases, constraints and skill precedence as native launch. */
export function resolveRoleSnapshot(options: ResolveRoleOptions): RoleResolutionSnapshot {
  const catalog = loadDefinitions(options.cwd, options.projectTrusted, options.profile);
  const definition = catalog.agents.get(options.agent);
  if (!definition) throw new Error(`Unknown or invalid agent ${options.agent}. ${catalog.errors.join("; ")}`);
  if (options.parentDelegates && !options.parentDelegates.includes(definition.name)) throw new Error("Delegation is outside frozen authority");
  const model = resolveModel(options.model ?? definition.model, undefined, options.modelRegistry);
  const qualified = `${model.provider}/${model.id}`;
  const skills = resolveSkills(options.profile, definition.skills, options.skills ?? [], { cwd: options.cwd, projectTrusted: options.projectTrusted });
  const names = [...new Set([...definition.skills, ...(options.skills ?? [])])];
  // Validate and detach through the same boundary used by persisted snapshots.
  return parseRoleSnapshot({ version: 1, backend: options.backend, definition,
    prompt: composedAgentPrompt(definition, catalog.agents, options.parentDelegates, options.backend),
    model: { provider: model.provider, id: model.id, qualified, source: options.model === undefined ? "definition" : "explicit" },
    effort: resolveAgentEffort(definition.name, qualified, options.effort, definition.effort),
    effortSource: options.effort !== undefined ? "explicit" : definition.effort !== undefined ? "definition" : "default",
    skills: skills.map((filePath, index) => ({ name: names[index], filePath, source: filePath === join(options.profile, "skills", names[index], "SKILL.md") ? "profile" : "project" })),
    backendTools: backendToolNames(definition.tools, options.backend), profile: options.profile, cwd: options.cwd, projectTrusted: options.projectTrusted });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid role authority object");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid role authority ${field}`);
  return value;
}
function strings(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`Invalid role authority ${field}`);
  return Object.freeze(value.map(item => text(item, field)));
}
function effort(value: unknown): AgentEffort {
  for (const candidate of EFFORTS) if (candidate === value) return candidate;
  throw new Error("Invalid role authority effort");
}
/** Shape validation is not authentication. Callers still verify lineage, profile and stored handoff provenance. */
export function parseRoleSnapshot(value: unknown): RoleResolutionSnapshot {
  const v = record(value), d = record(v.definition), m = record(v.model);
  if (v.version !== 1 || (v.backend !== "native" && v.backend !== "t3") || typeof v.projectTrusted !== "boolean" || !Array.isArray(v.skills)) throw new Error("Invalid role snapshot");
  if ((d.source !== "profile" && d.source !== "project") || (m.source !== "explicit" && m.source !== "definition") || (v.effortSource !== "explicit" && v.effortSource !== "definition" && v.effortSource !== "default")) throw new Error("Invalid role snapshot source");
  if (typeof d.prompt !== "string" || typeof v.prompt !== "string") throw new Error("Invalid role prompt");
  const definition: FrozenAgentDefinition = Object.freeze({ name: text(d.name, "name"), description: text(d.description, "description"), tools: strings(d.tools, "tools"), delegates: strings(d.delegates, "delegates"), skills: strings(d.skills, "skills"), model: d.model === undefined ? undefined : text(d.model, "model"), effort: d.effort === undefined ? undefined : effort(d.effort), prompt: d.prompt, source: d.source, filePath: text(d.filePath, "filePath") });
  const provider = text(m.provider, "provider"), id = text(m.id, "model id");
  if (m.qualified !== `${provider}/${id}`) throw new Error("Invalid qualified role model");
  const selectedEffort = effort(v.effort);
  resolveAgentEffort(definition.name, m.qualified, selectedEffort, undefined);
  const backendTools = strings(v.backendTools, "backendTools");
  if (JSON.stringify(backendTools) !== JSON.stringify(backendToolNames(definition.tools, v.backend))) throw new Error("Role backend tools do not match canonical authority");
  const skills = v.skills.map(item => {
    const s = record(item);
    if (s.source !== "profile" && s.source !== "project") throw new Error("Invalid skill source");
    return Object.freeze({ name: text(s.name, "skill name"), source: s.source, filePath: text(s.filePath, "skill path") });
  });
  return Object.freeze({ version: 1, backend: v.backend, definition, prompt: v.prompt, model: Object.freeze({ provider, id, qualified: m.qualified, source: m.source }), effort: selectedEffort, effortSource: v.effortSource, skills: Object.freeze(skills), backendTools, profile: text(v.profile, "profile"), cwd: text(v.cwd, "cwd"), projectTrusted: v.projectTrusted });
}

export interface SubagentAuthority {
  readonly backend: SubagentBackend;
  readonly id: string;
  readonly agent: string;
  readonly tools: readonly string[];
  readonly canonicalTools: readonly string[];
  readonly delegates: readonly string[];
  readonly skills: readonly string[];
  readonly cwd: string;
  readonly parentId?: string;
  readonly goalRunId?: string;
  /** Issued only by the authenticated T3 bootstrap runtime, never parsed from environment. */
  readonly closeout?: T3CloseoutAuthority;
}
/** Only the existing native runtime envelope is accepted from environment input. Never manufacture it for T3. */
export function nativeSubagentAuthority(env: NodeJS.ProcessEnv = process.env): SubagentAuthority | undefined {
  if (!env.PI_SUBAGENT_AUTHORITY) return undefined;
  const v = record(JSON.parse(env.PI_SUBAGENT_AUTHORITY));
  const tools = strings(v.tools, "tools");
  return Object.freeze({ backend: "native", id: text(v.id, "id"), agent: text(v.agent, "agent"), tools, canonicalTools: tools, delegates: strings(v.delegates, "delegates"), skills: strings(v.skills, "skills"), cwd: text(v.cwd, "cwd"), parentId: v.parentId === undefined ? undefined : text(v.parentId, "parentId"), goalRunId: v.goalRunId === undefined ? undefined : text(v.goalRunId, "goalRunId") });
}
export const SUBAGENT_AUTHORITY_EVENT = "subagent:authority";
export const SUBAGENT_AUTHORITY_CHANGED = "subagent:authority-changed";
/** Native inspection keeps its historical process-frozen marker. T3 must resolve at dispatch. */
export function subagentInspectionPolicy(events?: AuthorityEvents): () => boolean {
  if (process.env.PI_SUBAGENT_AUTHORITY) {
    let inspection = false;
    try { inspection = JSON.parse(process.env.PI_SUBAGENT_AUTHORITY)?.agent === "explorer"; } catch { /* native authority owner rejects malformed envelopes */ }
    return () => inspection;
  }
  return () => getSubagentAuthority(events)?.agent === "explorer";
}
type AuthorityEvents = { emit(name: string, value: unknown): void };
/** Read at the operative boundary, including consumers loaded before T3 bootstrap. */
export function getSubagentAuthority(events?: AuthorityEvents): SubagentAuthority | undefined {
  const native = nativeSubagentAuthority();
  if (native) return native;
  let authority: SubagentAuthority | undefined;
  events?.emit(SUBAGENT_AUTHORITY_EVENT, { respond: (value: SubagentAuthority | undefined) => { authority = value; } });
  return authority;
}

/** Supply T3 state only after the owning bootstrap has authenticated its binding. Native identity wins inherited markers. */
export function subagentAuthority(t3?: { launchId: string; snapshot: RoleResolutionSnapshot; goalRunId?: string }, env: NodeJS.ProcessEnv = process.env): SubagentAuthority | undefined {
  const native = nativeSubagentAuthority(env);
  if (native || !t3) return native;
  const snapshot = parseRoleSnapshot(t3.snapshot);
  if (snapshot.backend !== "t3") throw new Error("Expected T3 role snapshot");
  return Object.freeze({ backend: "t3", id: text(t3.launchId, "launchId"), agent: snapshot.definition.name, tools: snapshot.backendTools, canonicalTools: snapshot.definition.tools, delegates: snapshot.definition.delegates, skills: Object.freeze(snapshot.skills.map(s => s.filePath)), cwd: snapshot.cwd, goalRunId: t3.goalRunId });
}
