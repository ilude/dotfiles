import { Compile } from "typebox/schema";
import { AcquisitionError } from "./acquisition.ts";
export type JsonData = null | boolean | number | string | JsonData[] | { [key: string]: JsonData };
function isJson(value: unknown): value is JsonData {
	if (value === null || typeof value === "string" || typeof value === "boolean") return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (Array.isArray(value)) return value.every(isJson);
	return value !== null && typeof value === "object" && Object.values(value).every(isJson);
}
type StructuredOutput = { format: "json"; content: string; truncated: boolean; data?: JsonData; dataOmittedReason?: "size-limit" };
export type Extraction = { schema: Record<string, unknown>; result: (data: unknown, warning?: string) => StructuredOutput };

/** Validate without cleaning/coercing source values. Oversize data stays a partial view, not another paid request. */
export function prepareExtraction(format: "markdown" | "json" | undefined, schema: Record<string, unknown> | undefined, maxChars: number): Extraction | undefined {
	if (format !== "json" && schema === undefined) return undefined;
	if (format === "markdown" || !schema) throw new AcquisitionError("invalid-request", "JSON extraction requires a schema and cannot request Markdown");
	let validator: ReturnType<typeof Compile>;
	try { if (!isJson(schema)) throw new Error(); validator = Compile(schema); }
	catch { throw new AcquisitionError("invalid-request", "Extraction schema is not supported JSON Schema"); }
	return { schema, result(data, warning) {
		if (!isJson(data) || !validator.Check(data)) throw new AcquisitionError("invalid-response", "Extracted data does not match the requested schema");
		const serialized = JSON.stringify(data, null, 2);
		const text = serialized + (warning ? `\n\nProvider warning: ${warning.slice(0, 2000)}` : "");
		const fits = text.length <= maxChars && Buffer.byteLength(text) <= 45_000 && text.split("\n").length <= 1800;
		return { format: "json", content: fits ? text : text.slice(0, maxChars) + "\n\n[Truncated JSON view; refine the schema or output bound. Full structured data omitted.]",
			truncated: !fits, ...(fits ? { data } : { dataOmittedReason: "size-limit" }) };
	} };
}
