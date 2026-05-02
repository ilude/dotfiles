import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readMergedSettings } from "../lib/settings-loader.js";

export const DIRECT_PERSONALITY_PROMPT = `

# Communication style: direct

When responding to the user, be direct, concise, and action-oriented. Avoid filler, praise-heavy phrasing, and unnecessary reassurance. Preserve required safety checks, verification detail, caveats, and exact commands when they are needed for correctness.`;

type Settings = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isDirectPersonalityEnabled(settings: Settings): boolean {
	if (settings.personality === "direct") return true;
	if (settings.personality === "default" || settings.personality === "none") return false;
	const pi = settings.pi;
	if (isRecord(pi) && pi.personality === "direct") return true;
	return false;
}

export function appendDirectPersonalityPrompt(systemPrompt: string, settings: Settings): string {
	if (!isDirectPersonalityEnabled(settings)) return systemPrompt;
	if (systemPrompt.includes("# Communication style: direct")) return systemPrompt;
	return `${systemPrompt}${DIRECT_PERSONALITY_PROMPT}`;
}

function modelId(model: unknown): string {
	if (!isRecord(model)) return "";
	const id = model.id ?? model.model ?? model.name;
	return typeof id === "string" ? id : "";
}

function modelProvider(model: unknown): string {
	if (!isRecord(model)) return "";
	const provider = model.provider ?? model.providerId;
	return typeof provider === "string" ? provider : "";
}

export function supportsOpenAiGpt5Verbosity(model: unknown): boolean {
	const provider = modelProvider(model);
	if (provider !== "openai" && provider !== "openai-codex") return false;
	return /^gpt-5(?:[.\w-]|$)/.test(modelId(model));
}

export function applyDirectVerbosity(payload: unknown, settings: Settings, model: unknown): unknown {
	if (!isDirectPersonalityEnabled(settings) || !supportsOpenAiGpt5Verbosity(model) || !isRecord(payload)) {
		return payload;
	}
	const text = isRecord(payload.text) ? payload.text : {};
	return {
		...payload,
		text: {
			...text,
			verbosity: text.verbosity ?? "low",
		},
	};
}

export function loadUserPersonalitySettings(): Settings {
	return readMergedSettings({ skipProject: true, skipLocal: true });
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		const settings = loadUserPersonalitySettings();
		const systemPrompt = appendDirectPersonalityPrompt(event.systemPrompt, settings);
		if (systemPrompt === event.systemPrompt) return undefined;
		return { systemPrompt };
	});

	pi.on("before_provider_request", (event, ctx) => {
		const settings = loadUserPersonalitySettings();
		const payload = applyDirectVerbosity(event.payload, settings, (ctx as { model?: unknown }).model);
		return payload === event.payload ? undefined : payload;
	});
}
