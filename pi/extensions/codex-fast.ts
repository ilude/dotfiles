import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { wrapCommandRegistration } from "../lib/slash-command-echo.js";

type ProviderPayload = Record<string, unknown>;

const STATUS_KEY = "codex-fast";
const FAST_SERVICE_TIER = "priority";

let enabled = false;

function statusText(ctx: ExtensionContext, pi: ExtensionAPI): string {
	const modelId = ctx.model?.id ?? "codex";
	const thinkingLevel = pi.getThinkingLevel();
	return `${modelId}[${thinkingLevel}][fast]`;
}

function refreshStatus(ctx: ExtensionContext, pi: ExtensionAPI): void {
	ctx.ui.setStatus(STATUS_KEY, enabled ? statusText(ctx, pi) : "");
}

function canPatchPayload(payload: unknown): payload is ProviderPayload {
	return (
		payload !== null && typeof payload === "object" && !Array.isArray(payload)
	);
}

export default function (pi: ExtensionAPI) {
	wrapCommandRegistration(pi);
	pi.on("session_start", (_event, ctx) => {
		enabled = false;
		refreshStatus(ctx, pi);
	});

	pi.on("model_select", (_event, ctx) => {
		refreshStatus(ctx, pi);
	});

	pi.on("thinking_level_select", (_event, ctx) => {
		refreshStatus(ctx, pi);
	});

	pi.registerCommand("fast", {
		description: "Toggle Codex subscription fast mode",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			refreshStatus(ctx, pi);
			ctx.ui.notify(
				`Codex fast mode ${enabled ? "enabled" : "disabled"}`,
				"info",
			);
		},
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!enabled) return;
		if (ctx.model?.provider !== "openai-codex") return;
		if (!canPatchPayload(event.payload)) return;
		return {
			...event.payload,
			service_tier: FAST_SERVICE_TIER,
		};
	});
}
