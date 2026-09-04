import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const copyToClipboardMock = vi.hoisted(() => vi.fn());
vi.mock("@earendil-works/pi-coding-agent", () => ({ copyToClipboard: copyToClipboardMock }));

import historyExtension, {
	extractPromptHistory,
	PromptHistoryOverlay,
	type PromptHistoryResult,
} from "../extensions/history.ts";

const keyData: Record<string, string> = {
	"tui.select.up": "UP",
	"tui.select.down": "DOWN",
	"tui.select.pageUp": "PAGE_UP",
	"tui.select.pageDown": "PAGE_DOWN",
	"tui.select.confirm": "\r",
	"tui.select.cancel": "\u001b",
};
const keybindings = {
	matches: (data: string, binding: string) => keyData[binding] === data,
	getKeys: (binding: string) => [keyData[binding] ?? binding],
};
const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};
function fakeTui(rows = 20) {
	return { terminal: { rows }, requestRender: vi.fn() };
}
function rendered(component: PromptHistoryOverlay, width = 80): string {
	return component.render(width).join("\n");
}
function overlay(items = [
	{ entryId: "one", text: "first prompt" },
	{ entryId: "two", text: "second prompt" },
	{ entryId: "three", text: "third prompt" },
], rows = 20) {
	const done = vi.fn<(result: PromptHistoryResult | null) => void>();
	const component = new PromptHistoryOverlay(fakeTui(rows) as never, theme as never, keybindings as never, items, done);
	return { component, done };
}

function mixedBranch() {
	return [
		{ type: "message", id: "user-string", message: { role: "user", content: "  exact text  " } },
		{ type: "message", id: "assistant", message: { role: "assistant", content: "no" } },
		{ type: "message", id: "tool", message: { role: "toolResult", content: "no" } },
		{ type: "message", id: "blocks", message: { role: "user", content: [
			{ type: "text", text: "alpha" }, { type: "image", data: "ignored" }, { type: "text", text: "beta" },
		] } },
		{ type: "message", id: "image", message: { role: "user", content: [{ type: "image", data: "ignored" }] } },
		{ type: "message", id: "empty", message: { role: "user", content: "" } },
		{ type: "message", id: "empty-blocks", message: { role: "user", content: [{ type: "text", text: "" }, { type: "text", text: "" }] } },
		{ type: "compaction", id: "compact", summary: "no" },
		{ type: "branch_summary", id: "summary", summary: "no" },
		{ type: "custom", id: "custom", data: "no" },
	];
}

function setupCommand(branch = mixedBranch()) {
	let definition: { handler: (args: string, ctx: any) => Promise<void> } | undefined;
	const appendEntry = vi.fn();
	const pi = {
		appendEntry,
		registerCommand: vi.fn((name: string, value: typeof definition) => {
			if (name === "history") definition = value;
		}),
	};
	historyExtension(pi as never);
	if (!definition) throw new Error("history command was not registered");
	const notify = vi.fn();
	const setEditorText = vi.fn();
	const navigateTree = vi.fn(async () => ({ cancelled: false }));
	const fork = vi.fn(async () => ({ cancelled: false }));
	let component: PromptHistoryOverlay | undefined;
	let closed = false;
	const custom = vi.fn(async (factory: any) => new Promise<PromptHistoryResult | null>((resolve) => {
		component = factory(fakeTui() as never, theme as never, keybindings as never, (result: PromptHistoryResult | null) => {
			closed = true;
			resolve(result);
		});
	}));
	const ctx = {
		mode: "tui",
		waitForIdle: vi.fn(async () => {}),
		sessionManager: { getBranch: vi.fn(() => branch) },
		ui: { notify, setEditorText, custom },
		navigateTree,
		fork,
	};
	return {
		command: definition,
		ctx,
		appendEntry,
		notify,
		setEditorText,
		navigateTree,
		fork,
		getComponent: () => component,
		isClosed: () => closed,
	};
}

async function start(setup: ReturnType<typeof setupCommand>) {
	const pending = setup.command.handler("", setup.ctx);
	await vi.waitFor(() => expect(setup.getComponent()).toBeDefined());
	return { pending, component: setup.getComponent()! };
}

beforeEach(() => {
	copyToClipboardMock.mockReset();
});

describe("prompt history extraction", () => {
	it("uses only non-empty textual user message entries in supplied branch order", () => {
		expect(extractPromptHistory(mixedBranch())).toEqual([
			{ entryId: "user-string", text: "  exact text  " },
			{ entryId: "blocks", text: "alpha\nbeta" },
		]);
	});
});

