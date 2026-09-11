import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { readSessionHeader } from "./log-analytics/sessions.ts";
import { result, type HerdrCli } from "./herdr-cli.ts";
import { createHerdrPiTab } from "../extensions/session-launch.ts";

/** Locate an exact UUID by filename, then read only its native session header. */
export async function resolveResumeSession(session: string, sessionsRoot: string, signal?: AbortSignal) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(session)) throw new Error("resume requires an existing session UUID");
  const files: string[] = [];
  for (const directory of await readdir(sessionsRoot, { withFileTypes: true })) {
    signal?.throwIfAborted();
    if (!directory.isDirectory()) continue;
    for (const file of await readdir(join(sessionsRoot, directory.name))) {
      if (file.toLowerCase().endsWith(`_${session.toLowerCase()}.jsonl`)) files.push(join(sessionsRoot, directory.name, file));
    }
  }
  if (files.length !== 1) throw new Error(files.length ? "Session UUID matches multiple files" : `Session not found in the active profile: ${session}`);
  const file = files[0]!;
  const header = await readSessionHeader(file, signal);
  if (header.id.toLowerCase() !== session.toLowerCase() || !header.cwd) throw new Error("Session header does not match the requested UUID or has no cwd");
  return { session: header.id, file, cwd: header.cwd };
}

/** Resume without shell input. A partial launch is returned, never retried. */
export async function resumeHerdrSession(session: string, sessionsRoot: string, cli: HerdrCli, signal?: AbortSignal) {
  const target = await resolveResumeSession(session, sessionsRoot, signal);
  signal?.throwIfAborted();
  const launched = await createHerdrPiTab(target.cwd, basename(target.cwd.replace(/[\\/]$/, "")) || "pi", target.file);
  const receipt = { session: target.session, tab: launched.tabId, pane: launched.paneId, cwd: target.cwd, focused: true };
  const deadline = Date.now() + 30_000;
  let issue = "Pi has not reported the resumed session yet";
  while (launched.paneId && Date.now() < deadline && !signal?.aborted) {
    try {
      const agent = result(await cli(["agent", "get", launched.paneId], { signal })).agent;
      if (agent?.agent === "pi" && agent.agent_session?.value === target.session && ["idle", "done", "working", "blocked"].includes(agent.agent_status)) {
        return { ...receipt, ready: true, state: agent.agent_status };
      }
    } catch (error) {
      if (signal?.aborted) break;
      issue = error instanceof Error ? error.message : String(error);
    }
    await delay(200, undefined, { signal }).catch(() => undefined);
  }
  return { ...receipt, ready: false, reason: signal?.aborted ? "Startup check cancelled; tab may still be starting" : issue, next: "Inspect this tab; do not create another resume tab automatically." };
}
