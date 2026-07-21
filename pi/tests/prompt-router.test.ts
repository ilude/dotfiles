import * as fs from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../extensions/transcript-runtime.ts", () => ({
	emit: vi.fn(async () => {}),
	getSessionId: vi.fn(() => "test-session"),
	getWriter: vi.fn(() => null),
}));

import promptRouter, {
	applyModelEffortBias,
	applyRouteDecisionToProviderPayload,
	buildRouterTelemetryPayload,
	buildRoutingContextCapsule,
	effortOverrideType,
	readUserEffortOverride,
	resolveProviderRouteDecision,
	resolveRouteProfile,
	safeParseClassifierOutput,
} from "../extensions/prompt-router.ts";
import { emit as transcriptEmit } from "../extensions/transcript-runtime.ts";
import { resolveDefaultCodexProfile } from "../lib/prompt-router/route-profile.ts";
import {
	legacyModelTierToRoute,
	normalizeRouteCandidate,
	ROUTER_SIZES,
} from "../lib/prompt-router/route-vocabulary.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.mocked(transcriptEmit).mockClear();
});

function makeV3Json(
	modelTier: string,
	effort: string,
	confidence = 0.8,
): string {
	return JSON.stringify({
		schema_version: "3.0.0",
		primary: { model_tier: modelTier, effort },
		candidates: [{ model_tier: modelTier, effort, confidence }],
		confidence,
	});
}

function makeV3Rec(modelTier: string, effort: string, confidence = 0.8) {
	const rec = safeParseClassifierOutput(
		makeV3Json(modelTier, effort, confidence),
	);
	if (!rec) throw new Error("test fixture should parse");
	return rec;
}