describe("prompt history overlay", () => {
	it("starts on newest, uses configured movement, and returns selected IDs and exact text", () => {
		const { component, done } = overlay();
		expect(rendered(component)).toContain("> third prompt");
		component.handleInput("UP");
		component.handleInput("e");
		expect(done).toHaveBeenCalledWith({ action: "recall", entryId: "two", text: "second prompt" });
	});

	it("preserves entry selection across order reversal", () => {
		const { component, done } = overlay();
		component.handleInput("UP");
		component.handleInput("r");
		expect(rendered(component)).toContain("> second prompt");
		component.handleInput("b");
		expect(done).toHaveBeenCalledWith(expect.objectContaining({ action: "navigate", entryId: "two" }));
	});

	it("searches, shows no matches, edits, restores stable selection, and suppresses modal actions", () => {
		const { component, done } = overlay();
		component.handleInput("UP");
		component.handleInput("/");
		component.handleInput("r");
		expect(rendered(component)).toContain("Search: r");
		expect(done).not.toHaveBeenCalled();
		component.handleInput("z");
		expect(rendered(component)).toContain("No prompts match");
		component.handleInput("\u007f");
		expect(rendered(component)).not.toContain("No prompts match");
		component.handleInput("\u001b");
		expect(rendered(component)).toContain("> second prompt");
		component.handleInput("\u001b");
		expect(done).toHaveBeenCalledWith(null);
	});

	it("accepts the current filtered selection with Enter", () => {
		const { component, done } = overlay();
		component.handleInput("/");
		for (const char of "first") component.handleInput(char);
		component.handleInput("\r");
		expect(done).toHaveBeenCalledWith({ action: "navigate", entryId: "one", text: "first prompt" });
	});

	it("toggles clipped detail while keeping the selected list row visible and width-safe", () => {
		const long = "selected prompt " + "word ".repeat(80);
		const { component } = overlay([{ entryId: "long", text: long }], 12);
		component.handleInput(" ");
		const lines = component.render(30);
		expect(lines.join("\n")).toContain("> selected prompt");
		expect(lines.every((line) => visibleWidth(line) <= 30)).toBe(true);
	});

	it("pages by the visible item count and keeps the result visible", () => {
		const items = Array.from({ length: 12 }, (_, index) => ({ entryId: String(index), text: `prompt ${index}` }));
		const { component, done } = overlay(items, 12);
		component.render(80);
		component.handleInput("PAGE_UP");
		expect(rendered(component)).toContain("> prompt 6");
		component.handleInput("PAGE_DOWN");
		component.handleInput("f");
		expect(done).toHaveBeenCalledWith(expect.objectContaining({ action: "fork", entryId: "11" }));
	});
});

describe("history command", () => {
	it("acknowledges, waits for idle, and reads only getBranch", async () => {
		const setup = setupCommand();
		const { pending, component } = await start(setup);
		expect(setup.appendEntry).toHaveBeenCalledWith("slash-echo", { kind: "submitted", text: "/history" });
		expect(setup.ctx.waitForIdle).toHaveBeenCalledOnce();
		expect(setup.ctx.sessionManager.getBranch).toHaveBeenCalledOnce();
		component.handleInput("\u001b");
		await pending;
	});

	it("rejects non-TUI mode without opening custom UI", async () => {
		const setup = setupCommand();
		setup.ctx.mode = "rpc";
		await setup.command.handler("", setup.ctx);
		expect(setup.ctx.waitForIdle).toHaveBeenCalledOnce();
		expect(setup.ctx.ui.custom).not.toHaveBeenCalled();
		expect(setup.notify).toHaveBeenCalledWith(expect.stringContaining("only in interactive TUI mode"), "warning");
	});

	it("reports an empty active-branch history without opening the overlay", async () => {
		const setup = setupCommand([{ type: "message", id: "a", message: { role: "assistant", content: "answer" } }]);
		await setup.command.handler("", setup.ctx);
		expect(setup.ctx.ui.custom).not.toHaveBeenCalled();
	});

	it("replaces editor text after recall closes", async () => {
		const setup = setupCommand();
		const { pending, component } = await start(setup);
		component.handleInput("e");
		await pending;
		expect(setup.isClosed()).toBe(true);
		expect(setup.setEditorText).toHaveBeenCalledWith("alpha\nbeta");
	});

	it.each(["c", "y"])("copies exact selected text and closes first with %s", async (key) => {
		const setup = setupCommand();
		copyToClipboardMock.mockImplementation(async (text: string) => {
			expect(setup.isClosed()).toBe(true);
			expect(text).toBe("alpha\nbeta");
		});
		const { pending, component } = await start(setup);
		component.handleInput(key);
		await pending;
		expect(copyToClipboardMock).toHaveBeenCalledWith("alpha\nbeta");
	});

	it.each(["\r", "b"])("navigates selected prompt after closure with summarize false using %s", async (key) => {
		const setup = setupCommand();
		setup.navigateTree.mockImplementation(async () => {
			expect(setup.isClosed()).toBe(true);
			return { cancelled: false };
		});
		const { pending, component } = await start(setup);
		component.handleInput(key);
		await pending;
		expect(setup.navigateTree).toHaveBeenCalledWith("blocks", { summarize: false });
	});

	it("forks the selected prompt after closure and performs no later UI action on success", async () => {
		const setup = setupCommand();
		setup.fork.mockImplementation(async () => {
			expect(setup.isClosed()).toBe(true);
			return { cancelled: false };
		});
		const { pending, component } = await start(setup);
		component.handleInput("f");
		await pending;
		expect(setup.fork).toHaveBeenCalledWith("blocks");
		expect(setup.notify).not.toHaveBeenCalled();
	});

	it("reports an action failure without claiming success", async () => {
		const setup = setupCommand();
		copyToClipboardMock.mockRejectedValue(new Error("clipboard unavailable"));
		const { pending, component } = await start(setup);
		component.handleInput("c");
		await pending;
		expect(setup.notify).toHaveBeenCalledWith(
			expect.stringContaining("clipboard unavailable"),
			"error",
		);
	});
});
