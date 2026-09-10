import { appendRecord, makeRecord, type UsageRecord } from "./ledger.js";
import { resolveBedrockMantleTarget } from "./provider.js";

const PROVIDERS = new Set(["amazon-bedrock", "bedrock-mantle"]);

export interface BedrockAccountingResult {
	record: UsageRecord;
	message: any;
	persisted: boolean;
}

export function isBedrockAssistantMessage(message: any): boolean {
	return message?.role === "assistant" && PROVIDERS.has(message.provider) && !!message.usage;
}

export function bedrockSessionReference(ctx: any): string | undefined {
	return ctx?.sessionManager?.getSessionFile?.() || ctx?.sessionManager?.getSessionId?.();
}

function annotate(message: any, record: UsageRecord): any {
	if (record.pricing.status === "estimated" && record.pricing.components) {
		return {
			...message,
			bedrockPricing: { status: "estimated", basis: record.pricing.basis },
			usage: { ...message.usage, cost: { ...record.pricing.components, total: record.pricing.total } },
		};
	}
	return { ...message, bedrockPricing: { status: "unpriced", basis: record.pricing.basis, reason: record.pricing.reason } };
}

/** Account a finalized response without requiring an operator/status surface. */
export async function accountBedrockMessage(message: any, session?: string, onError?: () => void): Promise<BedrockAccountingResult | undefined> {
	if (!isBedrockAssistantMessage(message)) return undefined;
	const target = message.responseModel || (message.provider === "amazon-bedrock" ? message.model : undefined);
	const record = makeRecord({
		timestamp: message.timestamp,
		session,
		provider: message.provider,
		model: message.model,
		target,
		transport: message.provider === "amazon-bedrock" ? "runtime" : target?.startsWith("openai.") ? "mantle-openai" : "mantle-anthropic",
		region: message.provider === "bedrock-mantle" ? resolveBedrockMantleTarget().region : undefined,
		usage: message.usage,
	});
	let persisted = true;
	try {
		await appendRecord(record);
	} catch {
		persisted = false;
		onError?.();
	}
	return { record, message: annotate(message, record), persisted };
}
