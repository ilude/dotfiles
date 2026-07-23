import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	appendFeatureMemoryEvent,
	buildFeatureContext,
	createFeatureMemoryEvent,
	FEATURE_EVENT_KINDS,
	type FeatureEventKind,
	featureMemoryEventsPath,
	type LoadRegistryOptions,
	loadFeatureRegistry,
	matchFeatureIds,
	MAX_FEATURE_CONTEXT_CHARS,
} from "../lib/feature-memory-store.js";
import { activateTools, deactivateTools } from "../lib/tool-activation.js";

const FeatureEventKindSchema = StringEnum(
	FEATURE_EVENT_KINDS,
) as unknown as ReturnType<typeof Type.String>;

export interface FeatureMemoryExtensionOptions extends LoadRegistryOptions {
	eventsPath?: string;
}

export const MAX_FEATURE_INJECTION_CHARS = MAX_FEATURE_CONTEXT_CHARS;

export function boundFeatureContextInjection(contexts: string[]): string {
	const combined = contexts.join("\n\n---\n\n");
	if (combined.length <= MAX_FEATURE_INJECTION_CHARS) return combined;
	const marker = "\n[feature context injection truncated at total character limit]";
	return `${combined.slice(0, MAX_FEATURE_INJECTION_CHARS - marker.length).trimEnd()}${marker}`;
}

export default function featureMemoryExtension(
	pi: ExtensionAPI,
	options: FeatureMemoryExtensionOptions = {},
): Promise<void> {
	return registerFeatureMemoryExtension(pi, options);
}

async function registerFeatureMemoryExtension(
	pi: ExtensionAPI,
	options: FeatureMemoryExtensionOptions,
): Promise<void> {
	const registry = await loadFeatureRegistry(options);
	const eventsPath = options.eventsPath ?? featureMemoryEventsPath();
	const injectedFeatureIds = new Set<string>();
	const matchedFeatureIds = new Set<string>();

	pi.on("session_start", () => {
		injectedFeatureIds.clear();
		matchedFeatureIds.clear();
		deactivateTools(pi, ["feature_memory_record"]);
	});

	pi.on("before_agent_start", async (event) => {
		const matches = matchFeatureIds(registry, event.prompt ?? "");
		for (const featureId of matches) matchedFeatureIds.add(featureId);
		if (matches.length > 0) activateTools(pi, ["feature_memory_record"]);
		const pending = matches.filter(
			(featureId) => !injectedFeatureIds.has(featureId),
		);
		if (pending.length === 0) return;
		const contexts = await Promise.all(
			pending.map((featureId) =>
				buildFeatureContext(registry, featureId, { eventsPath }),
			),
		);
		for (const featureId of pending) injectedFeatureIds.add(featureId);
		return {
			message: {
				customType: "feature-memory",
				content: boundFeatureContextInjection(contexts),
				display: false,
			},
		};
	});

	pi.registerTool({
		name: "feature_memory_record",
		label: "Record Feature Memory",
		description:
			"Append one bounded local feature event when the user explicitly requests memory or an active owning workflow requires it. Does not edit tracked dossiers.",
		promptSnippet:
			"Record a requested or workflow-required event for a matched feature",
		promptGuidelines: [
			"Call feature_memory_record only when the user explicitly requests memory or an active owning workflow requires the durable event; matching a feature alone is insufficient.",
			"Record only an explicit user decision, validated evidence, an open question, or a supersession during matched feature work.",
			"Do not pass raw transcripts, speculative conclusions, secrets, tool output, or general session summaries to feature_memory_record.",
			"Use feature_memory_record sourcePaths only for the bounded repository paths that support the event.",
		],
		parameters: Type.Object(
			{
				featureId: Type.String({ minLength: 1, maxLength: 80 }),
				kind: FeatureEventKindSchema,
				summary: Type.String({ minLength: 1, maxLength: 600 }),
				sourcePaths: Type.Array(Type.String({ minLength: 1, maxLength: 240 }), {
					maxItems: 12,
				}),
			},
			{ additionalProperties: false },
		),
		async execute(_toolCallId, params) {
			if (!registry.features[params.featureId])
				throw new Error(`Unknown feature ID: ${params.featureId}`);
			if (!matchedFeatureIds.has(params.featureId))
				throw new Error(
					`Feature ${params.featureId} has not matched work in this session`,
				);
			if (!FEATURE_EVENT_KINDS.includes(params.kind as FeatureEventKind))
				throw new Error(`Unknown feature event kind: ${params.kind}`);
			const event = createFeatureMemoryEvent({
				featureId: params.featureId,
				kind: params.kind as FeatureEventKind,
				summary: params.summary,
				sourcePaths: params.sourcePaths,
			});
			await appendFeatureMemoryEvent(event, eventsPath);
			return {
				content: [
					{
						type: "text" as const,
						text: `Recorded ${event.kind} for ${event.featureId}: ${event.summary.slice(0, 160)}`,
					},
				],
				details: {
					eventId: event.eventId,
					featureId: event.featureId,
					kind: event.kind,
				},
			};
		},
	});
}
