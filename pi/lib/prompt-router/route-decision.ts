import type { RouteState } from "./route-profile.js";
import type { RouterSize } from "./route-vocabulary.js";

export type RouteResolutionReason =
	| "matched"
	| "fallback_used"
	| "classifier_timeout"
	| "classifier_failure"
	| "denied_by_policy";

export interface RoutingTelemetryContextCapsule {
	isContinuation: boolean;
	dependencyOnPriorContext: boolean;
	lastEffectiveSize: RouterSize | null;
	unresolvedTask: boolean;
	downgradeIntentDetected: boolean;
	messageCount: number;
	contextPercent: number | null;
	flags: string[];
}

export interface RouteDecisionTrace {
	route: RouterSize;
	domain: string;
	effort: string;
	profile: string;
	provider: string;
	model: string;
	routeState: RouteState;
	fallbackFrom?: RouterSize;
	reason: RouteResolutionReason;
	providerFamily: string;
	providerTrust: "same-provider" | "same-family" | "cross-provider-denied";
	confidence: number | null;
	candidates: Array<{ route: RouterSize; effort: string; confidence: number }>;
	rule: string;
	contextFlags: string[];
	contextCapsule?: RoutingTelemetryContextCapsule;
	overrideScope: string;
	overrideLifetime: string;
	explicitModelPreserved: boolean;
	fallbackAllowed: boolean;
	fallbackDeniedReason?: string;
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
	latency_ms?: number;
}
