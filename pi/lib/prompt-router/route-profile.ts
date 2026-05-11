import type { ModelLike } from "../model-routing.js";
import type { RouterSize } from "./route-vocabulary.js";

export type RouteState = "available" | "fallback" | "policy-only" | "disabled";

export interface DefaultRouteProfile {
	route: RouterSize;
	domain: "default" | "coding/general";
	effort: string;
	profile: string;
	provider: string;
	preferredModels: readonly string[];
	routeState: RouteState;
	fallbackRoute?: RouterSize;
	fallbackReason?: string;
	trustClass: "same-provider" | "same-family" | "cross-provider-denied";
}

export const DEFAULT_CODEX_ROUTE_PROFILES: Record<
	RouterSize,
	DefaultRouteProfile
> = {
	nano: {
		route: "nano",
		domain: "coding/general",
		effort: "low",
		profile: "codex:nano",
		provider: "openai-codex",
		preferredModels: ["gpt-5.4-nano"],
		routeState: "disabled",
		fallbackRoute: "mini",
		fallbackReason: "nano unavailable by default; applied mini",
		trustClass: "same-family",
	},
	mini: {
		route: "mini",
		domain: "coding/general",
		effort: "low",
		profile: "codex:mini",
		provider: "openai-codex",
		preferredModels: ["gpt-5.4-mini"],
		routeState: "available",
		trustClass: "same-family",
	},
	core: {
		route: "core",
		domain: "coding/general",
		effort: "medium",
		profile: "codex:core",
		provider: "openai-codex",
		preferredModels: ["gpt-5.5", "gpt-5.3-codex"],
		routeState: "available",
		trustClass: "same-family",
	},
	large: {
		route: "large",
		domain: "coding/general",
		effort: "high",
		profile: "codex:large",
		provider: "openai-codex",
		preferredModels: ["gpt-5.5", "gpt-5.3-codex"],
		routeState: "available",
		trustClass: "same-family",
	},
	max: {
		route: "max",
		domain: "coding/general",
		effort: "high",
		profile: "codex:max",
		provider: "openai-codex",
		preferredModels: ["gpt-5.5", "gpt-5.3-codex"],
		routeState: "policy-only",
		fallbackRoute: "large",
		fallbackReason:
			"max is policy-only until a dedicated max profile is enabled",
		trustClass: "same-family",
	},
};

export function resolveDefaultCodexProfile(
	route: RouterSize,
): DefaultRouteProfile {
	return DEFAULT_CODEX_ROUTE_PROFILES[route];
}

export function providerFamilyTrust(
	current: ModelLike | undefined,
	resolved: ModelLike | undefined,
): DefaultRouteProfile["trustClass"] {
	if (!current?.provider || !resolved?.provider) return "same-family";
	return current.provider === resolved.provider
		? "same-family"
		: "cross-provider-denied";
}
