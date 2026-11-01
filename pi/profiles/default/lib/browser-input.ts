import fs from "node:fs/promises";
import { BrowserControlError } from "./browser-control.js";
import type { BrowserCdpTransport, CdpFrame } from "./browser-cdp-transport.js";

interface KeyDefinition { key: string; code: string; windowsVirtualKeyCode: number; text?: string }
export interface BrowserKey extends KeyDefinition { modifiers: number }
const namedKeys: Record<string, KeyDefinition> = {
	Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
	Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
	Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
	Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
	Delete: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
	ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
	ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
	ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
	ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
	Home: { key: "Home", code: "Home", windowsVirtualKeyCode: 36 },
	End: { key: "End", code: "End", windowsVirtualKeyCode: 35 },
	PageUp: { key: "PageUp", code: "PageUp", windowsVirtualKeyCode: 33 },
	PageDown: { key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 },
	Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
};
const punctuation: Record<string, [string, number]> = {
	";": ["Semicolon", 186], ":": ["Semicolon", 186], "=": ["Equal", 187], "+": ["Equal", 187],
	",": ["Comma", 188], "<": ["Comma", 188], "-": ["Minus", 189], "_": ["Minus", 189],
	".": ["Period", 190], ">": ["Period", 190], "/": ["Slash", 191], "?": ["Slash", 191],
	"`": ["Backquote", 192], "~": ["Backquote", 192], "[": ["BracketLeft", 219], "{": ["BracketLeft", 219],
	"\\": ["Backslash", 220], "|": ["Backslash", 220], "]": ["BracketRight", 221], "}": ["BracketRight", 221],
	"'": ["Quote", 222], '"': ["Quote", 222],
};

/** One key or chord, using Chromium's modifier bits. Text entry belongs to paste/fill. */
export function browserKey(chord: string, platform = process.platform): BrowserKey {
	const parts = chord.split("+");
	let name = parts.pop() ?? "";
	if (!name && parts.at(-1) === "") { parts.pop(); name = "+"; }
	const aliases: Record<string, string> = { Esc: "Escape", Return: "Enter", Spacebar: "Space", Plus: "+" };
	name = aliases[name] ?? name;
	let modifiers = 0;
	for (const modifier of parts) {
		const bit = modifier === "Alt" ? 1 : ["Control", "Ctrl"].includes(modifier) ? 2 : ["Meta", "Command", "Cmd"].includes(modifier) ? 4 : modifier === "Shift" ? 8 : modifier === "ControlOrMeta" ? platform === "darwin" ? 4 : 2 : 0;
		if (!bit) throw new BrowserControlError("key_invalid", `Unknown keyboard modifier ${JSON.stringify(modifier)}.`);
		modifiers |= bit;
	}
	let definition = namedKeys[name];
	if (!definition && /^F(?:[1-9]|1\d|2[0-4])$/.test(name)) definition = { key: name, code: name, windowsVirtualKeyCode: 111 + Number(name.slice(1)) };
	if (!definition && /^[a-z]$/i.test(name)) definition = { key: name, code: `Key${name.toUpperCase()}`, windowsVirtualKeyCode: name.toUpperCase().charCodeAt(0), text: name };
	if (!definition && /^\d$/.test(name)) definition = { key: name, code: `Digit${name}`, windowsVirtualKeyCode: name.charCodeAt(0), text: name };
	if (!definition && punctuation[name]) { const [code, windowsVirtualKeyCode] = punctuation[name]; definition = { key: name, code, windowsVirtualKeyCode, text: name }; }
	if (!definition) throw new BrowserControlError("key_invalid", `Unknown key ${JSON.stringify(name)}. Use a named key or a chord such as Control+a.`);
	if (modifiers & 8 && /^[a-z]$/i.test(definition.key)) definition = { ...definition, key: definition.key.toUpperCase(), text: definition.key.toUpperCase() };
	const result: BrowserKey = { key: definition.key, code: definition.code, windowsVirtualKeyCode: definition.windowsVirtualKeyCode, modifiers };
	if (definition.text !== undefined && !(modifiers & 7)) result.text = definition.text;
	return result;
}

