import * as os from "node:os";
import * as path from "node:path";
import { readMergedSettings } from "../settings-loader.js";
import { type ClassifierMode, isClassifierMode } from "./classifier-modes.js";

export const PROMPT_ROUTING_DIR = path.join(
	os.homedir(),
	".dotfiles/pi/prompt-routing",
);
export const CLASSIFY_SCRIPT = path.join(PROMPT_ROUTING_DIR, "classify.py");
export const SETTINGS_PATH = path.join(
	os.homedir(),
	".dotfiles/pi/settings.json",
);

export type RouterClassifierMode = ClassifierMode;

export interface RouterConfig {
	defaultEffortLevel: string;
	classifierMode: ClassifierMode;
}

export const ROUTER_DEFAULTS: RouterConfig = {
	defaultEffortLevel: "medium",
	classifierMode: "t2",
};

export const CLASSIFIER_MODE_DEFAULT: RouterClassifierMode =
	ROUTER_DEFAULTS.classifierMode;

function readEffortLevel(
	source: Record<string, unknown>,
	key: string,
	fallback: string,
	effortOrder: Record<string, number>,
): string {
	const value = source[key];
	return typeof value === "string" && effortOrder[value] !== undefined
		? value
		: fallback;
}

export class InvalidRouterSettingsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidRouterSettingsError";
	}
}

function readClassifierMode(router: Record<string, unknown>): ClassifierMode {
	const classifier = router.classifier as Record<string, unknown> | undefined;
	const mode = classifier?.mode;
	if (mode === undefined) return ROUTER_DEFAULTS.classifierMode;
	if (isClassifierMode(mode)) return mode;
	throw new InvalidRouterSettingsError(
		"router.classifier.mode must be one of: t2, lgbm, ensemble, confgate",
	);
}

export function loadRouterConfig(
	effortOrder: Record<string, number>,
): RouterConfig {
	try {
		// Router settings live in ~/.dotfiles/pi/settings.json today (a non-default
		// user location); use the userPath override so the cascade reads it as the
		// user layer. skipProject + skipLocal preserves the existing scope --
		// router defaults are not project-overridable.
		const s = readMergedSettings({
			userPath: SETTINGS_PATH,
			skipProject: true,
			skipLocal: true,
		});
		const router = (s?.router as Record<string, unknown>) ?? {};
		const effort = (router.effort as Record<string, unknown> | undefined) ?? {};
		return {
			defaultEffortLevel: readEffortLevel(
				effort,
				"defaultLevel",
				ROUTER_DEFAULTS.defaultEffortLevel,
				effortOrder,
			),
			classifierMode: readClassifierMode(router),
		};
	} catch (err) {
		if (err instanceof InvalidRouterSettingsError) throw err;
		return { ...ROUTER_DEFAULTS };
	}
}

export function loadRouterClassifierMode(): RouterClassifierMode {
	const settings = readPromptRouterSettings();
	const router = settings?.router as Record<string, unknown> | undefined;
	if (!router) return CLASSIFIER_MODE_DEFAULT;
	return readClassifierMode(router);
}

export function readPromptRouterSettings(): Record<string, unknown> | null {
	try {
		return readMergedSettings({
			userPath: SETTINGS_PATH,
			skipProject: true,
			skipLocal: true,
		}) as Record<string, unknown>;
	} catch {
		return null;
	}
}
