import { afterEach, expect, it, vi } from "vitest";
import type { BeforeAgentStartEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildSystemPrompt, normalizeBuildSystemPromptOptions } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js";
import register from "../extensions/herdr-host.ts";
import { detectHerdrHost, renderHerdrHost, resolvePiHost, type HerdrHost } from "../lib/herdr-host.ts";

const core = { HC_TERMINAL_ID: "t1", HC_TERMINAL_SOCKET: "fixture-socket" };
const tui = { HERDR_ENV: "1", HERDR_SOCKET_PATH: "fixture", HERDR_PANE_ID: "w1:p1", HERDR_WORKSPACE_ID: "w1", HERDR_TAB_ID: "w1:t1" };
const desktop: HerdrHost = { kind: "herdr-desktop", terminal: "t1", space: "sp1", tab: "tb1" };
const response = (value: unknown) => ({ stdout: JSON.stringify(value), stderr: "", code: 0, killed: false, truncated: false });
const terminal = (labels: Record<string, unknown> = {}) => ({ address: "t1", labels });
const desktopResponse = () => response(terminal({ "herdr.space": "sp1", "herdr.tab": "tb1" }));
afterEach(() => vi.unstubAllEnvs());

it("selects plain output only for the explicit T3 integration signal, after Herdr detection", () => {
  expect(resolvePiHost({ kind: "terminal" }, { T3_PI_MCP_EXTENSION_PATH: "fixture" })).toEqual({ kind: "t3code" });
  expect(resolvePiHost({ kind: "terminal" }, { T3_PI_RUNTIME_MODE: "rpc" })).toEqual({ kind: "terminal" });
  expect(resolvePiHost({ kind: "herdr-core", terminal: "t1", membership: "none" }, { T3_PI_MCP_EXTENSION_PATH: "fixture" })).toEqual({ kind: "herdr-core", terminal: "t1", membership: "none" });
});

it("detects desktop through the caller's exact core terminal and labels", async () => {
	const exec = vi.fn<ExtensionAPI["exec"]>().mockResolvedValue(desktopResponse());
	expect(await detectHerdrHost(exec, core)).toEqual(desktop);
	expect(exec).toHaveBeenCalledExactlyOnceWith("hc", ["get", "t1", "--json"], { timeout: 3000, maxBuffer: 32_768 });
});

it("preserves complete TUI caller context, including when nested in core", async () => {
	const exec = vi.fn<ExtensionAPI["exec"]>();
	for (const env of [tui, { ...core, ...tui }]) {
		expect(await detectHerdrHost(exec, env)).toEqual({ kind: "herdr-tui", pane: "w1:p1", workspace: "w1", tab: "w1:t1" });
	}
	expect(exec).not.toHaveBeenCalled();
});

it.each([{}, { TERM_PROGRAM: "ghostty" }, { HERDR_ENV: "1" }, { HC_TERMINAL_ID: "t1" }, { HC_TERMINAL_SOCKET: "fixture" }])(
	"does not infer a host from terminal identity or incomplete markers: %j", async (env) => {
		const exec = vi.fn<ExtensionAPI["exec"]>();
		expect(await detectHerdrHost(exec, env)).toEqual({ kind: "terminal" });
		expect(exec).not.toHaveBeenCalled();
	},
);

it.each([{}, { "herdr.space": "sp1" }, { "herdr.tab": "tb1" }])("keeps core-only terminals distinct: %j", async (labels) => {
	const exec = vi.fn<ExtensionAPI["exec"]>().mockResolvedValue(response(terminal(labels)));
	expect(await detectHerdrHost(exec, core)).toEqual({ kind: "herdr-core", terminal: "t1", membership: "none" });
});

it.each([
	{ ...desktopResponse(), code: 1 },
	{ ...desktopResponse(), killed: true },
	{ ...desktopResponse(), truncated: true },
	{ ...desktopResponse(), stdout: "invalid JSON" },
	response({ ...terminal(), address: "t2" }),
	response({ address: "t1", labels: null }),
])("leaves membership unverified after an unsuccessful or invalid probe", async (result) => {
	const exec = vi.fn<ExtensionAPI["exec"]>().mockResolvedValue(result);
	expect(await detectHerdrHost(exec, core)).toEqual({ kind: "herdr-core", terminal: "t1", membership: "unavailable" });
});

it("reports unavailable detection without copying command errors or environment secrets into context", async () => {
	const exec = vi.fn<ExtensionAPI["exec"]>().mockRejectedValue(new Error("secret command detail"));
	const host = await detectHerdrHost(exec, { ...core, PRIVATE_TOKEN: "secret-token" });
	expect(host).toEqual({ kind: "herdr-core", terminal: "t1", membership: "unavailable" });
	expect(renderHerdrHost(host)).toContain("Desktop membership is unverified");
	expect(renderHerdrHost(host)).not.toMatch(/secret|fixture-socket/);
});

it("adds one stable, bounded host section to native prompt composition without changing other sections or tools", async () => {
	for (const key of Object.keys(tui)) vi.stubEnv(key, "");
	for (const [key, value] of Object.entries(core)) vi.stubEnv(key, value);
	const hooks = new Map<string, unknown>();
	const api = {
		on(name: string, handler: unknown) { hooks.set(name, handler); return () => { hooks.delete(name); }; },
		exec: vi.fn<ExtensionAPI["exec"]>().mockResolvedValue(desktopResponse()),
	} satisfies Pick<ExtensionAPI, "on" | "exec">;
	register(api);
	const startup = hooks.get("session_start") as () => Promise<void>;
	const beforeStart = hooks.get("before_agent_start") as (event: BeforeAgentStartEvent) => Promise<void>;
	await startup();
	const options = normalizeBuildSystemPromptOptions({ cwd: process.cwd(), selectedTools: ["read"], sections: { unrelated: "preserve me" } });
	const baseline = buildSystemPrompt(options);
	const event: BeforeAgentStartEvent = {
		type: "before_agent_start", messageType: "user", prompt: "A task", systemPrompt: baseline, systemPromptOptions: options,
	};
	await beforeStart(event);
	const first = buildSystemPrompt(options);
	await beforeStart({ ...event, messageType: "custom", message: { role: "custom", customType: "fixture", content: "Continue", display: false, timestamp: 0 } });
	expect(buildSystemPrompt(options)).toBe(first);
	expect(options.sections.herdr_host).toBe(renderHerdrHost(desktop));
	expect(options.sections.unrelated).toBe("preserve me");
	expect(options.selectedTools).toEqual(["read"]);
	expect(first).toContain("<herdr_host>\nHost: Herdr desktop");
	expect(first.split("<herdr_host>")).toHaveLength(2);
	expect(Buffer.byteLength(first) - Buffer.byteLength(baseline)).toBeLessThan(900); // Routing facts only, never the app manual.
	expect(api.exec).toHaveBeenCalledTimes(1);
});

it.each<HerdrHost>([
	{ kind: "terminal" }, { kind: "herdr-tui", pane: "p1", workspace: "w1" }, desktop,
	{ kind: "herdr-core", terminal: "t1", membership: "none" },
	{ kind: "herdr-core", terminal: "t1", membership: "unavailable" },
])("renders only guidance relevant to $kind", (host) => {
	const prompt = renderHerdrHost(host);
	expect(prompt).toBe(renderHerdrHost(host));
	expect(Buffer.byteLength(prompt)).toBeLessThan(850);
	if (host.kind !== "herdr-desktop") expect(prompt).not.toContain("Visible subagents");
	if (host.kind !== "herdr-core") expect(prompt).not.toContain("Reload to retry detection");
});