async function routeProviderPrompt(
	pi: ReturnType<typeof createMockPi>,
	ctx: ReturnType<typeof createMockCtx>,
	prompt: string,
	payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
	const hook = pi._getHook("before_provider_request")[0];
	if (!hook) throw new Error("before_provider_request hook not registered");
	return (await hook.handler(
		{ payload: { prompt, ...payload } },
		ctx,
	)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// model-specific effort bias
// ---------------------------------------------------------------------------

describe("applyModelEffortBias", () => {
	const codexGpt55 = { provider: "openai-codex", id: "gpt-5.5" };
	const codexGpt56Sol = { provider: "openai-codex", id: "gpt-5.6-sol" };
	const otherModel = { provider: "openai-codex", id: "gpt-5.6-terra" };

	it("biases GPT-5.5 medium effort down to the configured default", () => {
		expect(
			applyModelEffortBias(
				"medium",
				makeV3Rec("core", "medium", 0.95),
				codexGpt55,
				"medium",
			),
		).toBe("medium");
		expect(
			applyModelEffortBias(
				"medium",
				makeV3Rec("core", "medium", 0.95),
				codexGpt55,
				"low",
			),
		).toBe("low");
	});

	it("keeps premium Codex high effort only for high-confidence complex prompts", () => {
		for (const model of [codexGpt55, codexGpt56Sol]) {
			expect(
				applyModelEffortBias(
					"high",
					makeV3Rec("large", "high", 0.79),
					model,
					"medium",
				),
			).toBe("medium");
			expect(
				applyModelEffortBias("high", makeV3Rec("large", "high", 0.8), model),
			).toBe("high");
		}
	});

	it("does not bias other models", () => {
		expect(
			applyModelEffortBias(
				"medium",
				makeV3Rec("core", "medium", 0.5),
				otherModel,
			),
		).toBe("medium");
	});
});

// ---------------------------------------------------------------------------
// canonical route vocabulary
// ---------------------------------------------------------------------------

describe("default Codex route profiles", () => {
	it("maps GPT-5.6 models to the Luna, Terra, and Sol ladder", () => {
		expect(resolveDefaultCodexProfile("mini").preferredModels[0]).toBe(
			"gpt-5.6-luna",
		);
		expect(resolveDefaultCodexProfile("core").preferredModels[0]).toBe(
			"gpt-5.6-terra",
		);
		expect(resolveDefaultCodexProfile("large").preferredModels[0]).toBe(
			"gpt-5.6-sol",
		);
	});
});

describe("canonical route vocabulary parity", () => {
	it("matches the shared TS/Python fixture", () => {
		const fixturePath = path.join(
			__dirname,
			"../prompt-routing/tests/fixtures/canonical_route_vocabulary.json",
		);
		const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

		expect(ROUTER_SIZES).toEqual(fixture.canonical_routes);
		for (const [legacy, route] of Object.entries(fixture.legacy_route_map)) {
			expect(legacyModelTierToRoute(legacy)).toBe(route);
			expect(normalizeRouteCandidate(legacy)).toBe(route);
		}
		for (const [alias, route] of Object.entries(fixture.route_aliases)) {
			expect(normalizeRouteCandidate(alias)).toBe(route);
		}
	});
});

// ---------------------------------------------------------------------------
// safeParseClassifierOutput (T4 -- schema validation)
// ---------------------------------------------------------------------------

describe("safeParseClassifierOutput", () => {
	it("accepts valid v3 JSON", () => {
		const raw = makeV3Json("core", "medium", 0.72);
		const rec = safeParseClassifierOutput(raw);
		expect(rec).not.toBeNull();
		expect(rec!.schema_version).toBe("3.0.0");
		expect(rec!.primary.model_tier).toBe("core");
		expect(rec!.primary.effort).toBe("medium");
		expect(rec!.confidence).toBe(0.72);
	});

	it("rejects invalid JSON (garbage input)", () => {
		expect(safeParseClassifierOutput("not json at all")).toBeNull();
		expect(safeParseClassifierOutput("")).toBeNull();
		expect(safeParseClassifierOutput("{}")).toBeNull();
	});

	it("rejects truly invalid input (non-JSON, non-tier strings)", () => {
		expect(safeParseClassifierOutput("not json at all")).toBeNull();
		expect(safeParseClassifierOutput("")).toBeNull();
		expect(safeParseClassifierOutput("{}")).toBeNull();
	});

	it("rejects missing schema_version", () => {
		const raw = JSON.stringify({
			primary: { model_tier: "core", effort: "medium" },
			candidates: [{ model_tier: "core", effort: "medium", confidence: 0.8 }],
			confidence: 0.8,
		});
		expect(safeParseClassifierOutput(raw)).toBeNull();
	});

	it("rejects unknown schema_version", () => {
		const raw = JSON.stringify({
			schema_version: "99.0.0",
			primary: { model_tier: "core", effort: "medium" },
			candidates: [{ model_tier: "core", effort: "medium", confidence: 0.8 }],
			confidence: 0.8,
		});
		expect(safeParseClassifierOutput(raw)).toBeNull();
	});

	it("rejects missing primary.effort", () => {
		const raw = JSON.stringify({
			schema_version: "3.0.0",
			primary: { model_tier: "core" },
			candidates: [{ model_tier: "core", effort: "medium", confidence: 0.8 }],
			confidence: 0.8,
		});
		expect(safeParseClassifierOutput(raw)).toBeNull();
	});

	it("rejects missing primary.model_tier", () => {
		const raw = JSON.stringify({
			schema_version: "3.0.0",
			primary: { effort: "medium" },
			candidates: [{ model_tier: "core", effort: "medium", confidence: 0.8 }],
			confidence: 0.8,
		});
		expect(safeParseClassifierOutput(raw)).toBeNull();
	});

	it("rejects unknown primary.model_tier values", () => {
		const raw = JSON.stringify({
			schema_version: "3.0.0",
			primary: { model_tier: "unknown", effort: "medium" },
			candidates: [
				{ model_tier: "unknown", effort: "medium", confidence: 0.8 },
			],
			confidence: 0.8,
		});
		expect(safeParseClassifierOutput(raw)).toBeNull();
	});

	it("rejects empty candidates array", () => {
		const raw = JSON.stringify({
			schema_version: "3.0.0",
			primary: { model_tier: "core", effort: "medium" },
			candidates: [],
			confidence: 0.8,
		});
		expect(safeParseClassifierOutput(raw)).toBeNull();
	});

	it("rejects missing confidence", () => {
		const raw = JSON.stringify({
			schema_version: "3.0.0",
			primary: { model_tier: "core", effort: "medium" },
			candidates: [{ model_tier: "core", effort: "medium", confidence: 0.8 }],
		});
		expect(safeParseClassifierOutput(raw)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Input hook no longer performs background routing
// ---------------------------------------------------------------------------

describe("prompt-router input hook", () => {
	it("does not classify normal user text before provider dispatch", async () => {
		const pi = createMockPi();
		promptRouter(pi as any);
		const ctx = createMockCtx();
		const inputHook = pi._getHook("input")[0];

		const result = await inputHook.handler(
			{ text: "a prompt", source: "user" },
			ctx,
		);

		expect(result).toEqual({ action: "continue" });
		expect(pi.exec).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Effort set per tier (v3 JSON inputs)
// ---------------------------------------------------------------------------

describe("user effort override", () => {
	it("detects user effort overrides and classifies direction", () => {
		expect(
			readUserEffortOverride({}, { user_selected_effort: "high" }),
		).toEqual({
			effort: "high",
			scope: "request",
		});
		expect(effortOverrideType("low", "high")).toBe("user_effort_up");
		expect(effortOverrideType("high", "low")).toBe("user_effort_down");
	});

	it("preserves user effort up in provider payload", () => {
		const decision = {
			route_decision_id: "route-1",
			model_label: "gpt-5.4-fast",
			thinking_level: "low",
			route_resolution_reason: "matched",
		} as any;

		const payload = applyRouteDecisionToProviderPayload(
			{ prompt: "debug this", user_selected_effort: "high" },
			decision,
		) as Record<string, unknown>;

		expect(payload.reasoning_effort).toBe("high");
	});

	it("preserves user effort down in provider payload", () => {
		const decision = {
			route_decision_id: "route-1",
			model_label: "gpt-5.4-fast",
			thinking_level: "high",
			route_resolution_reason: "matched",
		} as any;

		const payload = applyRouteDecisionToProviderPayload(
			{ prompt: "quick answer", user_selected_effort: "low" },
			decision,
		) as Record<string, unknown>;

		expect(payload.reasoning_effort).toBe("low");
	});

	it("preserves runtime thinking selection in the provider payload", async () => {
		const pi = createMockPi();
		(pi as any).getThinkingLevel = vi.fn(() => "xhigh");
		promptRouter(pi as any);

		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.5-mini" },
			{ provider: "openai-codex", id: "gpt-5.5-fast" },
			{ provider: "openai-codex", id: "gpt-5.5" },
		];
		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.5" },
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find((m) => m.provider === provider && m.id === id),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.95),
			stderr: "",
		});

		const payload = await routeProviderPrompt(pi, ctx, "analyze this");

		expect(payload.reasoning_effort).toBe("xhigh");
	});

	it("records privacy-safe override telemetry fields", () => {
		const rec = makeV3Rec("core", "low", 0.8);
		const payload = buildRouterTelemetryPayload({
			promptHash: "abc123",
			classifierMode: "confgate",
			rawRoute: "core",
			appliedRoute: "core",
			rec,
			ruleFired: "classifier",
			userSelectedRoute: { route: "core", effort: "high" },
			finalAppliedEffort: "high",
			overrideType: "user_effort_up",
			contextCapsule: {
				messageCount: 1,
				estimatedPromptChars: 42,
				contextWindow: null,
				contextPercent: null,
				flags: [],
			},
		});

		expect(payload.prompt_hash).toBe("abc123");
		expect(payload.prompt_excerpt).toBeNull();
		expect(payload.router_recommended_route).toEqual({
			model_tier: "core",
			effort: "low",
		});
		expect(payload.user_selected_route).toEqual({
			route: "core",
			effort: "high",
		});
		expect(payload.final_applied_route).toEqual({
			model_tier: "core",
			effort: "high",
		});
		expect(payload.override_type).toBe("user_effort_up");
		expect(payload.prompt_features).toEqual({
			estimated_chars: 42,
			message_count: 1,
			flags: [],
		});
	});
});

// ---------------------------------------------------------------------------
// Effort set per tier (v3 JSON inputs)
// ---------------------------------------------------------------------------

describe("effort set per tier", () => {
	it("sets provider payload reasoning effort for each tier", async () => {
		const pi = createMockPi();
		promptRouter(pi as any);

		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];

		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4" },
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find((m) => m.provider === provider && m.id === id),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("mini", "low"),
			stderr: "",
		});
		expect(
			(await routeProviderPrompt(pi, ctx, "what is a variable"))
				.reasoning_effort,
		).toBe("low");

		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("large", "high"),
			stderr: "",
		});
		expect(
			(await routeProviderPrompt(pi, ctx, "design a distributed system"))
				.reasoning_effort,
		).toBe("high");

		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium"),
			stderr: "",
		});
		expect(
			(await routeProviderPrompt(pi, ctx, "refactor this function"))
				.reasoning_effort,
		).toBe("medium");
	});

	it("routes GPT-5.6 mini, core, and large to Luna, Terra, and Sol", async () => {
		const pi = createMockPi();
		promptRouter(pi as any);
		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.6-luna" },
			{ provider: "openai-codex", id: "gpt-5.6-terra" },
			{ provider: "openai-codex", id: "gpt-5.6-sol" },
		];
		const ctx = createMockCtx({
			model: availableModels[2],
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find(
						(model) => model.provider === provider && model.id === id,
					),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		for (const [route, model] of [
			["mini", "gpt-5.6-luna"],
			["core", "gpt-5.6-terra"],
			["large", "gpt-5.6-sol"],
		] as const) {
			(pi.exec as any).mockResolvedValueOnce({
				code: 0,
				stdout: makeV3Json(route, route === "large" ? "high" : "medium", 0.9),
				stderr: "",
			});
			expect((await routeProviderPrompt(pi, ctx, `route ${route}`)).model).toBe(
				model,
			);
		}
	});
});

// ---------------------------------------------------------------------------
// T4 classifier JSON parse cases
// ---------------------------------------------------------------------------

describe("classifier JSON parse -- T4", () => {
	function setup() {
		const pi = createMockPi();
		promptRouter(pi as any);

		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];

		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4" },
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find((m) => m.provider === provider && m.id === id),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		return { pi, ctx };
	}

	it("valid JSON -- provider payload applies the recommendation", async () => {
		const { pi, ctx } = setup();
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.85),
			stderr: "",
		});

		const payload = await routeProviderPrompt(
			pi,
			ctx,
			"explain how promises work",
		);

		expect(payload.model).toBe("gpt-5.4-fast");
		expect(payload.reasoning_effort).toBe("medium");
	});

	it("uses model id, not display name, in provider payload", async () => {
		const pi = createMockPi();
		promptRouter(pi as any);
		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.4-mini", name: "GPT 5.4 Mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast", name: "GPT 5.4 Fast" },
			{ provider: "openai-codex", id: "gpt-5.4", name: "GPT 5.4" },
		];
		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4", name: "GPT 5.4" },
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find((m) => m.provider === provider && m.id === id),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.85),
			stderr: "",
		});

		const payload = await routeProviderPrompt(pi, ctx, "explain promises");

		expect(payload.model).toBe("gpt-5.4-fast");
		expect(payload.model).not.toBe("GPT 5.4 Fast");
	});

	it("invalid JSON -- router falls back and logs warning", async () => {
		const { pi, ctx } = setup();
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: "garbage output not json",
			stderr: "",
		});

		const payload = await routeProviderPrompt(pi, ctx, "some prompt");

		expect(payload.route_resolution_reason).toBe("classifier_failure");
		expect((ctx.ui as any).notify).toHaveBeenCalledWith(
			expect.stringContaining("classifier output invalid"),
			"warning",
		);
	});

	it("schema_version mismatch -- router falls back", async () => {
		const { pi, ctx } = setup();
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				schema_version: "99.0.0",
				primary: { model_tier: "core", effort: "medium" },
				candidates: [{ model_tier: "core", effort: "medium", confidence: 0.8 }],
				confidence: 0.8,
			}),
			stderr: "",
		});

		const payload = await routeProviderPrompt(pi, ctx, "some prompt");

		expect(payload.route_resolution_reason).toBe("classifier_failure");
		expect((ctx.ui as any).notify).toHaveBeenCalledWith(
			expect.stringContaining("classifier output invalid"),
			"warning",
		);
	});

	it("missing required field -- router falls back", async () => {
		const { pi, ctx } = setup();
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				schema_version: "3.0.0",
				primary: { model_tier: "core" },
				candidates: [{ model_tier: "core", effort: "medium", confidence: 0.8 }],
				confidence: 0.8,
			}),
			stderr: "",
		});

		const payload = await routeProviderPrompt(pi, ctx, "some prompt");

		expect(payload.route_resolution_reason).toBe("classifier_failure");
		expect((ctx.ui as any).notify).toHaveBeenCalledWith(
			expect.stringContaining("classifier output invalid"),
			"warning",
		);
	});

	it("large/high output maps to model and effort in provider payload", async () => {
		const { pi, ctx } = setup();
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("large", "high", 0.9),
			stderr: "",
		});

		const payload = await routeProviderPrompt(
			pi,
			ctx,
			"design a distributed consensus protocol",
		);

		expect(payload.model).toBe("gpt-5.4");
		expect(payload.reasoning_effort).toBe("high");
	});
});

