import { describe, expect, it, vi } from "vitest";
import { createHostPresentation, type PresentationContext } from "../lib/host-presentation.ts";

function fixture(mode: PresentationContext["mode"], env: NodeJS.ProcessEnv = {}) {
	const ui = { notify: vi.fn(), setStatus: vi.fn() };
	const presentation = createHostPresentation({ mode, hasUI: mode === "tui" || mode === "rpc", ui }, env);
	return { presentation, ui };
}

const t3 = { T3_PI_MCP_EXTENSION_PATH: "fixture" };
describe("host presentation", () => {
	it("uses the immediate client rather than inherited terminal membership", () => {
		const { presentation } = fixture("rpc", { ...t3, HERDR_ENV: "1", HC_TERMINAL_ID: "outer" });
		expect(presentation.client).toBe("t3code");
		expect(presentation.nativeTranscript).toBe(false);
		expect(presentation.widgets).toBe(false);
		expect(fixture("tui", t3).presentation.client).toBe("tui");
		expect(fixture("rpc", { ...t3, PI_SUBAGENT_AUTHORITY: "child" }).presentation.client).toBe("rpc");
		expect(fixture("rpc").presentation.widgets).toBe(true);
	});

	it.each(["tui", "rpc"] as const)("routes notices and statuses without terminal escapes in %s RPC output", mode => {
		const { presentation, ui } = fixture(mode, t3);
		presentation.notify("\x1b[31mFailed\x1b[0m", "error");
		presentation.status("job", "\x1b[32mReady\x1b[0m");
		presentation.status("job", undefined);
		expect(ui.notify).toHaveBeenCalledWith(mode === "tui" ? "\x1b[31mFailed\x1b[0m" : "Failed", "error");
		expect(ui.setStatus.mock.calls).toEqual([["job", mode === "tui" ? "\x1b[32mReady\x1b[0m" : "Ready"], ["job", undefined]]);
	});

	it.each(["print", "json"] as const)("does not invent a UI in %s mode", mode => {
		const { presentation, ui } = fixture(mode, t3);
		presentation.notify("Done");
		presentation.status("job", "Done");
		expect(presentation.widgets).toBe(false);
		expect(ui.notify).not.toHaveBeenCalled();
		expect(ui.setStatus).not.toHaveBeenCalled();
	});
});
