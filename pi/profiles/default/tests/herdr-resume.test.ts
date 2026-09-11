import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveResumeSession, resumeHerdrSession } from "../lib/herdr-resume.ts";
import { createHerdrPiTab, HerdrPiTabLaunchError } from "../extensions/session-launch.ts";
import type { HerdrCli } from "../lib/herdr-cli.ts";
vi.mock("../extensions/session-launch.ts", async importOriginal => ({ ...await importOriginal<object>(), createHerdrPiTab: vi.fn() }));
const session = "01a0923f-272c-7128-9beb-69a9675344fd";
let root: string;
let file: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "herdr-resume-test-"));
  await mkdir(join(root, "--project--"));
  file = join(root, "--project--", `2026-09-11T20-53-27-469Z_${session}.jsonl`);
  await writeFile(file, JSON.stringify({ type: "session", version: 3, id: session, cwd: process.cwd() }) + "\nnot a parsed transcript body\n");
  vi.mocked(createHerdrPiTab).mockReset().mockResolvedValue({ tabId: "w1:t2", paneId: "w1:p2" });
});
afterEach(async () => { vi.useRealTimers(); await rm(root, { recursive: true, force: true }); });
describe("one-call Herdr resume", () => {
  it("resolves an exact UUID from its header without parsing transcript bodies", async () => {
    expect(await resolveResumeSession(session, root)).toEqual({ session, file, cwd: process.cwd() });
    await expect(resolveResumeSession("not-a-session", root)).rejects.toThrow("UUID");
    await expect(resolveResumeSession("00000000-0000-0000-0000-000000000000", root)).rejects.toThrow("not found");
  });
  it("launches the exact saved session and cwd, then confirms its native session identity", async () => {
    const cli = vi.fn<HerdrCli>().mockResolvedValue(JSON.stringify({ result: { agent: { agent: "pi", agent_session: { value: session }, agent_status: "idle" } } }));
    expect(await resumeHerdrSession(session, root, cli)).toMatchObject({ session, tab: "w1:t2", pane: "w1:p2", focused: true, ready: true, state: "idle" });
    expect(createHerdrPiTab).toHaveBeenCalledExactlyOnceWith(process.cwd(), expect.any(String), file);
    expect(cli).toHaveBeenCalledExactlyOnceWith(["agent", "get", "w1:p2"], { signal: undefined });
  });
  it("does not launch missing sessions or retry ambiguous launches", async () => {
    const cli = vi.fn<HerdrCli>();
    await expect(resumeHerdrSession("00000000-0000-0000-0000-000000000000", root, cli)).rejects.toThrow("not found");
    expect(createHerdrPiTab).not.toHaveBeenCalled();
    vi.mocked(createHerdrPiTab).mockRejectedValue(new HerdrPiTabLaunchError("Inspect before retrying", { mayHaveLaunched: true, tabId: "w1:t2" }));
    await expect(resumeHerdrSession(session, root, cli)).rejects.toMatchObject({ mayHaveLaunched: true, tabId: "w1:t2" });
    expect(createHerdrPiTab).toHaveBeenCalledOnce();
  });
  it("reports the created tab rather than relaunching when startup checking is cancelled", async () => {
    const controller = new AbortController();
    const cli = vi.fn<HerdrCli>(async () => { controller.abort(); throw new Error("cancelled"); });
    expect(await resumeHerdrSession(session, root, cli, controller.signal)).toMatchObject({ tab: "w1:t2", pane: "w1:p2", ready: false, reason: expect.stringContaining("cancelled") });
    expect(createHerdrPiTab).toHaveBeenCalledOnce();
  });
  it("waits past an unrelated startup identity without accepting it as ready", async () => {
    const controller = new AbortController();
    const cli = vi.fn<HerdrCli>(async () => {
      controller.abort();
      return JSON.stringify({ result: { agent: { agent: "pi", agent_session: { value: "other-session" }, agent_status: "idle" } } });
    });
    expect(await resumeHerdrSession(session, root, cli, controller.signal)).toMatchObject({ ready: false });
  });
});
