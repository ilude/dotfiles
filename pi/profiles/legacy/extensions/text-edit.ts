import { StringEnum } from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
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

const TEXT_OPERATION_MODES = [
	"literal_replace",
	"regex_replace",
	"normalize_line_endings",
	"ensure_final_newline",
] as const;
type TextOperationMode = (typeof TEXT_OPERATION_MODES)[number];

export interface Operation {
	mode: TextOperationMode;
	search?: string;
	pattern?: string;
	replace?: string;
	flags?: string;
	expectedMatches?: number;
	allowZero?: boolean;
}

type ValidatedOperation =
	| (Operation & { mode: "literal_replace"; search: string; replace: string })
	| (Operation & { mode: "regex_replace"; pattern: string; replace: string })
	| (Operation & { mode: "normalize_line_endings" | "ensure_final_newline" });

function requireString(operation: Record<string, unknown>, field: string): string {
	if (typeof operation[field] !== "string")
		throw new Error(`${operation.mode ?? "Operation"} mode requires a string ${field}`);
	return operation[field];
}

function validateTextOperation(operation: Operation): ValidatedOperation {
	if (!operation || typeof operation !== "object")
		throw new Error("Text edit operation must be an object");
	const input = operation as unknown as Record<string, unknown>;
	if (!TEXT_OPERATION_MODES.includes(input.mode as TextOperationMode))
		throw new Error(`Unsupported text edit mode: ${String(input.mode)}`);
	if (input.flags !== undefined && typeof input.flags !== "string")
		throw new Error("Text edit flags must be a string");
	if (input.expectedMatches !== undefined && typeof input.expectedMatches !== "number")
		throw new Error("Text edit expectedMatches must be a number");
	if (input.allowZero !== undefined && typeof input.allowZero !== "boolean")
		throw new Error("Text edit allowZero must be a boolean");

	switch (input.mode) {
		case "literal_replace":
			requireString(input, "search");
			requireString(input, "replace");
			return operation as ValidatedOperation;
		case "regex_replace":
			requireString(input, "pattern");
			requireString(input, "replace");
			return operation as ValidatedOperation;
		case "normalize_line_endings":
		case "ensure_final_newline":
			return operation as ValidatedOperation;
	}
	throw new Error(`Unsupported text edit mode: ${String(input.mode)}`);
}

function validateTextOperations(operations: Operation[]): ValidatedOperation[] {
	return operations.map(validateTextOperation);
}

export function applyTextOperations(
	input: string,
	operations: Operation[],
): { text: string; matches: number[] } {
	const validatedOperations = validateTextOperations(operations);
	let text = input;
	const matches: number[] = [];
	for (const op of validatedOperations) {
		if (op.mode === "literal_replace") {
			const count = op.search === "" ? 0 : text.split(op.search).length - 1;
			assertMatchCount(count, op.expectedMatches, op.allowZero);
			text = text.split(op.search).join(op.replace);
			matches.push(count);
		} else if (op.mode === "regex_replace") {
			const flags = op.flags?.includes("g") ? op.flags : `${op.flags ?? ""}g`;
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
			"Edit text files with literal/regex replacement, LF normalization, final newline, dry-run previews, working-directory containment, and expected match counts.",
		parameters: Type.Object({
			paths: Type.Array(Type.String()),
			dryRun: Type.Optional(Type.Boolean()),
			operations: Type.Array(
				Type.Object({
					mode: StringEnum(TEXT_OPERATION_MODES),
					search: Type.Optional(Type.String()),
					pattern: Type.Optional(Type.String()),
					replace: Type.Optional(Type.String()),
					flags: Type.Optional(Type.String()),
					expectedMatches: Type.Optional(Type.Number()),
					allowZero: Type.Optional(Type.Boolean()),
				}),
			),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			try {
				const cwd = ctx.cwd ?? process.cwd();
				const dryRun = params.dryRun ?? false;
				const operations = validateTextOperations(params.operations as Operation[]);
				const summaries: string[] = [];
				for (const raw of params.paths) {
					const file = resolveSafePath(raw, cwd);
					await withFileMutationQueue(file.absolute, async () => {
						if (signal?.aborted) throw new Error("Text edit aborted");
						const before = readSafeText(file);
						const result = applyTextOperations(before, operations);
						if (!dryRun && result.text !== before)
							writeSafeText(file, result.text);
						summaries.push(
							`${file.relative}: ${dryRun ? "dry-run" : "updated"}; operations=${params.operations.length}; matches=${result.matches.join(",")}; preview=\n${boundedPreview(before, result.text)}`,
						);
					});
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
				theme.fg("accent", "✏️  ") +
					theme.fg("toolTitle", `${args.paths?.length ?? 0} file(s)`),
				0,
				0,
			);
		},
	});
}
