import { result, type HerdrCli } from "./herdr-cli.ts";

export type HerdrAgentAction = {
  action: "list" | "get" | "read" | "prompt" | "wait" | "sendKeys";
  target?: string;
  message?: string;
  wait?: boolean;
  until?: "idle" | "working" | "blocked" | "done" | "unknown";
  timeoutSeconds?: number;
  lines?: number;
  keys?: string[];
};

const MAX_TIMEOUT_SECONDS = 120;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_READ_LINES = 200;
const DEFAULT_READ_LINES = 80;
const MAX_READ_CHARS = 6000;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Herdr returned an invalid ${label}`);
  return value as Record<string, unknown>;
}

function required(value: string | undefined, label: string): string {
  if (!value?.trim() || value.includes("\0")) throw new Error(`${label} required`);
  return value;
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number, label: string): number {
  const selected = value ?? fallback;
  if (!Number.isInteger(selected) || selected < 1 || selected > maximum) throw new Error(`${label} must be between 1 and ${maximum}`);
  return selected;
}

function compactAgent(value: unknown): Record<string, unknown> {
  const agent = record(value, "agent entry");
  const compact: Record<string, unknown> = {};
  const name = agent.name ?? agent.agent_name;
  if (typeof name === "string" && name) compact.name = name;
  const kind = agent.agent ?? agent.agent_kind ?? agent.kind;
  if (typeof kind === "string") compact.kind = kind;
  const status = agent.status ?? agent.agent_status ?? agent.state;
  if (typeof status === "string") compact.status = status;
  for (const key of ["pane_id", "workspace_id", "tab_id", "label", "tab_label", "workspace_label", "cwd", "foreground_process", "foreground_process_name", "process_name", "foreground_pid", "shell_pid"]) {
    if (typeof agent[key] === "string" || typeof agent[key] === "number") compact[key] = agent[key];
  }
  if (typeof compact.pane_id !== "string" || !compact.pane_id) throw new Error("Herdr agent entry omitted exact pane identity");
  if (typeof compact.status !== "string") throw new Error("Herdr agent entry omitted lifecycle state");
  const session = agent.agent_session;
  const sessionValue = session && typeof session === "object" ? (session as Record<string, unknown>).value : undefined;
  if (kind === "pi" && typeof sessionValue === "string") {
    // Native Pi metadata is a UUID or a session filename ending in _<UUID>.jsonl.
    const uuid = /(?:^|[/\\_])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.jsonl)?$/i.exec(sessionValue)?.[1]?.toLowerCase();
    if (uuid) {
      compact.pi_session_uuid = uuid;
      // Public default identity format from Onclave buildAgentCard/shortInstanceId.
      // These derived values do not prove registration or map --onclave-id overrides.
      compact.onclave_default_id = `pi-${uuid}`;
      compact.onclave_alias = `pi-${uuid.split("-")[4]!.slice(0, 8)}`;
    }
  }
  return compact;
}

async function agentInventory(cli: HerdrCli, signal?: AbortSignal, requireComplete = false): Promise<Record<string, unknown>[]> {
  const response = record(result(await cli(["agent", "list"], { signal })), "agent list response");
  if (!Array.isArray(response.agents)) throw new Error("Herdr omitted agent list");
  if (requireComplete && (response.truncated === true || (typeof response.total === "number" && response.total > response.agents.length))) {
    throw new Error("Herdr agent inventory is incomplete; cannot resolve the local target");
  }
  const agents = response.agents.map(compactAgent);
  const layout = record(result(await cli(["pane", "list"], { signal })), "pane list response");
  if (!Array.isArray(layout.panes)) throw new Error("Herdr omitted connected pane inventory");
  const panes = new Map(layout.panes.map(value => {
    const pane = record(value, "pane inventory entry");
    return [pane.pane_id, pane];
  }));
  return agents.map(agent => {
    const pane = panes.get(agent.pane_id);
    if (!pane) return agent;
    const context: Record<string, unknown> = {};
    for (const key of ["label", "tab_label", "workspace_label", "tab_id", "workspace_id", "cwd"]) {
      if (typeof pane[key] === "string") context[key] = pane[key];
    }
    if (!context.cwd && typeof pane.foreground_cwd === "string") context.cwd = pane.foreground_cwd;
    return { ...context, ...agent };
  });
}

async function resolveTarget(cli: HerdrCli, target: string, signal?: AbortSignal) {
  if (!target.startsWith("pi-")) return { target };
  const agents = await agentInventory(cli, signal, true);
  const candidates = new Map(agents.filter(agent => agent.name === target || agent.onclave_default_id === target || agent.onclave_alias === target).map(agent => [agent.pane_id, agent]));
  if (candidates.size > 1) throw new Error(`Ambiguous local Herdr target ${target}; candidates: ${JSON.stringify([...candidates.values()])}`);
  const agent = [...candidates.values()][0];
  if (!agent) throw new Error(`No local Herdr match for ${target} in the connected server inventory; custom Onclave IDs are not mapped by session metadata`);
  return { target: agent.pane_id as string, requested_target: target, resolved_agent: agent };
}

function targetResult(value: unknown, target: string): Record<string, unknown> {
  const response = record(value, "agent response");
  const agent = response.agent === undefined ? response : record(response.agent, "agent response");
  const returnedPane = agent.pane_id;
  const returnedName = agent.name ?? agent.agent_name;
  if (target !== returnedPane && target !== returnedName) throw new Error("Herdr agent response did not match the exact target");
  return response;
}

function boundedResponse(value: unknown): unknown {
  const response = record(value, "agent response");
  const preferred = response.agent ?? response.state ?? response.prompt ?? response.wait ?? response.result ?? response;
  if (typeof preferred === "string") return preferred.slice(0, 500);
  const fields = record(preferred, "agent response details");
  const compact: Record<string, unknown> = {};
  for (const key of ["name", "agent_name", "pane_id", "target", "kind", "agent_kind", "status", "agent_status", "state", "workspace_id", "tab_id", "type", "ok", "accepted", "submitted", "prompt_submitted", "matched", "sent", "keys_sent", "waited", "message", "error", "reason"]) {
    const field = fields[key];
    if (typeof field === "string") compact[key] = field.slice(0, 500);
    else if (typeof field === "number" || typeof field === "boolean") compact[key] = field;
  }
  if (Object.keys(compact).length === 0) throw new Error("Herdr agent response omitted recognized status fields");
  if (typeof fields.pane_id === "string" && typeof (fields.status ?? fields.agent_status ?? fields.state) === "string") {
    return { ...compact, ...compactAgent(fields) };
  }
  return compact;
}

export async function herdrAgentAction(cli: HerdrCli, params: HerdrAgentAction, signal?: AbortSignal): Promise<unknown> {
  if (params.action === "list") {
    const inventory = await agentInventory(cli, signal);
    const agents = inventory.slice(0, 80);
    return { agents, total: inventory.length, truncated: inventory.length > agents.length };
  }

  const { target, ...resolution } = await resolveTarget(cli, required(params.target, "target"), signal);
  if (params.action === "get") {
    const response = targetResult(result(await cli(["agent", "get", target], { signal })), target);
    return { ...compactAgent(response.agent ?? response), ...resolution };
  }
  if (params.action === "read") {
    const lines = boundedInteger(params.lines, DEFAULT_READ_LINES, MAX_READ_LINES, "lines");
    const output = await cli(["agent", "read", target, "--source", "recent-unwrapped", "--lines", String(lines)], { signal });
    return { target, ...resolution, lines, output: output.slice(-MAX_READ_CHARS) };
  }
  if (params.action === "prompt") {
    const message = required(params.message, "message");
    const args = ["agent", "prompt", target, message];
    if (params.wait) {
      const timeoutSeconds = boundedInteger(params.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, "timeoutSeconds");
      args.push("--wait", "--timeout", String(timeoutSeconds * 1000));
      const response = result(await cli(args, { timeoutMs: timeoutSeconds * 1000 + 2000, signal }));
      return { target, ...resolution, submitted: true, waited: true, response: boundedResponse(response) };
    }
    const output = await cli(args, { signal });
    if (!output.trim()) return { target, ...resolution, submitted: true, waited: false };
    return { target, ...resolution, submitted: true, waited: false, response: boundedResponse(result(output)) };
  }
  if (params.action === "wait") {
    const timeoutSeconds = boundedInteger(params.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, "timeoutSeconds");
    const args = ["agent", "wait", target];
    if (params.until) args.push("--until", params.until);
    args.push("--timeout", String(timeoutSeconds * 1000));
    const response = result(await cli(args, { timeoutMs: timeoutSeconds * 1000 + 2000, signal }));
    return { target, ...resolution, response: boundedResponse(response) };
  }
  const keys = params.keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 16 || keys.some(key => !key.trim() || key.length > 32 || key.includes("\0"))) {
    throw new Error("keys must contain 1 to 16 non-empty logical keys");
  }
  const output = await cli(["agent", "send-keys", target, ...keys], { signal });
  if (!output.trim()) return { target, ...resolution, keys, submitted: true };
  return { target, ...resolution, keys, submitted: true, response: boundedResponse(result(output)) };
}
