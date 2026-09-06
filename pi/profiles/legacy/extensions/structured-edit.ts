import { StringEnum } from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { formatToolError } from "../lib/extension-utils.js";
import {
	readSafeText,
	resolveSafePath,
	setFinalNewline,
	writeSafeText,
} from "../lib/safe-edit.js";

type Segment = string | number;
const STRUCTURED_OPERATION_MODES = ["set", "delete"] as const;
type StructuredOperationMode = (typeof STRUCTURED_OPERATION_MODES)[number];

export interface Operation {
	mode: StructuredOperationMode;
	path: Segment[];
	value?: unknown;
}

type ValidatedOperation =
	| (Operation & { mode: "set"; value: unknown })
	| (Operation & { mode: "delete" });

const DANGEROUS = new Set(["__proto__", "prototype", "constructor"]);

function validateStructuredOperation(operation: Operation): ValidatedOperation {
	if (!operation || typeof operation !== "object")
		throw new Error("Structured edit operation must be an object");
	const input = operation as unknown as Record<string, unknown>;
	if (!STRUCTURED_OPERATION_MODES.includes(input.mode as StructuredOperationMode))
		throw new Error(`Unsupported structured edit mode: ${String(input.mode)}`);
	if (!Array.isArray(input.path))
		throw new Error(`${input.mode} mode requires a path array`);
	if (
		input.path.some(
			(segment) => typeof segment !== "string" && typeof segment !== "number",
		)
	)
		throw new Error("Path segments must be strings or numbers");
	if (input.mode === "set" && !("value" in input))
		throw new Error("set mode requires a value");
	return operation as ValidatedOperation;
}

function validateStructuredOperations(
	operations: Operation[],
): ValidatedOperation[] {
	return operations.map(validateStructuredOperation);
}

function checkPath(segments: Segment[]) {
	if (segments.length === 0) throw new Error("Path must not be empty");
	for (const segment of segments)
		if (DANGEROUS.has(String(segment)))
			throw new Error("Refusing prototype-pollution path segment");
}

function parentFor(
	root: unknown,
	segments: Segment[],
): { parent: unknown; key: Segment } {
	checkPath(segments);
	let node: unknown = root;
	for (const segment of segments.slice(0, -1)) {
		if (Array.isArray(node)) {
			if (typeof segment !== "number" || segment < 0 || segment >= node.length)
				throw new Error("Array path segment does not exist");
			node = node[segment];
		} else if (
			node &&
			typeof node === "object" &&
			Object.hasOwn(node, segment)
		) {
			node = (node as Record<string, unknown>)[String(segment)];
		} else {
			throw new Error("Parent container does not exist");
		}
	}
	return { parent: node, key: segments[segments.length - 1] };
}

export function applyStructuredOperations(
	root: unknown,
	operations: Operation[],
): unknown {
	const validatedOperations = validateStructuredOperations(operations);
	for (const op of validatedOperations) {
		const { parent, key } = parentFor(root, op.path);
		if (Array.isArray(parent)) {
			if (typeof key !== "number" || key < 0 || key >= parent.length)
				throw new Error("Array target does not exist");
			if (op.mode === "set") parent[key] = op.value;
			else parent.splice(key, 1);
		} else if (parent && typeof parent === "object") {
			if (op.mode === "delete" && !Object.hasOwn(parent, key))
				throw new Error("Delete target does not exist");
			(parent as Record<string, unknown>)[String(key)] =
				op.mode === "set" ? op.value : undefined;
			if (op.mode === "delete")
				delete (parent as Record<string, unknown>)[String(key)];
		} else {
			throw new Error("Target parent is not a container");
		}
	}
	return root;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "structured_edit",
		label: "Structured Edit",
		description:
			"Edit JSON files with typed-array set/delete operations, indentation, finalNewline, and working-directory containment.",
		parameters: Type.Object({
			path: Type.String(),
			indent: Type.Optional(Type.Number()),
			finalNewline: Type.Optional(Type.Boolean()),
			operations: Type.Array(
				Type.Object({
					mode: StringEnum(STRUCTURED_OPERATION_MODES),
					path: Type.Array(Type.Union([Type.String(), Type.Number()])),
					value: Type.Optional(Type.Unknown()),
				}),
			),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			try {
				const operations = validateStructuredOperations(
					params.operations as Operation[],
				);
				const file = resolveSafePath(params.path, ctx.cwd ?? process.cwd());
				return await withFileMutationQueue(file.absolute, async () => {
					if (signal?.aborted) throw new Error("Structured edit aborted");
					const before = readSafeText(file);
					const data = JSON.parse(before);
					const edited = applyStructuredOperations(data, operations);
					const text = setFinalNewline(
						JSON.stringify(edited, null, params.indent ?? 2),
						params.finalNewline ?? true,
					);
					writeSafeText(file, text);
					return {
						content: [
							{
								type: "text" as const,
								text: `${file.relative}: updated ${params.operations.length} JSON operation(s)`,
							},
						],
						details: {
							finalNewline: params.finalNewline ?? true,
						},
					};
				});
			} catch (error) {
				return formatToolError(
					error instanceof Error ? error.message : String(error),
				);
			}
		},
		renderCall(args, theme) {
			return new Text(
				theme.fg("accent", "🧩  ") + theme.fg("toolTitle", args.path ?? "json"),
				0,
				0,
			);
		},
	});
}