// ---------------------------------------------------------------------------
// /router-explain command (T4)
// ---------------------------------------------------------------------------

describe("router-explain command -- T4", () => {
	it("registers router-explain command", () => {
		const pi = createMockPi();
		promptRouter(pi as any);
		const names = pi._commands.map((c) => c.name);
		expect(names).toContain("router-explain");
	});

	it("shows classifier output, applied route, and rule fired after a valid classification", async () => {
		const pi = createMockPi();
		(pi as any).setModel = vi.fn(async () => {});
		(pi as any).setThinkingLevel = vi.fn();
		promptRouter(pi as any);

		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4" },
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find((m) => m.provider === provider && m.id === id),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.75),
			stderr: "",
		});
		await routeProviderPrompt(pi, ctx, "explain async/await");

		const explainCmd = pi._commands.find((c) => c.name === "router-explain")!;
		(ctx.ui as any).notify.mockClear();
		await explainCmd.handler([], ctx);

		const [notifyArg] = (ctx.ui as any).notify.mock.calls[0];
		expect(notifyArg).toContain("Rule fired:");
		expect(notifyArg).toContain("Applied route:");
		expect(notifyArg).toContain("Current state:");
		expect(notifyArg).toContain("core");
		expect(notifyArg).toContain("3.0.0");
	});

	it("shows null-fallback message when no classification has run", async () => {
		const pi = createMockPi();
		promptRouter(pi as any);
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn() },
		});

		const explainCmd = pi._commands.find((c) => c.name === "router-explain")!;
		await explainCmd.handler([], ctx);

		const [notifyArg] = (ctx.ui as any).notify.mock.calls[0];
		expect(notifyArg).toContain("no classifier output");
	});
});

