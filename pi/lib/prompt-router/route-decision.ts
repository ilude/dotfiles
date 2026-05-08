import type { RouterSize } from "./route-vocabulary.js";

export type RouteResolutionReason =
	| "matched"
	| "fallback_used"
	| "classifier_timeout"
	| "classifier_failure"
	| "denied_by_policy";

export interface RouteDecisionTrace {
	route: RouterSize;
	domain: string;
	effort: string;
	profile: string;
	provider: string;
	model: string;
	routeState: string;
	fallbackFrom?: RouterSize;
	reason: RouteResolutionReason;
	providerFamily: string;
	confidence: number | null;
	candidates: Array<{ route: RouterSize; effort: string; confidence: number }>;
	rule: string;
	contextFlags: string[];
	overrideScope: string;
	fallbackReason?: string;
}

export interface RouteDecision {
	route_decision_id: string;
	prompt_hash: string;
	classifier_mode: string;
	raw_route: RouterSize;
	applied_route: RouterSize;
	provider_family: string;
	model_label: string;
	thinking_level: string;
	route_resolution_reason: RouteResolutionReason;
	fallback_reason?: string;
	same_turn_applied: boolean;
	decisionTrace: RouteDecisionTrace;
}
