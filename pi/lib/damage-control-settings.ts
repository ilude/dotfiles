export interface DamageControlJudgeSettings {
	enabled: boolean;
	autoAllow: boolean;
	provider?: string;
	model?: string;
}

const DEFAULT_PROVIDER = "openai-codex";
const DEFAULT_MODEL = "gpt-5.6-luna";

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseDamageControlJudgeSettings(
	settings: Record<string, unknown>,
): DamageControlJudgeSettings {
	const damageControl = settings.damageControl;
	const judge = isRecord(damageControl) ? damageControl.judge : undefined;
	if (!isRecord(judge)) {
		return {
			enabled: false,
			autoAllow: false,
			provider: DEFAULT_PROVIDER,
			model: DEFAULT_MODEL,
		};
	}

	const enabled = judge.enabled === undefined ? false : judge.enabled;
	const autoAllow = judge.autoAllow === undefined ? false : judge.autoAllow;
	if (typeof enabled !== "boolean" || typeof autoAllow !== "boolean") {
		return { enabled: false, autoAllow: false };
	}

	const provider = judge.provider;
	const model = judge.model;
	if (
		(provider !== undefined && (typeof provider !== "string" || provider.trim() === "")) ||
		(model !== undefined && (typeof model !== "string" || model.trim() === ""))
	) {
		return { enabled: false, autoAllow: false };
	}

	const normalizedProvider = provider?.trim() ?? DEFAULT_PROVIDER;
	const normalizedModel = model?.trim() ?? DEFAULT_MODEL;
	const exactLunaModel = /(?:^|[-_.:/])luna(?:$|[-_.:/])/i.test(normalizedModel) || /luna/i.test(normalizedModel);
	return {
		enabled,
		autoAllow: autoAllow && enabled && Boolean(provider && model) && exactLunaModel,
		provider: normalizedProvider,
		model: normalizedModel,
	};
}

export function readDamageControlJudgeSettings(
	readSettings: () => Record<string, unknown>,
): DamageControlJudgeSettings {
	return parseDamageControlJudgeSettings(readSettings());
}
