import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
	createAgentSession,
	createExtensionRuntime,
	type ExtensionContext,
	type ResourceLoader,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";

export interface TypedAgentRunContext
	extends Pick<ExtensionContext, "cwd" | "model" | "modelRegistry" | "signal"> {}

export interface TypedAgentConfig<
	TInputSchema extends TSchema,
	TOutputSchema extends TSchema,
> {
	id: string;
	instructions: string;
	inputSchema: TInputSchema;
	outputSchema: TOutputSchema;
	resolveModel: (
		ctx: TypedAgentRunContext,
	) => Promise<Model<any> | undefined> | Model<any> | undefined;
	prompt: (input: Static<TInputSchema>) => string;
}

export interface TypedAgentResult<TOutput> {
	output: TOutput;
	attempts: number;
}

export interface TypedAgent<
	TInputSchema extends TSchema,
	TOutputSchema extends TSchema,
> {
	id: string;
	run(
		input: Static<TInputSchema>,
		ctx: TypedAgentRunContext,
	): Promise<TypedAgentResult<Static<TOutputSchema>>>;
}

const OUTPUT_RETRIES = 1;

function createResourceLoader(systemPrompt: string): ResourceLoader {
	return {
		getExtensions: () => ({
			extensions: [],
			errors: [],
			runtime: createExtensionRuntime(),
		}),
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => systemPrompt,
		getAppendSystemPrompt: () => [],
		extendResources: () => {},
		reload: async () => {},
	};
}

function assistantText(messages: AgentMessage[]): string | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role !== "assistant" || !Array.isArray(message.content)) {
			continue;
		}
		const text = message.content
			.filter((item) => item.type === "text")
			.map((item) => item.text)
			.join("")
			.trim();
		if (text) return text;
	}
	return undefined;
}

function extractJsonObject(text: string): string | undefined {
	const start = text.indexOf("{");
	if (start < 0) return undefined;
	const stack: string[] = [];
	let inString = false;
	let escaped = false;
	for (let index = start; index < text.length; index += 1) {
		const character = text[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\") {
			escaped = true;
			continue;
		}
		if (character === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (character === "{") stack.push("}");
		else if (character === "}") {
			if (stack.pop() !== "}") return undefined;
			if (stack.length === 0) return text.slice(start, index + 1);
		}
	}
	return undefined;
}

function decodeOutput<TSchemaType extends TSchema>(
	schema: TSchemaType,
	text: string,
): Static<TSchemaType> {
	const json = extractJsonObject(text);
	if (!json) throw new Error("response did not contain a JSON object");
	return Value.Decode(schema, JSON.parse(json)) as Static<TSchemaType>;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function abortError(id: string): Error {
	const error = new Error(`${id} was aborted`);
	error.name = "AbortError";
	return error;
}

export function defineAgent<
	TInputSchema extends TSchema,
	TOutputSchema extends TSchema,
>(
	config: TypedAgentConfig<TInputSchema, TOutputSchema>,
): TypedAgent<TInputSchema, TOutputSchema> {
	return {
		id: config.id,
		async run(input, ctx) {
			if (ctx.signal?.aborted) throw abortError(config.id);
			const validatedInput = Value.Decode(
				config.inputSchema,
				input,
			) as Static<TInputSchema>;
			const model = await config.resolveModel(ctx);
			if (!model) throw new Error(`${config.id} has no available model`);
			const systemPrompt = `${config.instructions.trim()}\n\nReturn only one JSON object matching this schema:\n${JSON.stringify(config.outputSchema, null, 2)}`;
			const settingsManager = SettingsManager.inMemory({
				compaction: { enabled: false },
				retry: { enabled: true, maxRetries: 2 },
			});
			const { session } = await createAgentSession({
				cwd: ctx.cwd,
				model,
				thinkingLevel: "low",
				modelRegistry: ctx.modelRegistry,
				resourceLoader: createResourceLoader(systemPrompt),
				noTools: "all",
				sessionManager: SessionManager.inMemory(ctx.cwd),
				settingsManager,
			});
			const abort = () => {
				void session.abort();
			};
			ctx.signal?.addEventListener("abort", abort, { once: true });
			try {
				let prompt = config.prompt(validatedInput);
				for (let attempt = 1; attempt <= OUTPUT_RETRIES + 1; attempt += 1) {
					await session.prompt(prompt);
					if (ctx.signal?.aborted) throw abortError(config.id);
					const text = assistantText(session.messages);
					if (!text) throw new Error(`${config.id} returned no output`);
					try {
						return {
							output: decodeOutput(config.outputSchema, text),
							attempts: attempt,
						};
					} catch (error) {
						if (attempt > OUTPUT_RETRIES) {
							throw new Error(
								`${config.id} returned invalid output: ${errorMessage(error)}`,
							);
						}
						prompt = `Your previous response failed output validation: ${errorMessage(error)}. Return only one corrected JSON object matching the required schema.`;
					}
				}
				throw new Error(`${config.id} exhausted output retries`);
			} finally {
				ctx.signal?.removeEventListener("abort", abort);
				session.dispose();
			}
		},
	};
}
