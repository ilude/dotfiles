import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
	createAgentSession,
	createExtensionRuntime,
	type ExtensionContext,
	type ResourceLoader,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Kind, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export interface TypedAgentRunContext
	extends Pick<
		ExtensionContext,
		"cwd" | "model" | "modelRegistry" | "signal"
	> {}

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
	) => Promise<Model<Api> | undefined> | Model<Api> | undefined;
	prompt: (input: Static<TInputSchema>) => string;
	timeoutMs?: number;
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

const extractJsonObject = (text: string): string | undefined => {
	const start = text.indexOf("{");
	if (start < 0) return undefined;
	for (let end = text.length; end > start; end -= 1) {
		if (text[end - 1] !== "}") continue;
		const candidate = text.slice(start, end);
		try {
			JSON.parse(candidate);
			return candidate;
		} catch {
			continue;
		}
	}
	return undefined;
};

function hydrateJsonSchema(schema: TSchema): TSchema {
	if (schema[Kind]) return schema;
	if ("$ref" in schema || "oneOf" in schema)
		throw new Error("output schema uses unsupported $ref or oneOf");
	if (Array.isArray(schema.type)) {
		return hydrateJsonSchema({
			...schema,
			type: undefined,
			anyOf: schema.type.map((type) => ({ type })),
		} as TSchema);
	}
	if (Array.isArray(schema.enum)) {
		return hydrateJsonSchema({
			...schema,
			enum: undefined,
			anyOf: schema.enum.map((value) => ({ const: value })),
		} as TSchema);
	}
	const hydrated = { ...schema } as TSchema;
	if (schema.properties && typeof schema.properties === "object") {
		hydrated.properties = Object.fromEntries(
			Object.entries(schema.properties as Record<string, TSchema>).map(
				([key, value]) => [key, hydrateJsonSchema(value)],
			),
		);
	}
	if (schema.items && typeof schema.items === "object")
		hydrated.items = hydrateJsonSchema(schema.items as TSchema);
	if (Array.isArray(schema.anyOf))
		hydrated.anyOf = schema.anyOf.map((value) =>
			hydrateJsonSchema(value as TSchema),
		);
	if (Array.isArray(schema.allOf))
		hydrated.allOf = schema.allOf.map((value) =>
			hydrateJsonSchema(value as TSchema),
		);
	const kind =
		"const" in schema
			? "Literal"
			: Array.isArray(schema.anyOf)
				? "Union"
				: Array.isArray(schema.allOf)
					? "Intersect"
					: schema.type === "object"
						? "Object"
						: schema.type === "array"
							? "Array"
							: schema.type === "string"
								? "String"
								: schema.type === "integer"
									? "Integer"
									: schema.type === "number"
										? "Number"
										: schema.type === "boolean"
											? "Boolean"
											: schema.type === "null"
												? "Null"
												: undefined;
	if (!kind) throw new Error("output schema has no supported root type");
	Object.defineProperty(hydrated, Kind, { value: kind, enumerable: false });
	return hydrated;
}

export function decodeSchemaOutput<TSchemaType extends TSchema>(
	schema: TSchemaType,
	text: string,
): Static<TSchemaType> {
	const json = extractJsonObject(text);
	if (!json) throw new Error("response did not contain a JSON object");
	return Value.Decode(
		hydrateJsonSchema(schema),
		JSON.parse(json),
	) as Static<TSchemaType>;
}

export function schemaOutputInstruction(schema: TSchema): string {
	return `Return only one JSON object matching this schema:\n${JSON.stringify(schema, null, 2)}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function abortError(id: string): Error {
	const error = new Error(`${id} was aborted`);
	error.name = "AbortError";
	return error;
}

function timeoutError(id: string, timeoutMs: number): Error {
	const error = new Error(`${id} timed out after ${timeoutMs}ms`);
	error.name = "TimeoutError";
	return error;
}

function createRunCancellation(
	id: string,
	timeoutMs: number | undefined,
	sourceSignal: AbortSignal | undefined,
) {
	const controller = new AbortController();
	let timedOut = false;
	const abortFromContext = () => controller.abort();
	sourceSignal?.addEventListener("abort", abortFromContext, { once: true });
	const timeout =
		timeoutMs === undefined
			? undefined
			: setTimeout(() => {
					timedOut = true;
					controller.abort();
				}, timeoutMs);
	return {
		controller,
		throwIfAborted() {
			if (!controller.signal.aborted) return;
			if (timedOut && timeoutMs !== undefined) {
				throw timeoutError(id, timeoutMs);
			}
			throw abortError(id);
		},
		dispose() {
			sourceSignal?.removeEventListener("abort", abortFromContext);
			if (timeout !== undefined) clearTimeout(timeout);
		},
	};
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
			const cancellation = createRunCancellation(
				config.id,
				config.timeoutMs,
				ctx.signal,
			);
			const { controller, throwIfAborted } = cancellation;
			const runContext = { ...ctx, signal: controller.signal };
			try {
				const model = await config.resolveModel(runContext);
				throwIfAborted();
				if (!model) throw new Error(`${config.id} has no available model`);
				const systemPrompt = `${config.instructions.trim()}\n\n${schemaOutputInstruction(config.outputSchema)}`;
				const settingsManager = SettingsManager.inMemory({
					compaction: { enabled: false },
					retry: { enabled: true, maxRetries: 2 },
				});
				const { session } = await createAgentSession({
					cwd: ctx.cwd,
					model,
					thinkingLevel: "low",
					resourceLoader: createResourceLoader(systemPrompt),
					noTools: "all",
					sessionManager: SessionManager.inMemory(ctx.cwd),
					settingsManager,
				});
				let abortPromise: Promise<void> | undefined;
				const abort = () => {
					abortPromise ??= Promise.resolve(session.abort());
					return abortPromise;
				};
				controller.signal.addEventListener("abort", abort, { once: true });
				try {
					if (controller.signal.aborted) await abort();
					throwIfAborted();
					let prompt = config.prompt(validatedInput);
					for (let attempt = 1; attempt <= OUTPUT_RETRIES + 1; attempt += 1) {
						try {
							await session.prompt(prompt);
						} catch (error) {
							throwIfAborted();
							throw error;
						}
						throwIfAborted();
						const text = assistantText(session.messages);
						if (!text) throw new Error(`${config.id} returned no output`);
						try {
							return {
								output: decodeSchemaOutput(config.outputSchema, text),
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
					controller.signal.removeEventListener("abort", abort);
					await abortPromise;
					session.dispose();
				}
			} finally {
				cancellation.dispose();
			}
		},
	};
}
