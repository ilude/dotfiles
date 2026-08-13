import { createHash } from "node:crypto";
import {
	VERSION,
	type BeforeAgentStartEvent,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { recordEvent } from "../lib/metrics.js";
import { loadCascadedSettings } from "../lib/settings-loader.js";

const UNAVAILABLE = "unavailable";

type AvailableString = string | typeof UNAVAILABLE;
type ContextFileFingerprint = {
	path: AvailableString;
	contentSha256: AvailableString;
};
type ConfigurationIdentity = {
	provider: AvailableString;
	modelId: AvailableString;
	thinkingLevel: AvailableString;
};
type InitialSnapshot = ConfigurationIdentity;

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function requiredString(value: unknown): AvailableString {
	return typeof value === "string" && value.length > 0 ? value : UNAVAILABLE;
}

function canonicalJson(value: unknown): string | undefined {
	if (value === null) return "null";
	if (typeof value === "string" || typeof value === "boolean")
		return JSON.stringify(value);
	if (typeof value === "number")
		return Number.isFinite(value) ? JSON.stringify(value) : undefined;
	if (Array.isArray(value)) {
		const items = value.map(canonicalJson);
		return items.every((item): item is string => item !== undefined)
			? `[${items.join(",")}]`
			: undefined;
	}
	if (typeof value !== "object" || value === undefined) return undefined;
	const entries = Object.entries(value)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([key, item]) => {
			const serialized = canonicalJson(item);
			return serialized === undefined
				? undefined
				: `${JSON.stringify(key)}:${serialized}`;
		});
	return entries.every((entry): entry is string => entry !== undefined)
		? `{${entries.join(",")}}`
		: undefined;
}

function fingerprintContextFiles(
	event: BeforeAgentStartEvent,
): ContextFileFingerprint[] | typeof UNAVAILABLE {
	const contextFiles = event.systemPromptOptions.contextFiles;
	if (!Array.isArray(contextFiles)) return UNAVAILABLE;
	return contextFiles.map((file) => ({
		path: requiredString(file?.path),
		contentSha256:
			typeof file?.content === "string"
				? sha256(file.content)
				: UNAVAILABLE,
	}));
}

function fingerprintSettings(ctx: ExtensionContext): AvailableString {
	const projectTrusted = ctx.isProjectTrusted();
	const settings = loadCascadedSettings({
		projectRoot: ctx.cwd,
		skipProject: !projectTrusted,
		skipLocal: !projectTrusted,
	});
	if (Object.values(settings.sources).some((source) => source.error))
		return UNAVAILABLE;
	const serialized = canonicalJson(settings.merged);
	return serialized === undefined ? UNAVAILABLE : sha256(serialized);
}

function configurationIdentity(ctx: ExtensionContext): ConfigurationIdentity {
	return {
		provider: requiredString(ctx.model?.provider),
		modelId: requiredString(ctx.model?.id),
		thinkingLevel: requiredString(ctx.thinkingLevel),
	};
}

function sessionId(ctx: ExtensionContext): string | undefined {
	return ctx.sessionManager?.getSessionId?.();
}

function sameIdentity(
	left: ConfigurationIdentity,
	right: ConfigurationIdentity,
): boolean {
	return (
		left.provider === right.provider &&
		left.modelId === right.modelId &&
		left.thinkingLevel === right.thinkingLevel
	);
}

export default function sessionConfigurationFingerprint(pi: ExtensionAPI): void {
	let initialSnapshot: InitialSnapshot | undefined;

	const recordChange = (next: ConfigurationIdentity, ctx: ExtensionContext): void => {
		if (!initialSnapshot || sameIdentity(initialSnapshot, next)) return;
		recordEvent({
			event: "configuration_fingerprint",
			session: sessionId(ctx),
			data: {
				schemaVersion: 1,
				recordKind: "model_or_effort_change",
				...next,
				previousProvider: initialSnapshot.provider,
				previousModelId: initialSnapshot.modelId,
				previousThinkingLevel: initialSnapshot.thinkingLevel,
			},
		});
		initialSnapshot = next;
	};

	pi.on("session_start", () => {
		initialSnapshot = undefined;
	});

	pi.on("before_agent_start", (event, ctx) => {
		if (initialSnapshot) return;
		const identity = configurationIdentity(ctx);
		recordEvent({
			event: "configuration_fingerprint",
			session: sessionId(ctx),
			data: {
				schemaVersion: 1,
				recordKind: "initial",
				...identity,
				systemPromptSha256:
					typeof event.systemPrompt === "string"
						? sha256(event.systemPrompt)
						: UNAVAILABLE,
				contextFiles: fingerprintContextFiles(event),
				initialToolsetSha256: sha256(
					[...new Set(pi.getActiveTools())].sort().join("\n"),
				),
				settingsSha256: fingerprintSettings(ctx),
				piVersion: requiredString(VERSION),
			},
		});
		initialSnapshot = identity;
	});

	pi.on("model_select", (event, ctx) => {
		const next = {
			...configurationIdentity(ctx),
			provider: requiredString(event.model.provider),
			modelId: requiredString(event.model.id),
		};
		recordChange(next, ctx);
	});

	pi.on("thinking_level_select", (event, ctx) => {
		recordChange(
			{
				...configurationIdentity(ctx),
				thinkingLevel: requiredString(event.level),
			},
			ctx,
		);
	});
}