// ---------------------------------------------------------------------------
// Prompt-router extension -- input hook
// ---------------------------------------------------------------------------

describe("prompt-router extension -- input hook", () => {
	function setup() {
		const pi = createMockPi();
		promptRouter(pi as any);
		const inputHook = pi._getHook("input")[0];
		const ctx = createMockCtx({ shutdown: vi.fn() });
		return { pi, inputHook, ctx };
	}

	it("continues extension-generated input without classification", async () => {
		const { pi, inputHook, ctx } = setup();
		const result = await inputHook.handler(
			{ text: "plan this", source: "extension" },
			ctx,
		);
		expect(result).toEqual({ action: "continue" });
		expect(pi.exec).not.toHaveBeenCalled();
	});

	it("continues slash commands without classification", async () => {
		const { pi, inputHook, ctx } = setup();
		const result = await inputHook.handler(
			{ text: "/router-status", source: "user" },
			ctx,
		);
		expect(result).toEqual({ action: "continue" });
		expect(pi.exec).not.toHaveBeenCalled();
	});

	it("handles plain exit", async () => {
		const { inputHook, ctx } = setup();
		const result = await inputHook.handler(
			{ text: "exit", source: "user" },
			ctx,
		);
		expect(result).toEqual({ action: "handled" });
		expect(ctx.shutdown).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Prompt-router extension -- command registration
// ---------------------------------------------------------------------------

describe("prompt-router extension -- command registration", () => {
	it("registers all five router commands", () => {
		const pi = createMockPi();
		promptRouter(pi as any);

		const names = pi._commands.map((c) => c.name);
		expect(names).toContain("router-status");
		expect(names).toContain("router-reset");
		expect(names).toContain("router-off");
		expect(names).toContain("router-on");
		expect(names).toContain("router-explain");
	});

	it("/router-status shows the resolved current ladder and effort", async () => {
		const pi = createMockPi();
		promptRouter(pi as any);

		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4" },
			modelRegistry: {
				getAvailable: vi.fn(() => [
					{ provider: "openai-codex", id: "gpt-5.4-mini" },
					{ provider: "openai-codex", id: "gpt-5.4-fast" },
					{ provider: "openai-codex", id: "gpt-5.4" },
				]),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		const statusCmd = pi._commands.find((c) => c.name === "router-status")!;
		await statusCmd.handler([], ctx);

		expect((ctx.ui as any).notify).toHaveBeenCalledWith(
			expect.stringContaining("Current model:    openai-codex/gpt-5.4"),
			"info",
		);
		expect((ctx.ui as any).notify).toHaveBeenCalledWith(
			expect.stringContaining("low  ->"),
			"info",
		);
		expect((ctx.ui as any).notify).toHaveBeenCalledWith(
			expect.stringContaining("mid  ->"),
			"info",
		);
		expect((ctx.ui as any).notify).toHaveBeenCalledWith(
			expect.stringContaining("high ->"),
			"info",
		);
		expect((ctx.ui as any).notify).toHaveBeenCalledWith(
			expect.stringContaining("Current effort:   medium"),
			"info",
		);
		const output = (ctx.ui as any).notify.mock.calls[0][0] as string;
		expect(output).not.toContain("Hysteresis:");
		expect(output).not.toContain("Cooldown turns:");
		expect(output).not.toContain("Effort cap:");
		expect(output).not.toContain("Turns at tier:");
	});

	it("/router-reset clears session state", async () => {
		const pi = createMockPi();
		(pi as any).setModel = vi.fn(async () => {});
		(pi as any).setThinkingLevel = vi.fn();
		promptRouter(pi as any);

		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4" },
			modelRegistry: {
				getAvailable: vi.fn(() => [
					{ provider: "openai-codex", id: "gpt-5.4-mini" },
					{ provider: "openai-codex", id: "gpt-5.4-fast" },
					{ provider: "openai-codex", id: "gpt-5.4" },
				]),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		const inputHook = pi._getHook("input")[0];
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("large", "high"),
			stderr: "",
		});
		await inputHook.handler(
			{ text: "design a distributed system", source: "user" },
			ctx,
		);
		await new Promise((r) => setTimeout(r, 0));

		const resetCmd = pi._commands.find((c) => c.name === "router-reset");
		await resetCmd!.handler([], ctx);

		expect((ctx.ui as any).setStatus).toHaveBeenCalledWith(
			"router",
			"router: reset",
		);
		expect((ctx.ui as any).notify).toHaveBeenCalledWith(
			expect.stringContaining("reset"),
			"info",
		);
	});
});

// ---------------------------------------------------------------------------
// Prompt-router extension -- session_start hook
// ---------------------------------------------------------------------------

describe("prompt-router extension -- session_start hook", () => {
	it("registers a session_start hook that sets ready status", async () => {
		const pi = createMockPi();
		promptRouter(pi as any);

		const sessionHooks = pi._getHook("session_start");
		expect(sessionHooks.length).toBeGreaterThan(0);

		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, setStatus: vi.fn() },
		});

		await sessionHooks[0].handler({}, ctx);
		expect((ctx.ui as any).setStatus).toHaveBeenCalledWith(
			"router",
			"router: ready",
		);
	});

	it("sets configured router default thinking when ctx.model is GPT-5.6 Sol", async () => {
		const pi = createMockPi();
		(pi as any).setThinkingLevel = vi.fn();
		promptRouter(pi as any);

		const sessionHooks = pi._getHook("session_start");
		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.6-sol" },
			ui: { ...createMockCtx().ui, setStatus: vi.fn() },
		});

		await sessionHooks[0].handler({}, ctx);

		expect((pi as any).setThinkingLevel).toHaveBeenCalledWith("medium");
		expect((ctx.ui as any).setStatus).toHaveBeenCalledWith(
			"router",
			"router: ready",
		);
	});

	it("registers Ctrl+backtick to reset thinking to the router default", async () => {
		const pi = createMockPi();
		(pi as any).setThinkingLevel = vi.fn();
		promptRouter(pi as any);

		const shortcut = pi._shortcuts.find((s) => s.shortcut === "ctrl+`");
		expect(shortcut).toBeDefined();

		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});
		await shortcut!.handler(ctx);

		expect((pi as any).setThinkingLevel).toHaveBeenCalledWith("medium");
		expect((ctx.ui as any).setStatus).toHaveBeenCalledWith(
			"router",
			"thinking: medium",
		);
	});
});

