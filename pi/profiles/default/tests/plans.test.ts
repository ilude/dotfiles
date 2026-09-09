import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { archivePlan, executePlans, openPlanInCode, planSelector } from "../extensions/plans.ts";
import { discoverPlans, parsePlan } from "../lib/plans.ts";
import { spawnSync } from "node:child_process";
vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root() { const value = mkdtempSync(join(tmpdir(), "plans ")); roots.push(value); return value; }
function add(base: string, stub: string, body: string) { const dir = join(base, ".specs", stub); mkdirSync(dir, { recursive: true }); const file = join(dir, "plan.md"); writeFileSync(file, body); return file; }
const complete = `---\nstatus: completed\ncompleted: 2026-09-09\n---\n# Zebra\n\n## Goal and scope\n\n- Ship the selector.\n\n## Tasks\n- [x] First\n- [x] Second\n\n## Current handoff\nDone.\n`;

it("discovers direct active plans, parses summaries and sorts by title", () => {
  const base = root(); add(base, "z", complete); add(base, "a", complete.replace("Zebra", "Alpha").replace("[x] Second", "[ ] Next"));
  add(base, "archive/old", complete); add(base, "deep/nested", complete);
  const found = discoverPlans(base);
  expect(found.errors).toEqual([]); expect(found.plans.map(p => p.title)).toEqual(["Alpha", "Zebra"]);
  expect(found.plans[0]).toMatchObject({ description: "Ship the selector.", status: "completed", tasks: { total: 2, checked: 1 }, firstUnchecked: "Next" });
});

it("keeps malformed plans visible with bounded warnings", () => {
  const base = root(); const file = add(base, "broken", "---\nstatus: [\n---\ntext\n");
  const plan = parsePlan(file, "broken", base);
  expect(plan.title).toBe("broken"); expect(plan.description).toBe("Description unavailable"); expect(plan.warnings).toContain("malformed frontmatter");
});

it("renders width-safe rows and dispatches only approved keys", () => {
  const base = root(); const plans = [parsePlan(add(base, "a", complete.replace("Zebra", "A".repeat(100))), "a", base), parsePlan(add(base, "b", complete), "b", base)];
  const done = vi.fn(); const render = vi.fn(); const theme = { bold: (x:string)=>x, fg: (_:string,x:string)=>x };
  const component = planSelector(plans, 0, done)({ requestRender: render }, theme);
  component.handleInput("\x1b[B"); component.handleInput("\r");
  expect(component.render(32).every(value => visibleWidth(value) <= 32)).toBe(true);
  for (const key of ["D", "r", "v"]) component.handleInput(key);
  expect(done).not.toHaveBeenCalled();
  component.handleInput("d"); expect(done).toHaveBeenCalledWith({ action: "do-it", index: 1 });
});

it("renders an empty closable state", () => {
  const done = vi.fn(); const theme = { bold: (x:string)=>x, fg: (_:string,x:string)=>x };
  const component = planSelector([], 0, done)({ requestRender() {} }, theme);
  expect(component.render(80).join("\n")).toContain("No open plans"); component.handleInput("q");
  expect(done).toHaveBeenCalledWith({ action: "close", index: 0 });
});

it("refuses do-it outside Herdr without launching a fallback", async () => {
  vi.stubEnv("HERDR_ENV", "0");
  const base = root(); add(base, "ready", complete); let calls = 0;
  const notify = vi.fn();
  const custom = vi.fn(async (factory: any) => {
    let value: any; const component = factory({ requestRender() {} }, { bold:(x:string)=>x, fg:(_:string,x:string)=>x }, {}, (result:any) => { value = result; });
    component.handleInput(calls++ === 0 ? "d" : "q"); return value;
  });
  await executePlans({ cwd: base, ui: { custom, notify, confirm: vi.fn() } } as any);
  expect(notify).toHaveBeenCalledWith("Plan execution from /plans requires a Herdr-managed Pi session.", "error");
  expect(spawnSync).not.toHaveBeenCalled();
});

it("cancels archive without changing the plan", async () => {
  const base = root(); const file = add(base, "done", complete); let calls = 0;
  const custom = vi.fn(async (factory: any) => {
    let value: any; const component = factory({ requestRender() {} }, { bold:(x:string)=>x, fg:(_:string,x:string)=>x }, {}, (result:any) => { value = result; });
    component.handleInput(calls++ === 0 ? "a" : "q"); return value;
  });
  await executePlans({ cwd: base, ui: { custom, notify: vi.fn(), confirm: vi.fn(async () => false) } } as any);
  expect(readFileSync(file, "utf8")).toContain("status: completed");
});

it("opens the exact plan path in VS Code without a shell", () => {
  const base = root(); const plan = parsePlan(add(base, "space plan", complete), "space plan", base);
  vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any); openPlanInCode(plan, base);
  expect(spawnSync).toHaveBeenCalledWith("code", ["-g", plan.path], expect.objectContaining({ cwd: base, shell: false }));
});

it("archives only eligible plans without overwriting", () => {
  const base = root(); const file = add(base, "done", complete); writeFileSync(join(base, ".specs", "done", "notes.md"), "notes");
  const destination = archivePlan(parsePlan(file, "done", base), base);
  expect(readFileSync(join(destination, "notes.md"), "utf8")).toBe("notes");
  expect(() => archivePlan({ ...parsePlan(join(destination, "plan.md"), "done", base), path: join(destination, "plan.md") }, base)).toThrow();
});

it.each([
  ["status", complete.replace("status: completed", "status: blocked"), "status must be completed"],
  ["date", complete.replace("completed: 2026-09-09", "completed: null"), "completion date"],
  ["tasks", complete.replace("[x] Second", "[ ] Second"), "unchecked tasks"],
])("refuses archive with invalid %s", (_name, body, message) => {
  const base = root(); const file = add(base, "bad", body);
  expect(() => archivePlan(parsePlan(file, "bad", base), base)).toThrow(message);
});

it("refuses a symlinked plan source outside .specs", () => {
  const base = root(); const external = join(base, "outside"); mkdirSync(external); writeFileSync(join(external, "plan.md"), complete); mkdirSync(join(base, ".specs"), { recursive: true });
  try { symlinkSync(external, join(base, ".specs", "escape"), "junction"); } catch { return; }
  const plan = parsePlan(join(base, ".specs", "escape", "plan.md"), "escape", base);
  expect(() => archivePlan(plan, base)).toThrow("escapes");
});
