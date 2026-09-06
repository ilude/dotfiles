import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const OPUS_5_PROVIDERS = new Set([
	"amazon-bedrock",
	"anthropic",
	"bedrock-mantle",
	"opencode",
	"openrouter",
]);
const OPUS_5_MODELS = [
	/^(?:(?:au|eu|global|jp|us)\.)?anthropic\.claude-opus-5(?:$|[-.:])/,
	/^anthropic\/claude-opus-5(?:$|[-.:])/,
	/^claude-opus-5(?:$|[-.:])/,
];

export const OPUS_5_INSTRUCTION = [
	"For Opus 5, avoid the verbal tics 'load-bearing,' 'worth stating plainly,' 'here's the honest truth,' 'the real tension,' and 'carry the argument.'",
	"Do not repeat conclusions, turn short answers into decorative sections, or produce long completion recaps.",
].join(" ");

export type OpusModel = {
	provider: string;
	id: string;
};

export function isOpus5Model(model: OpusModel | undefined): boolean {
	return (
		model !== undefined &&
		OPUS_5_PROVIDERS.has(model.provider) &&
		OPUS_5_MODELS.some((pattern) => pattern.test(model.id))
	);
}

export function appendOpus5Instruction(
	systemPrompt: string,
	model: OpusModel | undefined,
): string | undefined {
	if (!isOpus5Model(model) || systemPrompt.includes(OPUS_5_INSTRUCTION)) {
		return undefined;
	}
	return `${systemPrompt}\n\n${OPUS_5_INSTRUCTION}`;
}

export default function opus5Style(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event, ctx) => {
		const systemPrompt = appendOpus5Instruction(event.systemPrompt, ctx.model);
		return systemPrompt === undefined ? undefined : { systemPrompt };
	});
}
