import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EntryType, Questions } from "@typesafe-ai/sdk";
import { Type } from "typebox";
import { createJevClient, JevClientError, type JevClient } from "../lib/jev/client.ts";

const entrySchema = Type.Unknown();
const questionSchema = Type.Object({
	type: Type.Union([Type.Literal("choice"), Type.Literal("score"), Type.Literal("noul")]),
	instructions: Type.Optional(entrySchema),
	criteria: Type.Optional(entrySchema),
}, { additionalProperties: false });
const jevParameters = Type.Object({
	state: entrySchema,
	questions: Type.Record(Type.String({ minLength: 1 }), questionSchema),
	model: Type.Optional(Type.String({ minLength: 1 })),
}, { additionalProperties: false });

type JevToolDetails = {
	model?: string;
	usage?: { input_tokens: number; output_tokens: number };
	elapsed_ms?: number;
	code?: JevClientError["code"];
};
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validQuestions(value: unknown): value is Questions {
	if (!isRecord(value) || Object.keys(value).length === 0) return false;
	return Object.values(value).every((question) => {
		if (!isRecord(question) || !["choice", "score", "noul"].includes(String(question.type))) return false;
		if (question.type === "choice") return isRecord(question.criteria) && Object.keys(question.criteria).length >= 2;
		if (question.type === "score") return Array.isArray(question.criteria) && question.criteria.length >= 2;
		return question.criteria === undefined || question.criteria === null || isRecord(question.criteria);
	});
}

function toolDetails(value: JevToolDetails): JevToolDetails {
	return value;
}

function safeError(error: unknown): { text: string; details: JevToolDetails } {
	if (error instanceof JevClientError) return { text: `Jev evaluation failed: ${error.message}`, details: { code: error.code } };
	return { text: "Jev evaluation failed", details: { code: "request" } };
}

export default function registerJev(pi: ExtensionAPI, client: JevClient = createJevClient()): void {
	pi.registerTool({
		name: "jev_evaluate",
		label: "Jev Evaluate",
		description: "Evaluate supplied state against typed Jev questions without reading files or taking actions.",
		promptSnippet: "Run a bounded Jev evaluation on explicitly supplied evidence",
		promptGuidelines: [
			"Use only when the requested state and typed questions are supplied explicitly.",
			"Treat answers and confidence as advisory evidence, not authorization or factual guarantees.",
		],
		parameters: jevParameters,
		execute: async (_id, params, signal) => {
			if (!validQuestions(params.questions)) {
				return { content: [{ type: "text", text: "Jev evaluation failed: questions must contain at least one valid typed question" }], details: toolDetails({ code: "request" }) };
			}
			const started = performance.now();
			try {
				const result = await client.evaluate(params.state as EntryType, params.questions, { model: params.model, signal });
				const elapsed_ms = Math.round(performance.now() - started);
				return {
					content: [{ type: "text", text: JSON.stringify({ answers: result.answers, model: result.model, usage: result.usage, elapsed_ms }) }],
					details: toolDetails({ model: result.model, usage: result.usage, elapsed_ms }),
				};
			} catch (error) {
				const failure = safeError(error);
				return { content: [{ type: "text", text: failure.text }], details: toolDetails(failure.details) };
			}
		},
	});
}

export { jevParameters, validQuestions };