describe("T3: /router-explain exists", () => {
	it("router-explain command is registered", () => {
		const pi = createMockPi();
		promptRouter(pi as any);
		const names = pi._commands.map((c) => c.name);
		expect(names).toContain("router-explain");
	});
});

// ---------------------------------------------------------------------------
// T5: ship-config regression coverage
// ---------------------------------------------------------------------------

describe("T5: schema_version mismatch falls back", () => {
	it("schema_version 99.0.0 -> null-path, no crash", async () => {
		const pi = createMockPi();
		promptRouter(pi as any);

		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4" },
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find((m) => m.provider === provider && m.id === id),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				schema_version: "99.0.0",
				primary: { model_tier: "core", effort: "medium" },
				candidates: [{ model_tier: "core", effort: "medium", confidence: 0.8 }],
				confidence: 0.8,
			}),
			stderr: "",
		});

		const payload = await routeProviderPrompt(pi, ctx, "a prompt");

		expect(payload.route_resolution_reason).toBe("classifier_failure");
		expect((ctx.ui as any).notify).toHaveBeenCalledWith(
			expect.stringContaining("classifier output invalid"),
			"warning",
		);
	});
});

describe("T5: malformed JSON falls back", () => {
	it("garbage stdout -> null-path, no crash", async () => {
		const pi = createMockPi();
		(pi as any).setModel = vi.fn(async () => {});
		(pi as any).setThinkingLevel = vi.fn();
		promptRouter(pi as any);

		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4" },
			modelRegistry: {
				getAvailable: vi.fn(() => [
					{ provider: "openai-codex", id: "gpt-5.4-mini" },
				]),
				find: vi.fn(() => ({ provider: "openai-codex", id: "gpt-5.4-mini" })),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: "}{ not json at all %%%",
			stderr: "",
		});

		const payload = await routeProviderPrompt(pi, ctx, "trigger garbage");

		expect(payload.route_resolution_reason).toBe("classifier_failure");
	});
});

describe("T5: ConfGate ensemble_rule flows through", () => {
	it("router captures ensemble_rule and /router-explain reports it", async () => {
		const pi = createMockPi();
		(pi as any).setModel = vi.fn(async () => {});
		(pi as any).setThinkingLevel = vi.fn();
		promptRouter(pi as any);

		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4" },
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find((m) => m.provider === provider && m.id === id),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		const confgateJson = JSON.stringify({
			schema_version: "3.0.0",
			primary: { model_tier: "core", effort: "medium" },
			candidates: [{ model_tier: "core", effort: "medium", confidence: 0.82 }],
			confidence: 0.82,
			ensemble_rule: "agree",
		});
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: confgateJson,
			stderr: "",
		});
		await routeProviderPrompt(pi, ctx, "refactor this module");

		const explainCmd = pi._commands.find((c) => c.name === "router-explain")!;
		(ctx.ui as any).notify.mockClear();
		await explainCmd.handler([], ctx);

		const output = (ctx.ui as any).notify.mock.calls[0][0];
		expect(output).toContain("ensemble_rule: agree");
	});

	it("safeParseClassifierOutput captures ensemble_rule when present", () => {
		const raw = JSON.stringify({
			schema_version: "3.0.0",
			primary: { model_tier: "large", effort: "high" },
			candidates: [{ model_tier: "large", effort: "high", confidence: 0.9 }],
			confidence: 0.9,
			ensemble_rule: "lgb-confident",
		});
		const rec = safeParseClassifierOutput(raw);
		expect(rec).not.toBeNull();
		expect(rec!.ensemble_rule).toBe("lgb-confident");
	});
});

describe("T5: /router-explain full decision trail", () => {
	it("includes prompt snippet, classifier JSON, applied route, rule, and current state", async () => {
		const pi = createMockPi();
		(pi as any).setModel = vi.fn(async () => {});
		(pi as any).setThinkingLevel = vi.fn();
		promptRouter(pi as any);

		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4-fast" },
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find((m) => m.provider === provider && m.id === id),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		const promptText =
			"explain how the router policy integrates with confgate classifier output";
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: JSON.stringify({
				schema_version: "3.0.0",
				primary: { model_tier: "core", effort: "medium" },
				candidates: [
					{ model_tier: "mini", effort: "low", confidence: 0.1 },
					{ model_tier: "core", effort: "medium", confidence: 0.82 },
				],
				confidence: 0.82,
				ensemble_rule: "lgb-confident",
			}),
			stderr: "",
		});
		await routeProviderPrompt(pi, ctx, promptText);

		const explainCmd = pi._commands.find((c) => c.name === "router-explain")!;
		(ctx.ui as any).notify.mockClear();
		await explainCmd.handler([], ctx);

		const output = (ctx.ui as any).notify.mock.calls[0][0];

		// (a) classifier raw fields
		expect(output).toContain("schema_version: 3.0.0");
		expect(output).toContain("primary: {model_tier: core, effort: medium}");
		expect(output).toContain("confidence: 0.82");
		expect(output).toContain("canonical_candidates:");
		// (b) applied route
		expect(output).toContain("Applied route: core/medium");
		// (c) rule fired
		expect(output).toContain("Rule fired:");
		// (d) confidence already asserted above
		// (e) current model + current effort
		expect(output).toContain("Current state:");
		expect(output).toContain("model=openai-codex/gpt-5.4-fast");
		expect(output).toContain("effort=medium");
		expect(output).not.toContain("cap=");
		// prompt text is not exposed in the explanation.
		expect(output).toContain('Prompt: "sha256:');
	});
});

