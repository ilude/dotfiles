import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { formatToolError } from "../lib/extension-utils.js";
import {
	readSafeText,
	resolveSafePath,
	setFinalNewline,
	writeSafeText,
} from "../lib/safe-edit.js";

type Segment = string | number;
export type Operation =
	| { mode: "set"; path: Segment[]; value: unknown }
	| { mode: "delete"; path: Segment[] };
const DANGEROUS = new Set(["__proto__", "prototype", "constructor"]);

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
	for (const op of operations) {
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
			"Safely edit JSON files with typed-array set/delete operations, indentation, finalNewline, and repo path safety.",
		parameters: Type.Object({
			path: Type.String(),
			format: Type.Literal("json"),
			indent: Type.Optional(Type.Number()),
			finalNewline: Type.Optional(Type.Boolean()),
			operations: Type.Array(
				Type.Union([
					Type.Object({
						mode: Type.Literal("set"),
						path: Type.Array(Type.Union([Type.String(), Type.Number()])),
						value: Type.Unknown(),
					}),
					Type.Object({
						mode: Type.Literal("delete"),
						path: Type.Array(Type.Union([Type.String(), Type.Number()])),
					}),
				]),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			try {
				if (params.format !== "json")
					throw new Error("Only format=json is supported in v1");
				const file = resolveSafePath(params.path, ctx.cwd ?? process.cwd());
				const before = readSafeText(file);
				const data = JSON.parse(before);
				const edited = applyStructuredOperations(
					data,
					params.operations as Operation[],
				);
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
						format: "json",
						finalNewline: params.finalNewline ?? true,
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
				theme.fg("accent", "🧩 ") + theme.fg("toolTitle", args.path ?? "json"),
				0,
				0,
			);
		},
	});
}
