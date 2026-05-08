export const ROUTER_SIZES = ["nano", "mini", "core", "large", "max"] as const;
export type RouterSize = (typeof ROUTER_SIZES)[number];

export const ROUTER_SIZE_ORDER: Record<RouterSize, number> = {
	nano: 0,
	mini: 1,
	core: 2,
	large: 3,
	max: 4,
};

const LEGACY_MODEL_TIER_TO_ROUTE: Record<string, RouterSize> = {
	Haiku: "mini",
	Sonnet: "core",
	Opus: "large",
};

const ROUTE_ALIASES: Record<string, RouterSize> = {
	small: "mini",
	medium: "core",
	large: "large",
};

export function isRouterSize(value: unknown): value is RouterSize {
	return (
		typeof value === "string" &&
		(ROUTER_SIZES as readonly string[]).includes(value)
	);
}

export function normalizeRouteCandidate(value: unknown): RouterSize | null {
	if (isRouterSize(value)) return value;
	if (typeof value !== "string") return null;
	return LEGACY_MODEL_TIER_TO_ROUTE[value] ?? ROUTE_ALIASES[value] ?? null;
}

export function legacyModelTierToRoute(value: string): RouterSize | null {
	return LEGACY_MODEL_TIER_TO_ROUTE[value] ?? null;
}
