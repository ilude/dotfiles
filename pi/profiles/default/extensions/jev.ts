import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EntryType, Questions } from "@typesafe-ai/sdk";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { createJevClient, JevClientError, type JevClient } from "../lib/jev/client.ts";

// TypeSafe accepts text, JSON objects/arrays, or null for state and descriptions.
const entrySchema = Type.Union([
	Type.String({ description: "Text description." }),
	Type.Record(Type.String(), Type.Unknown(), { description: "Structured JSON object description." }),
	Type.Array(Type.Unknown(), { description: "Structured JSON array description." }),
	Type.Null({ description: "No description." }),
]);
const choiceCriteriaSchema = Type.Record(Type.String({ minLength: 1 }), entrySchema, { description: "Named choices and their descriptions. Provide 2 to 255 choices.", minProperties: 2, maxProperties: 255 });
const scoreCriteriaSchema = Type.Array(entrySchema, { description: "Ordered score descriptions from level 0 upward. Provide 2 to 10 levels.", minItems: 2, maxItems: 10 });
const noulCriteriaSchema = Type.Object({
	true: Type.Optional(entrySchema),
	false: Type.Optional(entrySchema),
}, { description: "Optional descriptions for true and false outcomes.", additionalProperties: false });
const questionSchema = Type.Union([
	Type.Object({ type: Type.Literal("choice"), instructions: entrySchema, criteria: choiceCriteriaSchema }, { additionalProperties: false }),
	Type.Object({ type: Type.Literal("score"), instructions: entrySchema, criteria: scoreCriteriaSchema }, { additionalProperties: false }),
	Type.Object({ type: Type.Literal("noul"), instructions: entrySchema, criteria: Type.Optional(Type.Union([noulCriteriaSchema, Type.Null()])) }, { additionalProperties: false }),
]);
const questionsSchema = Type.Record(Type.String({ minLength: 1 }), questionSchema, { minProperties: 1 });
const jevParameters = Type.Object({
	state: entrySchema,
	questions: questionsSchema,
	model: Type.Optional(Type.String({ minLength: 1 })),
}, { additionalProperties: false });

type JevToolDetails = {
	model?: string;
	usage?: { input_tokens: number; output_tokens: number };
	elapsed_ms?: number;
	code?: JevClientError["code"];
};
function validQuestions(value: unknown): value is Questions {
	return Value.Check(questionsSchema, value);
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
			if (!Value.Check(jevParameters, params)) {
				return { content: [{ type: "text", text: "Jev evaluation failed: invalid state, questions, or model" }], details: toolDetails({ code: "request" }), isError: true };
			}
			const started = performance.now();
			try {
				const result = await client.evaluate(params.state as EntryType, params.questions as Questions, { model: params.model, signal });
				const elapsed_ms = Math.round(performance.now() - started);
				return {
					content: [{ type: "text", text: JSON.stringify({ answers: result.answers, model: result.model, usage: result.usage, elapsed_ms }) }],
					details: toolDetails({ model: result.model, usage: result.usage, elapsed_ms }),
				};
			} catch (error) {
				const failure = safeError(error);
				return { content: [{ type: "text", text: failure.text }], details: toolDetails(failure.details), isError: true };
			}
		},
	});
}

export { jevParameters, validQuestions };
