import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserKey, pasteBrowserText, pressBrowserKey, uploadBrowserFiles } from "../lib/browser-input.js";
import { browserFillExpression } from "../lib/browser-control.js";
import { browserDom } from "./helpers/browser-dom.js";
import type { BrowserCdpTransport, CdpFrame } from "../lib/browser-cdp-transport.js";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });
const frame: CdpFrame = { targetId: "child", sessionId: "child-session", frameId: "child-frame", url: "https://example.test", securityOrigin: "https://example.test", executionContextId: 7 };
function fixture(handled = false) {
	const command = vi.fn(async (_target: string, method: string, params: Record<string, unknown> = {}) => {
		if (method === "Runtime.evaluate") return params.returnByValue === false ? { result: { objectId: "file-input-object" } } : { result: { value: String(params.expression).includes("ClipboardEvent") ? handled : "ok" } };
		return {};
	});
	const transport = { command, revalidateFrame: vi.fn(async () => frame) } as unknown as BrowserCdpTransport;
	return { transport, command };
}

describe("browser keyboard and text input", () => {
	it.each([
		["Enter", { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 0, text: "\r" }],
		["Control+a", { key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 }],
		["Control+Shift+ArrowLeft", { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37, modifiers: 10 }],
		["Shift+a", { key: "A", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 8, text: "A" }],
		["Control++", { key: "+", code: "Equal", windowsVirtualKeyCode: 187, modifiers: 2 }],
		["F12", { key: "F12", code: "F12", windowsVirtualKeyCode: 123, modifiers: 0 }],
	] as const)("parses %s", (chord, expected) => { expect(browserKey(chord)).toEqual(expected); });
	it("supports the platform modifier and rejects unsupported key names", () => {
		expect(browserKey("ControlOrMeta+a", "darwin").modifiers).toBe(4);
		expect(browserKey("ControlOrMeta+a", "win32").modifiers).toBe(2);
		expect(() => browserKey("MadeUp+a")).toThrow("modifier");
		expect(() => browserKey("NotAKey")).toThrow("Unknown key");
	});
	it("focuses the exact child frame but dispatches keyboard events through its page", async () => {
		const f = fixture();
		await pressBrowserKey(f.transport, "page", frame, "Control+a", "#editor");
		expect(f.command.mock.calls[0]).toEqual(["page", "Page.bringToFront", {}, { signal: undefined }]);
		expect(f.command.mock.calls[1]).toMatchObject(["child", "Runtime.evaluate", { contextId: 7, expression: expect.stringContaining('"#editor"') }, { signal: undefined }]);
		expect(f.command.mock.calls.slice(2)).toEqual([
			["page", "Input.dispatchKeyEvent", { key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2, type: "rawKeyDown" }, { signal: undefined }],
			["page", "Input.dispatchKeyEvent", { key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2, type: "keyUp" }, { signal: undefined }],
		]);
	});
	it.each([false, true])("preserves multiline/tab text, using editor paste handling=%s", async handled => {
		const f = fixture(handled), value = "first\tsecond\nthird\tfourth";
		await pasteBrowserText(f.transport, "page", frame, value);
		const paste = f.command.mock.calls.find(call => String(call[2]?.expression).includes("ClipboardEvent"));
		expect(paste?.[2]).toMatchObject({ contextId: 7, expression: expect.stringContaining(JSON.stringify(value)) });
		const inserts = f.command.mock.calls.filter(call => call[1] === "Input.insertText");
		expect(inserts).toHaveLength(handled ? 0 : 1);
		if (!handled) expect(inserts[0]).toEqual(["page", "Input.insertText", { text: value }, { signal: undefined }]);
	});
});

describe("contenteditable fill", () => {
	it("replaces rich-editor text and emits an input event without interpreting HTML", () => {
		const dom = browserDom('<div id="rich" contenteditable="true">old content</div>');
		const editor = dom.window.document.querySelector("#rich")!;
		const input = vi.fn(); editor.addEventListener("input", input);
		expect(dom.evaluate(browserFillExpression("#rich", "first line\n<not html>"))).toMatchObject({ ok: true, visible: true });
		expect(editor.textContent).toBe("first line\n<not html>");
		expect(editor.children).toHaveLength(0);
		expect(input).toHaveBeenCalledOnce();
	});
});

describe("browser file input upload", () => {
	it("assigns real local paths to the exact remote file-input object and releases it", async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pi-browser-upload-")); directories.push(directory);
		const file = path.join(directory, "input.txt"); await fs.writeFile(file, "test upload");
		const f = fixture(); await uploadBrowserFiles(f.transport, frame, "#upload", [file]);
		expect(f.command.mock.calls[0]).toMatchObject(["child", "Runtime.evaluate", { contextId: 7, returnByValue: false }, { signal: undefined }]);
		expect(f.command.mock.calls[1]).toEqual(["child", "DOM.setFileInputFiles", { objectId: "file-input-object", files: [file] }, { signal: undefined }]);
		expect(f.command.mock.calls[2]).toEqual(["child", "Runtime.releaseObject", { objectId: "file-input-object" }]);
	});
});