describe("Provider architecture spike: awaited provider seam", () => {
	function routeCtx(
		current = { provider: "openai-codex", id: "gpt-5.4-mini" },
	) {
		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		return createMockCtx({
			model: current,
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find((m) => m.provider === provider && m.id === id),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});
	}

	it("awaits classification before provider dispatch and carries one immutable decision id", async () => {
		const pi = createMockPi();
		const order: string[] = ["pre-generation-start"];
		let releaseClassifier!: () => void;
		const classifierPending = new Promise<void>((resolve) => {
			releaseClassifier = resolve;
		});
		(pi.exec as any).mockImplementationOnce(async () => {
			order.push("classifier-start");
			await classifierPending;
			order.push("classifier-finish");
			return {
				code: 0,
				stdout: makeV3Json("core", "medium", 0.91),
				stderr: "",
			};
		});
		const decisionPromise = resolveProviderRouteDecision(
			pi as any,
			"synthetic same turn prompt",
			routeCtx(),
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(order).toEqual(["pre-generation-start", "classifier-start"]);
		releaseClassifier();
		const decision = await decisionPromise;
		order.push("route-resolved");
		const payload = applyRouteDecisionToProviderPayload(
			{ model: "ambient-default", prompt: "synthetic same turn prompt" },
			{ ...decision, same_turn_applied: true },
		) as Record<string, unknown>;
		order.push("dispatch-called");
		order.push("first-token-or-provider-invoked");

		expect(order).toEqual([
			"pre-generation-start",
			"classifier-start",
			"classifier-finish",
			"route-resolved",
			"dispatch-called",
			"first-token-or-provider-invoked",
		]);
		expect(payload.route_decision_id).toBe(decision.route_decision_id);
		expect(payload.model).toBe(decision.model_label);
		expect(payload.reasoning_effort).toBe(decision.thinking_level);
		expect(payload.same_turn_applied).toBe(true);
		expect(decision.route_resolution_reason).toBe("matched");
	});

	it("fails closed on timeout without applying stale previous route", async () => {
		const pi = createMockPi();
		(pi.exec as any).mockImplementationOnce(async () => new Promise(() => {}));
		const decision = await resolveProviderRouteDecision(
			pi as any,
			"synthetic timeout prompt",
			routeCtx(),
			1,
		);
		expect(decision.route_resolution_reason).toBe("classifier_timeout");
		expect(decision.model_label).toBe("gpt-5.4-mini");
		expect(decision.same_turn_applied).toBe(false);
	});

	it("denies implicit cross-provider routing", async () => {
		const pi = createMockPi();
		const ctx = routeCtx({ provider: "anthropic", id: "claude-sonnet" });
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.91),
			stderr: "",
		});
		const decision = await resolveProviderRouteDecision(
			pi as any,
			"synthetic provider boundary",
			ctx,
		);
		expect(decision.route_resolution_reason).toBe("denied_by_policy");
		expect(decision.provider_family).toBe("anthropic");
	});

	it("keeps out-of-order prompt completions correlated by decision id", async () => {
		const pi = createMockPi();
		let releaseFirst!: () => void;
		const firstPending = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		(pi.exec as any)
			.mockImplementationOnce(async () => {
				await firstPending;
				return {
					code: 0,
					stdout: makeV3Json("large", "high", 0.95),
					stderr: "",
				};
			})
			.mockResolvedValueOnce({
				code: 0,
				stdout: makeV3Json("mini", "low", 0.95),
				stderr: "",
			});
		const first = resolveProviderRouteDecision(
			pi as any,
			"synthetic prompt one",
			routeCtx({ provider: "openai-codex", id: "gpt-5.4" }),
		);
		const second = resolveProviderRouteDecision(
			pi as any,
			"synthetic prompt two",
			routeCtx(),
		);
		const secondDecision = await second;
		releaseFirst();
		const firstDecision = await first;
		expect(firstDecision.route_decision_id).not.toBe(
			secondDecision.route_decision_id,
		);
		expect(firstDecision.prompt_hash).not.toBe(secondDecision.prompt_hash);
	});

	it("resolves profile fields from the immutable route decision", async () => {
		const pi = createMockPi();
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.91),
			stderr: "",
		});
		const decision = await resolveProviderRouteDecision(
			pi as any,
			"synthetic resolver prompt",
			routeCtx(),
		);
		const profile = resolveRouteProfile(decision);
		expect(profile.route).toBe("core");
		expect(profile.profile).toBe("codex:core");
		expect(profile.provider).toBe("openai-codex");
		expect(profile.model).toBe(decision.model_label);
		expect(profile.routeState).toBe("available");
		expect(profile.providerTrust).toBe("same-family");
		expect(profile.confidence).toBe(0.91);
		expect(profile.candidates[0].route).toBe("core");
		expect(profile.contextFlags).toEqual([]);
		expect(profile.overrideScope).toBe("none");
	});

	it("rejects classifier nano output without leaking prompt text", async () => {
		const pi = createMockPi();
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("nano", "low", 0.88),
			stderr: "",
		});
		const decision = await resolveProviderRouteDecision(
			pi as any,
			"synthetic nano prompt",
			routeCtx(),
		);
		expect(decision.raw_route).toBe("core");
		expect(decision.applied_route).toBe("core");
		expect(decision.route_resolution_reason).toBe("classifier_failure");
		expect(decision.decisionTrace.routeState).toBe("fallback");
		expect(JSON.stringify(decision)).not.toContain("synthetic nano prompt");
	});

	it("rejects classifier max output as outside the wire schema", async () => {
		const pi = createMockPi();
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("max", "high", 0.93),
			stderr: "",
		});
		const decision = await resolveProviderRouteDecision(
			pi as any,
			"synthetic max prompt",
			routeCtx(),
		);
		expect(decision.raw_route).toBe("core");
		expect(decision.applied_route).toBe("core");
		expect(decision.route_resolution_reason).toBe("classifier_failure");
		expect(["available", "fallback", "policy-only", "disabled"]).toContain(
			decision.decisionTrace.routeState,
		);
	});

	it("builds a deterministic continuation capsule without prompt text", () => {
		const capsule = buildRoutingContextCapsule(
			{
				prompt: "do option 2",
				messages: Array.from({ length: 120 }, () => ({
					role: "user",
					content: "x",
				})),
			},
			{
				model: { contextWindow: 1000 },
				usage: { tokens: 900 },
				router: { previousAppliedRoute: "large" },
			},
		);
		expect(capsule.messageCount).toBe(99);
		expect(capsule.estimatedPromptChars).toBe("do option 2".length);
		expect(capsule.contextPercent).toBe(90);
		expect(capsule.isContinuation).toBe(true);
		expect(capsule.dependencyOnPriorContext).toBe(true);
		expect(capsule.lastEffectiveSize).toBe("large");
		expect(capsule.unresolvedTask).toBe(true);
		expect(capsule.flags).toEqual([
			"multi_turn",
			"context_window_high",
			"continuation_detected",
			"depends_on_prior_context",
			"unresolved_task",
		]);
		expect(JSON.stringify(capsule)).not.toContain("do option 2");
	});

	it("recognizes continuation phrases and rejects non-continuation lookalikes", () => {
		expect(
			buildRoutingContextCapsule(
				{ prompt: "patch it" },
				{ router: { previousAppliedRoute: "core" } },
			).isContinuation,
		).toBe(true);
		expect(
			buildRoutingContextCapsule(
				{ prompt: "same but with auth" },
				{ router: { previousAppliedRoute: "core" } },
			).isContinuation,
		).toBe(true);
		expect(
			buildRoutingContextCapsule(
				{ prompt: "optionally explain auth" },
				{ router: { previousAppliedRoute: "core" } },
			).isContinuation,
		).toBe(false);
		expect(
			buildRoutingContextCapsule(
				{ prompt: "hi" },
				{ router: { previousAppliedRoute: "large" } },
			).dependencyOnPriorContext,
		).toBe(false);
	});

	it("holds a one-turn continuation downgrade from the previous applied route", async () => {
		const pi = createMockPi();
		const ctx = routeCtx();
		(ctx as any).router = { previousAppliedRoute: "large" };
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("mini", "low", 0.95),
			stderr: "",
		});
		const decision = await resolveProviderRouteDecision(
			pi as any,
			"do option 2",
			ctx,
		);
		expect(decision.raw_route).toBe("mini");
		expect(decision.applied_route).toBe("large");
		expect(decision.decisionTrace.contextFlags).toContain(
			"context-continuation-hold",
		);
		expect(decision.fallback_reason).toBe("one-turn context-continuation-hold");
	});

	it("allows unrelated and cheap continuation downgrades", async () => {
		const pi = createMockPi();
		const unrelatedCtx = routeCtx();
		(unrelatedCtx as any).router = { previousAppliedRoute: "large" };
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("mini", "low", 0.95),
			stderr: "",
		});
		const unrelated = await resolveProviderRouteDecision(
			pi as any,
			"hi",
			unrelatedCtx,
		);
		expect(unrelated.applied_route).toBe("mini");
		expect(unrelated.decisionTrace.contextFlags).not.toContain(
			"context-continuation-hold",
		);

		const cheapCtx = routeCtx();
		(cheapCtx as any).router = { previousAppliedRoute: "large" };
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("mini", "low", 0.95),
			stderr: "",
		});
		const cheap = await resolveProviderRouteDecision(
			pi as any,
			"briefly do option 2",
			cheapCtx,
		);
		expect(cheap.applied_route).toBe("mini");
		expect(cheap.decisionTrace.contextFlags).toContain(
			"downgrade_intent_detected",
		);
		expect(cheap.decisionTrace.contextFlags).toContain(
			"context-continuation-hold-bypassed",
		);
	});

	it("applies route pin before session override and records override scope/lifetime", async () => {
		const pi = createMockPi();
		const ctx = routeCtx();
		(ctx as any).router = { routeOverride: "mini", routePin: "large" };
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.91),
			stderr: "",
		});
		const decision = await resolveProviderRouteDecision(
			pi as any,
			"synthetic override prompt",
			ctx,
		);
		expect(decision.raw_route).toBe("core");
		expect(decision.applied_route).toBe("large");
		expect(decision.decisionTrace.overrideScope).toBe("route-pin");
		expect(decision.decisionTrace.overrideLifetime).toBe("until-cleared");
		expect(decision.decisionTrace.rule).toBe("override:route-pin");
	});

	it("preserves explicit user-selected model in provider payload", async () => {
		const pi = createMockPi();
		const ctx = routeCtx();
		(ctx as any).router = { explicitModelSelection: true };
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.91),
			stderr: "",
		});
		const decision = await resolveProviderRouteDecision(
			pi as any,
			"synthetic explicit model prompt",
			ctx,
		);
		expect(decision.decisionTrace.explicitModelPreserved).toBe(true);
		const payload = applyRouteDecisionToProviderPayload(
			{
				prompt: "synthetic explicit model prompt",
				model: "user/chosen",
				explicit_model_selection: true,
			},
			decision,
			ctx,
		) as Record<string, unknown>;
		expect(payload.model).toBe("user/chosen");
		expect(payload.explicit_model_preserved).toBe(true);
	});

	it("uses provider payload messages for context metadata without storing text", async () => {
		const pi = createMockPi();
		const prompt = "final user task";
		const messages = [
			...Array.from({ length: 8 }, () => ({ role: "user", content: "prior" })),
			{ role: "user", content: prompt },
		];
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.91),
			stderr: "",
		});

		const decision = await resolveProviderRouteDecision(
			pi as any,
			prompt,
			routeCtx(),
			undefined,
			{ messages },
		);

		expect(decision.decisionTrace.contextCapsule?.messageCount).toBe(9);
		expect(decision.decisionTrace.contextCapsule?.estimatedPromptChars).toBe(
			prompt.length,
		);
		expect(decision.decisionTrace.contextFlags).toContain("multi_turn");
		expect(JSON.stringify(decision)).not.toContain(prompt);
	});

	it("applies request route overrides from the provider payload", async () => {
		const pi = createMockPi();
		promptRouter(pi as any);
		const ctx = routeCtx();
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.91),
			stderr: "",
		});

		const payload = await routeProviderPrompt(
			pi,
			ctx,
			"synthetic request override prompt",
			{ router_route_override: "large" },
		);

		expect(payload.model).toBe("gpt-5.4");
		expect(payload.route_resolution_reason).toBe("fallback_used");
	});

	it("reports provider trust and denied fallback metadata", async () => {
		const pi = createMockPi();
		const ctx = routeCtx({ provider: "anthropic", id: "claude-sonnet" });
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.91),
			stderr: "",
		});
		const decision = await resolveProviderRouteDecision(
			pi as any,
			"synthetic provider trust prompt",
			ctx,
		);
		expect(decision.route_resolution_reason).toBe("denied_by_policy");
		expect(decision.decisionTrace.providerTrust).toBe("cross-provider-denied");
		expect(decision.decisionTrace.fallbackAllowed).toBe(false);
		expect(decision.decisionTrace.fallbackDeniedReason).toBe(
			"cross-provider fallback denied",
		);
		expect(JSON.stringify(decision)).not.toContain(
			"synthetic provider trust prompt",
		);
	});

	it("raises low routes when context-window safety is high", async () => {
		const pi = createMockPi();
		const ctx = routeCtx({
			provider: "openai-codex",
			id: "gpt-5.4-mini",
			contextWindow: 1000,
		} as any);
		(ctx as any).usage = { tokens: 950 };
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("mini", "low", 0.95),
			stderr: "",
		});
		const decision = await resolveProviderRouteDecision(
			pi as any,
			"synthetic context safety prompt",
			ctx,
		);
		expect(decision.raw_route).toBe("mini");
		expect(decision.applied_route).toBe("core");
		expect(decision.decisionTrace.contextFlags).toContain(
			"context_window_high",
		);
		expect(decision.decisionTrace.contextFlags).toContain(
			"context_window_floor",
		);
	});
});

