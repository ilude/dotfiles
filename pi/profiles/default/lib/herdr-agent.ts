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
  const name = agent.name ?? agent.agent_name ?? agent.agent;
  if (typeof name === "string") compact.name = name;
  const kind = agent.kind ?? agent.agent_kind;
  if (typeof kind === "string") compact.kind = kind;
  const status = agent.status ?? agent.agent_status ?? agent.state;
  if (typeof status === "string") compact.status = status;
  for (const key of ["pane_id", "workspace_id", "tab_id", "cwd", "foreground_process", "foreground_process_name", "process_name", "foreground_pid", "shell_pid"]) {
    if (typeof agent[key] === "string" || typeof agent[key] === "number") compact[key] = agent[key];
  }
  if (typeof compact.name !== "string" || typeof compact.pane_id !== "string" || !compact.pane_id) throw new Error("Herdr agent entry omitted exact name or pane identity");
  if (typeof compact.status !== "string") throw new Error("Herdr agent entry omitted lifecycle state");
  if (typeof agent.kind === "string" || typeof agent.agent_kind === "string") compact.kind = agent.kind ?? agent.agent_kind;
  else if (typeof agent.agent_session === "object" && agent.agent_session !== null && typeof (agent.agent_session as Record<string, unknown>).kind === "string") compact.kind = (agent.agent_session as Record<string, unknown>).kind;
  return compact;
}

function targetResult(value: unknown, target: string): Record<string, unknown> {
  const response = record(value, "agent response");
  const agent = response.agent === undefined ? response : record(response.agent, "agent response");
  const returnedPane = agent.pane_id;
  const returnedName = agent.name ?? agent.agent_name ?? agent.agent;
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
  return compact;
}

export async function herdrAgentAction(cli: HerdrCli, params: HerdrAgentAction, signal?: AbortSignal): Promise<unknown> {
  if (params.action === "list") {
    const response = record(result(await cli(["agent", "list"], { signal })), "agent list response");
    if (!Array.isArray(response.agents)) throw new Error("Herdr omitted agent list");
    const agents = response.agents.slice(0, 80).map(compactAgent);
    return { agents, total: response.agents.length, truncated: response.agents.length > agents.length };
  }

  const target = required(params.target, "target");
  if (params.action === "get") {
    const response = targetResult(result(await cli(["agent", "get", target], { signal })), target);
    return compactAgent(response.agent ?? response);
  }
  if (params.action === "read") {
    const lines = boundedInteger(params.lines, DEFAULT_READ_LINES, MAX_READ_LINES, "lines");
    const output = await cli(["agent", "read", target, "--source", "recent-unwrapped", "--lines", String(lines)], { signal });
    return { target, lines, output: output.slice(-MAX_READ_CHARS) };
  }
  if (params.action === "prompt") {
    const message = required(params.message, "message");
    const args = ["agent", "prompt", target, message];
    if (params.wait) {
      const timeoutSeconds = boundedInteger(params.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, "timeoutSeconds");
      args.push("--wait", "--timeout", String(timeoutSeconds * 1000));
      const response = result(await cli(args, { timeoutMs: timeoutSeconds * 1000 + 2000, signal }));
      return { target, submitted: true, waited: true, response: boundedResponse(response) };
    }
    const output = await cli(args, { signal });
    if (!output.trim()) return { target, submitted: true, waited: false };
    return { target, submitted: true, waited: false, response: boundedResponse(result(output)) };
  }
  if (params.action === "wait") {
    const timeoutSeconds = boundedInteger(params.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, "timeoutSeconds");
    const args = ["agent", "wait", target];
    if (params.until) args.push("--until", params.until);
    args.push("--timeout", String(timeoutSeconds * 1000));
    const response = result(await cli(args, { timeoutMs: timeoutSeconds * 1000 + 2000, signal }));
    return { target, response: boundedResponse(response) };
  }
  const keys = params.keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 16 || keys.some(key => !key.trim() || key.length > 32 || key.includes("\0"))) {
    throw new Error("keys must contain 1 to 16 non-empty logical keys");
  }
  const output = await cli(["agent", "send-keys", target, ...keys], { signal });
  if (!output.trim()) return { target, keys, submitted: true };
  return { target, keys, submitted: true, response: boundedResponse(result(output)) };
}