async function evaluate<T>(transport: BrowserCdpTransport, frame: Readonly<CdpFrame>, expression: string, signal?: AbortSignal): Promise<T> {
	await transport.revalidateFrame(frame, signal);
	if (frame.executionContextId === undefined) throw new BrowserControlError("frame_unavailable", "The exact frame has no current execution context.");
	const response = await transport.command<{ result?: { value?: T }; exceptionDetails?: unknown }>(frame.targetId, "Runtime.evaluate", { expression, contextId: frame.executionContextId, returnByValue: true }, { signal });
	if (response.exceptionDetails || response.result?.value === undefined) throw new BrowserControlError("input_failed", "Browser input could not be performed in the chosen frame.");
	return response.result.value;
}

export async function focusBrowserInput(transport: BrowserCdpTransport, targetId: string, frame: Readonly<CdpFrame>, selector?: string, signal?: AbortSignal): Promise<void> {
	await transport.command(targetId, "Page.bringToFront", {}, { signal });
	const result = await evaluate<string>(transport, frame, `(() => { let element = document.activeElement; ${selector === undefined ? "" : `let matches; try { matches = document.querySelectorAll(${JSON.stringify(selector)}); } catch { return 'selector_invalid'; } if (matches.length !== 1) return matches.length ? 'selector_ambiguous' : 'selector_missing'; element = matches[0];`} if (element?.closest('.g-recaptcha,.h-captcha')) return 'manual_captcha'; window.focus(); element?.focus(); return 'ok'; })()`, signal);
	if (result !== "ok") throw new BrowserControlError(result, result === "manual_captcha" ? "Complete the actual CAPTCHA manually." : "Input selector must identify exactly one element in the chosen frame.");
}

export async function pressBrowserKey(transport: BrowserCdpTransport, targetId: string, frame: Readonly<CdpFrame>, key: string, selector?: string, signal?: AbortSignal): Promise<void> {
	const definition = browserKey(key);
	await focusBrowserInput(transport, targetId, frame, selector, signal);
	const { text, ...params } = definition;
	await transport.command(targetId, "Input.dispatchKeyEvent", { ...params, type: text === undefined ? "rawKeyDown" : "keyDown", ...(text === undefined ? {} : { text, unmodifiedText: text }) }, { signal });
	await transport.command(targetId, "Input.dispatchKeyEvent", { ...params, type: "keyUp" }, { signal });
}

/** Let rich editors consume a paste event; ordinary controls use native text insertion. */
export async function pasteBrowserText(transport: BrowserCdpTransport, targetId: string, frame: Readonly<CdpFrame>, value: string, selector?: string, signal?: AbortSignal): Promise<void> {
	await focusBrowserInput(transport, targetId, frame, selector, signal);
	const handled = await evaluate<boolean>(transport, frame, `(() => { const data = new DataTransfer(); data.setData('text/plain', ${JSON.stringify(value)}); const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true }); return !(document.activeElement || document.body).dispatchEvent(event); })()`, signal);
	if (!handled) await transport.command(targetId, "Input.insertText", { text: value }, { signal });
}

export async function uploadBrowserFiles(transport: BrowserCdpTransport, frame: Readonly<CdpFrame>, selector: string, files: readonly string[], signal?: AbortSignal): Promise<void> {
	for (const file of files) if (!(await fs.stat(file)).isFile()) throw new BrowserControlError("file_invalid", "Upload paths must refer to files.");
	await transport.revalidateFrame(frame, signal);
	if (frame.executionContextId === undefined) throw new BrowserControlError("frame_unavailable", "The exact frame has no current execution context.");
	const response = await transport.command<{ result?: { objectId?: string }; exceptionDetails?: unknown }>(frame.targetId, "Runtime.evaluate", {
		expression: `(() => { const matches = document.querySelectorAll(${JSON.stringify(selector)}); if (matches.length !== 1 || !(matches[0] instanceof HTMLInputElement) || matches[0].type !== 'file') throw new Error('Expected one file input'); return matches[0]; })()`,
		contextId: frame.executionContextId, returnByValue: false,
	}, { signal });
	const objectId = response.result?.objectId;
	if (response.exceptionDetails || !objectId) throw new BrowserControlError("upload_target", "Upload requires a selector for one file input in the chosen frame.");
	try { await transport.command(frame.targetId, "DOM.setFileInputFiles", { objectId, files: [...files] }, { signal }); }
	finally { await transport.command(frame.targetId, "Runtime.releaseObject", { objectId }).catch(() => {}); }
}
