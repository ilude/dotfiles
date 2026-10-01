import { createEditToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Keep the built-in edit tool, but render word-level diff changes in bold, brighter text instead of
 * inverse video. Removed and added lines keep their theme colors.
 */

const SGR = /\x1b\[([0-9;]*)m/g;
/** Fraction mixed toward white for changed words. */
const BRIGHTEN = 0.45;

function brighter(fg: string[] | undefined): string[] {
	if (!fg) return ["39"];
	if (fg[0] === "38" && fg[1] === "2" && fg.length === 5) {
		const mix = (value: string) => String(Math.round(Number(value) + (255 - Number(value)) * BRIGHTEN));
		return ["38", "2", mix(fg[2]), mix(fg[3]), mix(fg[4])];
	}
	const basic = Number(fg[0]);
	if (fg.length === 1 && basic >= 30 && basic <= 37) return [String(basic + 60)];
	return fg;
}

/**
 * Replace SGR inverse on/off with bold, brighter foreground on/off. Tracks the line's foreground so
 * it can be restored after each changed span, including styles re-emitted at wrapped line starts.
 */
export function inverseToHighlight(line: string): string {
	let fg: string[] | undefined;
	let inverse = false;
	return line.replace(SGR, (sequence, raw: string) => {
		if (raw === "" || raw === "0") {
			fg = undefined;
			inverse = false;
			return sequence;
		}
		const params = raw.split(";");
		const kept: string[] = [];
		const wasInverse = inverse;
		let fgChanged = false;
		for (let i = 0; i < params.length; i++) {
			const param = params[i];
			const code = Number(param);
			if (param === "38" || param === "48" || param === "58") {
				const span = params[i + 1] === "5" ? 3 : params[i + 1] === "2" ? 5 : 1;
				const value = params.slice(i, i + span);
				i += span - 1;
				if (param === "38") {
					fg = value;
					fgChanged = true;
				} else kept.push(...value);
			} else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
				fg = [param];
				fgChanged = true;
			} else if (param === "39") {
				fg = undefined;
				fgChanged = true;
			} else if (param === "0") {
				fg = undefined;
				inverse = false;
				kept.push(param);
			} else if (param === "7") inverse = true;
			else if (param === "27") inverse = false;
			else kept.push(param);
		}
		if (inverse !== wasInverse) kept.push(inverse ? "1" : "22");
		if (fgChanged || inverse !== wasInverse) kept.push(...(inverse ? brighter(fg) : (fg ?? ["39"])));
		return kept.length > 0 ? `\x1b[${kept.join(";")}m` : "";
	});
}

type Renderable = { render(width: number): string[] };
const patched = new WeakSet<object>();

function highlightChanges<T extends Renderable>(component: T): T {
	if (!patched.has(component)) {
		const render = component.render.bind(component);
		component.render = (width: number) => render(width).map(inverseToHighlight);
		patched.add(component);
	}
	return component;
}

export default function (pi: ExtensionAPI) {
	const edit = createEditToolDefinition(process.cwd());
	const { renderCall, renderResult } = edit;
	pi.registerTool({
		...edit,
		...(renderCall ? { renderCall: (...args: Parameters<typeof renderCall>) => highlightChanges(renderCall(...args)) } : {}),
		...(renderResult ? { renderResult: (...args: Parameters<typeof renderResult>) => highlightChanges(renderResult(...args)) } : {}),
	});
}