describe("T0: same-turn routing feasibility", () => {
	it("classifies only at the provider request seam", async () => {
		const pi = createMockPi();
		const order: string[] = [];
		let releaseClassifier!: () => void;
		const classifierPending = new Promise<void>((resolve) => {
			releaseClassifier = resolve;
		});

		(pi.exec as any).mockImplementationOnce(async () => {
			order.push("classifier-start");
			await classifierPending;
			order.push("classifier-finish");
			return {
				code: 0,
				stdout: makeV3Json("core", "medium", 0.91),
				stderr: "",
			};
		});

		promptRouter(pi as any);
		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4-mini" },
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find((m) => m.provider === provider && m.id === id),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});

		const inputHook = pi._getHook("input")[0];
		const result = await inputHook.handler(
			{ text: "synthetic prompt requiring broader reasoning", source: "user" },
			ctx,
		);
		order.push("hook-returned-continue");

		expect(result).toEqual({ action: "continue" });
		expect(order).toEqual(["hook-returned-continue"]);

		const routed = routeProviderPrompt(
			pi,
			ctx,
			"synthetic prompt requiring broader reasoning",
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(order).toEqual(["hook-returned-continue", "classifier-start"]);

		releaseClassifier();
		const payload = await routed;
		expect(payload.model).toBe("gpt-5.4-fast");
		expect(order).toEqual([
			"hook-returned-continue",
			"classifier-start",
			"classifier-finish",
		]);
	});

	it("emits same-turn routing telemetry with applied model and effort fields", async () => {
		const pi = createMockPi();
		promptRouter(pi as any);
		const availableModels = [
			{ provider: "openai-codex", id: "gpt-5.4-mini" },
			{ provider: "openai-codex", id: "gpt-5.4-fast" },
			{ provider: "openai-codex", id: "gpt-5.4" },
		];
		const ctx = createMockCtx({
			model: { provider: "openai-codex", id: "gpt-5.4-mini" },
			modelRegistry: {
				getAvailable: vi.fn(() => availableModels),
				find: vi.fn((provider: string, id: string) =>
					availableModels.find((m) => m.provider === provider && m.id === id),
				),
			},
			ui: { ...createMockCtx().ui, setStatus: vi.fn(), notify: vi.fn() },
		});
		(pi.exec as any).mockResolvedValueOnce({
			code: 0,
			stdout: makeV3Json("core", "medium", 0.91),
			stderr: "",
		});

		await routeProviderPrompt(pi, ctx, "synthetic telemetry prompt");

		const routingCalls = vi
			.mocked(transcriptEmit)
			.mock.calls.filter(
				([envelope]) => envelope.event_type === "routing_decision",
			);
		expect(routingCalls).toHaveLength(1);
		const payload = routingCalls[0]?.[1] as Record<string, unknown>;
		expect(payload.selected_model_size).toBe("medium");
		expect(payload.actual_model).toEqual({
			provider: "openai-codex",
			id: "gpt-5.4-fast",
			name: "gpt-5.4-fast",
		});
		expect(payload.model_switch_applied).toBe(true);
		expect(payload.final_applied_route).toEqual({
			model_tier: "core",
			effort: "medium",
		});
		expect(payload.override_type).toBe("none");
	});
});

