export const CLASSIFIER_MODES = ["t2", "lgbm", "ensemble", "confgate"] as const;
export type ClassifierMode = (typeof CLASSIFIER_MODES)[number];

export function isClassifierMode(value: unknown): value is ClassifierMode {
	return (
		typeof value === "string" &&
		(CLASSIFIER_MODES as readonly string[]).includes(value)
	);
}
