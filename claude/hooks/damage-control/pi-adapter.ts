#!/usr/bin/env bun
import { homedir } from "node:os";
import { resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { analyzeRequest } from "../../../pi/profiles/default/lib/damage-control/analysis.ts";
import { decide } from "../../../pi/profiles/default/lib/damage-control/engine.ts";
import type { Evidence } from "../../../pi/profiles/default/lib/damage-control/types.ts";
import { adapt } from "../../../pi/profiles/default/lib/damage-control/adapters.ts";
import { loadPolicy } from "../../../pi/profiles/default/lib/damage-control/policy.ts";
import { requireGrammars } from "../../../pi/profiles/default/lib/damage-control/shell.ts";
import { nativeRealpath, type PathFacts } from "../../../pi/profiles/default/lib/damage-control/paths.ts";

const profile = resolve(import.meta.dir, "../../../pi/profiles/default");
const deny = (reason: string) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason.slice(0, 3000) } }));
const main = async () => {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await Bun.stdin.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Hook input must be a JSON object");
    data = parsed as Record<string, unknown>;
    if (typeof data.tool_name !== "string" || !["Bash", "Edit", "Write"].includes(data.tool_name) || typeof data.cwd !== "string" || !data.cwd.trim() || !data.tool_input || typeof data.tool_input !== "object" || Array.isArray(data.tool_input)) throw new Error("Malformed PreToolUse input");
  } catch (error) { deny(`Invalid Damage Control hook input: ${error instanceof Error ? error.message : "parse error"}`); return; }
  try {
    const loaded = await loadPolicy(profile);
    const input = data.tool_input as Record<string, unknown>;
    const tool = data.tool_name === "Bash" ? "bash" : data.tool_name === "Edit" ? "edit" : "write";
    if (tool === "edit" && input.replace_all !== undefined && typeof input.replace_all !== "boolean") throw new Error("Invalid Claude Edit replace_all value");
    if (tool === "edit" && input.replace_all) throw new Error("Claude Edit replace_all is unsupported by the deterministic adapter");
    const normalized = tool === "bash" ? { command: input.command } : tool === "write" ? { path: input.file_path, content: input.content } : { path: input.file_path, edits: [{ oldText: input.old_string, newText: input.new_string }] };
    const adapted = adapt(tool, typeof data.tool_use_id === "string" ? data.tool_use_id : "claude-hook", normalized, data.cwd);
    if (adapted.status !== "adapted") throw new Error(adapted.status === "unsupported" ? adapted.reason : `Unsupported tool ${adapted.tool}`);
    if (tool === "bash") await requireGrammars();
    const facts: PathFacts = { platform: process.platform === "win32" ? "win32" : "posix", home: homedir(), cwd: resolve(data.cwd), profile, repo: resolve(data.cwd), realpath: nativeRealpath };
    const { analysis } = await analyzeRequest(adapted.request, facts, { wasCreated: () => false, wasDockerCreated: () => false }, loaded);
    const evidence: Evidence = { callId: adapted.request.callId, operation: tool, operator: [], pendingCall: { tool, input: adapted.request.input, cwd: adapted.request.cwd }, untrusted: { effects: analysis.effects, matches: analysis.matches, uncertainties: analysis.uncertainties }, omissions: [] };
    const decision = decide(analysis, evidence);
    if (decision.outcome === "block") deny(decision.reason);
    else if (decision.outcome === "user" || decision.outcome === "review") process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: "Damage Control requires operator review: " + (decision.reason ?? "contextual review unavailable") } }));
  } catch (error) { deny(`Damage Control failed closed: ${error instanceof Error ? error.message : "analysis failed"}`); }
};
await main();