describe("T6: privacy-conscious router telemetry", () => {
	it("serializes schema-versioned routing telemetry without raw prompt text", () => {
		const privatePrompt = [
			"PRIVATE",
			"ROUTER",
			"PROMPT",
			"DO",
			"NOT",
			"LOG",
		].join("_");
		const payload = buildRouterTelemetryPayload({
			promptHash: "a".repeat(64),
			classifierMode: "t2",
			rawRoute: "large",
			appliedRoute: "core",
			rec: {
				schema_version: "3.0.0",
				primary: { model_tier: "large", effort: "high" },
				candidates: [
					{ model_tier: "large", effort: "high", confidence: 0.7 },
					{ model_tier: "core", effort: "medium", confidence: 0.55 },
				],
				confidence: 0.7,
			},
			previousRoute: "core",
			ruleFired: "context-continuation-hold",
			contextCapsule: {
				isContinuation: true,
				dependencyOnPriorContext: true,
				lastEffectiveSize: "core",
				unresolvedTask: true,
				downgradeIntentDetected: false,
				messageCount: 2,
				contextPercent: null,
				flags: ["continuation_detected"],
			},
			providerFamily: "openai-codex",
			modelLabel: "gpt-5.4",
			profile: "codex-large",
			latencyMs: 12,
			fallbackReason: "one-turn context-continuation-hold",
		});
		const serialized = JSON.stringify(payload);

		expect(payload.schema_version).toBe("router-log-v1");
		expect(payload.prompt_hash).toMatch(/^[a-f0-9]{64}$/);
		expect(payload.prompt_excerpt).toBeNull();
		expect(payload.raw_route).toBe("large");
		expect(payload.applied_route).toBe("core");
		expect(payload.candidate_margin).toBe(0.15);
		expect(payload.context_capsule).toMatchObject({
			isContinuation: true,
			dependencyOnPriorContext: true,
			lastEffectiveSize: "core",
			unresolvedTask: true,
		});
		expect(payload.provider_family).toBe("openai-codex");
		expect(payload.model_label).toBe("gpt-5.4");
		expect(payload.profile).toBe("codex-large");
		expect(payload.latency_ms).toBe(12);
		expect(serialized).not.toContain(privatePrompt);
		expect(serialized).not.toContain("prompt_text");
		expect(serialized).not.toContain("raw_prompt");
	});
});
