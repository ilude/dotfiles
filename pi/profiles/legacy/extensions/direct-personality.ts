import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readMergedSettings } from "../lib/settings-loader.js";

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
	pi.on("before_provider_request", (event, ctx) => {
		const settings = loadUserPersonalitySettings();
		const payload = applyDirectVerbosity(event.payload, settings, (ctx as { model?: unknown }).model);
		return payload === event.payload ? undefined : payload;
	});
}
