import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { formatToolError } from "../lib/extension-utils.js";
import {
	assertMatchCount,
	boundedPreview,
	normalizeLf,
	readSafeText,
	resolveSafePath,
	setFinalNewline,
	writeSafeText,
} from "../lib/safe-edit.js";

export type Operation =
	| {
			mode: "literal_replace";
			search: string;
			replace: string;
			expectedMatches?: number;
			allowZero?: boolean;
	  }
	| {
			mode: "regex_replace";
			pattern: string;
			replace: string;
			flags?: string;
			expectedMatches?: number;
			allowZero?: boolean;
	  }
	| { mode: "normalize_line_endings" }
	| { mode: "ensure_final_newline" };

export function applyTextOperations(
	input: string,
	operations: Operation[],
): { text: string; matches: number[] } {
	let text = input;
	const matches: number[] = [];
	for (const op of operations) {
		if (op.mode === "literal_replace") {
			const count = op.search === "" ? 0 : text.split(op.search).length - 1;
			assertMatchCount(count, op.expectedMatches, op.allowZero);
			text = text.split(op.search).join(op.replace);
			matches.push(count);
		} else if (op.mode === "regex_replace") {
			const flags = op.flags?.includes("g") ? op.flags : `${op.flags ?? ""}g`;
			if (op.pattern.length > 500)
				throw new Error("Regex pattern exceeds 500 characters");
			const re = new RegExp(op.pattern, flags);
			const count = [...text.matchAll(re)].length;
			assertMatchCount(count, op.expectedMatches, op.allowZero);
			text = text.replace(re, op.replace);
			matches.push(count);
		} else if (op.mode === "normalize_line_endings") {
			text = normalizeLf(text);
			matches.push(0);
		} else {
			text = setFinalNewline(text, true);
			matches.push(0);
		}
	}
	return { text, matches };
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "text_edit",
		label: "Text Edit",
		description:
			"Safely edit tracked repo text files with literal/regex replacement, LF normalization, final newline, dry-run previews, path safety, and expected match counts.",
		parameters: Type.Object({
			paths: Type.Array(Type.String()),
			dryRun: Type.Optional(Type.Boolean()),
			operations: Type.Array(
				Type.Union([
					Type.Object({
						mode: Type.Literal("literal_replace"),
						search: Type.String(),
						replace: Type.String(),
						expectedMatches: Type.Optional(Type.Number()),
						allowZero: Type.Optional(Type.Boolean()),
					}),
					Type.Object({
						mode: Type.Literal("regex_replace"),
						pattern: Type.String(),
						replace: Type.String(),
						flags: Type.Optional(Type.String()),
						expectedMatches: Type.Optional(Type.Number()),
						allowZero: Type.Optional(Type.Boolean()),
					}),
					Type.Object({ mode: Type.Literal("normalize_line_endings") }),
					Type.Object({ mode: Type.Literal("ensure_final_newline") }),
				]),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			try {
				const cwd = ctx.cwd ?? process.cwd();
				const dryRun = params.dryRun ?? false;
				const summaries: string[] = [];
				for (const raw of params.paths) {
					const file = resolveSafePath(raw, cwd);
					const before = readSafeText(file);
					const result = applyTextOperations(
						before,
						params.operations as Operation[],
					);
					if (!dryRun && result.text !== before)
						writeSafeText(file, result.text);
					summaries.push(
						`${file.relative}: ${dryRun ? "dry-run" : "updated"}; operations=${params.operations.length}; matches=${result.matches.join(",")}; preview=\n${boundedPreview(before, result.text)}`,
					);
				}
				return {
					content: [{ type: "text" as const, text: summaries.join("\n\n") }],
					details: {
						dryRun,
						resolved: summaries.length,
						operationCount: params.operations.length,
					},
				};
			} catch (error) {
				return formatToolError(
					error instanceof Error ? error.message : String(error),
				);
			}
		},
		renderCall(args, theme) {
			return new Text(
				theme.fg("accent", "✏️ ") +
					theme.fg("toolTitle", `${args.paths?.length ?? 0} file(s)`),
				0,
				0,
			);
		},
	});
}
