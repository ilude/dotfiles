import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Usage } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	type BedrockMonthSummary,
	getCurrentBedrockMonthSummary,
	recordBedrockUsage,
} from "../lib/bedrock-cost-ledger.js";

const STATUS_KEY = "bedrock";
type BedrockProvider = "amazon-bedrock" | "bedrock-mantle";
const BEDROCK_PROVIDERS = new Set<BedrockProvider>([
	"amazon-bedrock",
	"bedrock-mantle",
]);

function isBedrockProvider(provider: string): provider is BedrockProvider {
	return BEDROCK_PROVIDERS.has(provider as BedrockProvider);
}

export function formatBedrockStatus(
	summary: Pick<BedrockMonthSummary, "costTotal" | "unpricedRequestCount">,
): string {
	const prefix = summary.unpricedRequestCount > 0 ? "bedrock >=" : "bedrock";
	const cost = Number.isFinite(summary.costTotal) ? summary.costTotal : 0;
	return `${prefix} $${cost.toFixed(2)}`;
}

export function shouldRecordBedrockMessage(
	message: AgentMessage,
): message is AgentMessage & {
	role: "assistant";
	provider: BedrockProvider;
	model: string;
	usage: Usage;
} {
	return (
		message.role === "assistant" &&
		isBedrockProvider(message.provider) &&
		typeof message.model === "string" &&
		message.model.length > 0 &&
		isUsage(message.usage)
	);
}

function isBedrockAvailable(ctx: ExtensionContext): boolean {
	return ctx.modelRegistry
		.getAvailable()
		.some((model) => isBedrockProvider(model.provider));
}

async function refreshStatus(ctx: ExtensionContext): Promise<void> {
	if (!isBedrockAvailable(ctx)) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	const summary = await getCurrentBedrockMonthSummary();
	ctx.ui.setStatus(STATUS_KEY, formatBedrockStatus(summary));
}

function showLedgerError(ctx: ExtensionContext, error: unknown): void {
	ctx.ui.setStatus(STATUS_KEY, "bedrock error");
	if (ctx.hasUI) {
		ctx.ui.notify(
			`Bedrock cost ledger failed: ${errorMessage(error)}`,
			"warning",
		);
	}
}

function isUsage(value: unknown): value is Usage {
	return value !== null && typeof value === "object";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export default function registerBedrockCostExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		try {
			await refreshStatus(ctx);
		} catch (error) {
			showLedgerError(ctx, error);
		}
	});

	pi.on("message_end", async (event, ctx) => {
		if (!shouldRecordBedrockMessage(event.message)) return;

		try {
			await recordBedrockUsage({
				provider: event.message.provider,
				model: event.message.model,
				usage: event.message.usage,
			});
			await refreshStatus(ctx);
		} catch (error) {
			showLedgerError(ctx, error);
		}
	});
}
