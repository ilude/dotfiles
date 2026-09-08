// Local enforcement contracts. No I/O, prompts, model calls, or permission cache.
export type Language = "bash" | "powershell" | "python" | "javascript" | "typescript";
export type NativeTool = "bash" | "powershell" | "read" | "write" | "edit" | "grep" | "find" | "ls";
export type Replacement = { oldText: string; newText: string };
export type ToolRequest = { callId: string; cwd: string; text: string } & (
  | { tool: "bash" | "powershell"; language: "bash" | "powershell"; input: { command: string; timeout?: number } }
  | { tool: "read"; input: { path: string; offset?: number; limit?: number } }
  | { tool: "write"; input: { path: string; content: string } }
  | { tool: "edit"; input: { path: string; edits: Replacement[] } }
  | { tool: "grep"; input: { pattern: string; path?: string; glob?: string; ignoreCase?: boolean; literal?: boolean; context?: number; limit?: number } }
  | { tool: "find"; input: { pattern: string; path?: string; limit?: number } }
  | { tool: "ls"; input: { path?: string; limit?: number } }
);
export type Target = { resolution: "static"; path: string } | { resolution: "unknown"; expression: string; reason: string };
export type Effect = {
  id: string;
  kind: "filesystem" | "git" | "docker" | "network" | "execution" | "database";
  operation: "read" | "metadata" | "write" | "delete" | "truncate" | "execute" | "upload" | "mutate" | "unknown";
  sources: Target[];
  targets: Target[];
  destinations: Target[];
  context: { cwd: string; language?: Language; executable?: string; daemon?: string; resourceId?: string; mountedData?: boolean };
  range: { start: number; end: number };
} & ({ resolution: "static" } | { resolution: "unknown"; reason: string });
export type RuleAction = "block" | "user" | "review";
export type RuleMatch = {
  ruleId: string;
  action: RuleAction;
  applicability: "confirmed" | "candidate";
  reason: string;
  effects: string[];
};
export type Health = { status: "ready" } | { status: "failed"; reason: string };
export type DockerEnvironmentKey = "DOCKER_CONTEXT" | "DOCKER_HOST" | "DOCKER_CONFIG" | "DOCKER_TLS_VERIFY" | "DOCKER_CERT_PATH";
export type DockerEndpoint = {
  executable: "docker";
  cwd: string;
  /** Static Docker global options in their original order, before the subcommand. */
  globalArgs: string[];
  /** Only endpoint-selection variables are copied; never arbitrary command environment. */
  environment: Partial<Record<DockerEnvironmentKey, string>>;
  contextHint?: string;
  hostOverride?: string;
  unresolved?: string;
};
export type DockerInvocation = {
  effectId: string;
  operation: "metadata" | "create" | "delete-container" | "delete-volume" | "exec" | "other";
  resources: string[];
  endpoint: DockerEndpoint;
  nestedEffectIds: string[];
  removesVolumes: boolean;
  directCreation: boolean;
};
export type DockerMount = {
  type: "bind" | "volume" | "tmpfs" | "npipe" | "cluster";
  destination: string;
  source?: string;
  name?: string;
  readWrite?: boolean;
};
export type DockerContainerIdentity = { daemonId: string; containerId: string; name: string; mounts: DockerMount[] };
export type DockerMetadataResult =
  | { status: "resolved"; daemonId: string; context?: string; host?: string; containers: DockerContainerIdentity[] }
  | { status: "unknown"; reason: string };
export type DockerMetadataReader = (endpoint: DockerEndpoint, targets: readonly string[], signal?: AbortSignal) => Promise<DockerMetadataResult>;
/** Parser internals stay local; only the bounded variable projection is copied into review evidence. */
// Parser-resolved argv is local metadata input, never serialized for Luna.
export type ShellSearch = { effectId: string; executable: "rg"; inventoryArgs?: string[] };
export type ScriptSourceIdentity = { path: string; sha256: string; range: { start: number; end: number }; argv: string[] };
export type VariableEvidence = { name: string; value: string; source: "literal" | "inherited" | "process"; provenance: string };
export type Analysis = { effects: Effect[]; matches: RuleMatch[]; uncertainties: string[]; health: Health; internal?: { docker: DockerInvocation[]; searches?: ShellSearch[]; scripts?: ScriptSourceIdentity[]; variables?: VariableEvidence[] } };
export type EnvironmentEvidence = Readonly<Record<string, string | undefined>>;
export type SequenceEvidence = { kind: string; category?: string; summary: string; ageMs: number };
export type Evidence = {
  callId: string;
  operation: string;
  operator: { source: "interactive" | "rpc"; text: string }[];
  untrusted: { effects: Effect[]; priorEffects?: { callId?: string; timestamp: number; effect: Effect }[]; observations?: { callId: string; tool: string; operation: string; cwd: string; output: string; timestamp: number }[]; variables?: VariableEvidence[]; sequence?: { priorEvents: SequenceEvidence[]; currentEvent: SequenceEvidence }; matches: RuleMatch[]; uncertainties: string[] };
  omissions: string[];
};
export type Decision =
  | { outcome: "allow" }
  | { outcome: "block"; reason: string }
  | { outcome: "user"; reason: string; origin?: "policy" | "review" }
  | { outcome: "review"; evidence: Evidence };
export type ReviewResult =
  | { status: "valid"; verdict: "allow" | "ask"; reason: string; dismissedCandidates: string[] }
  | { status: "timeout" | "unavailable" | "invalid" | "cancelled"; reason: string };
export type PendingCall = { callId: string; fingerprint: string; generation: number; signal?: AbortSignal };
export type DockerCreation = { daemonId: string; containerId: string; timestamp: number; callId: string };
export type CommandRule = { id: string; action: RuleAction; regex: string; reason: string; languages: Language[] };
export type CompiledRule = CommandRule & { compiled: RegExp };
export type PathPolicy = {
  zeroAccess: string[]; exclusions: string[]; readOnly: string[]; noDelete: string[]; writeConfirm: string[];
  readConfirm: string[]; generated: string[]; scratch: string[]; integrity: string[];
};
export type Policy = { version: 1; commands: CompiledRule[]; paths: PathPolicy };
export type Settings = {
  version: 1;
  judge: { enabled: boolean; provider: "openai-codex"; model: "gpt-5.6-luna"; reasoning: "high"; deadlineMs: number; retries: 0 };
  parseBudgetMs: number;
};
