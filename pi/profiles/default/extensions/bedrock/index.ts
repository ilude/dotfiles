import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBedrockModelProvider, resolveBedrockMantleTarget } from "../../lib/bedrock/provider.js";
import { costExplorerQuery, costExplorerServiceQuery, parseBedrockServices, parseCostExplorerBaseline } from "../../lib/bedrock/cost-explorer.js";
import { appendRecord, formatStatus, formatUsage, makeRecord, readBaseline, summarize, writeBaseline } from "../../lib/bedrock/ledger.js";

const PROVIDERS = new Set(["amazon-bedrock", "bedrock-mantle"]);

export default function bedrock(pi: ExtensionAPI): void {
	pi.registerProvider(createBedrockModelProvider());
	const refreshStatus = async (ctx: any) => {
		try { ctx.ui.setStatus("bedrock", formatStatus(await summarize())); }
		catch { ctx.ui.setStatus("bedrock", "bedrock: estimate unavailable"); }
	};
	pi.on("session_start", async (_event, ctx) => refreshStatus(ctx));
	pi.on("message_end", async (event, ctx) => {
		const message: any = event.message;
		if (message.role !== "assistant" || !PROVIDERS.has(message.provider) || !message.usage) return;
		const target = message.responseModel || (message.provider === "amazon-bedrock" ? message.model : undefined);
		const record = makeRecord({ timestamp: message.timestamp, session: ctx.sessionManager.getSessionFile?.() || ctx.sessionManager.getSessionId?.(), provider: message.provider, model: message.model, target, transport: message.provider === "amazon-bedrock" ? "runtime" : target?.startsWith("openai.") ? "mantle-openai" : "mantle-anthropic", region: message.provider === "bedrock-mantle" ? resolveBedrockMantleTarget().region : undefined, usage: message.usage });
		try { await appendRecord(record); await refreshStatus(ctx); } catch { ctx.ui.setStatus("bedrock", "bedrock: estimate incomplete"); }
		if (record.pricing.status === "estimated" && record.pricing.components) return { message: { ...message, bedrockPricing: { status: "estimated", basis: record.pricing.basis }, usage: { ...message.usage, cost: { ...record.pricing.components, total: record.pricing.total } } } };
		return { message: { ...message, bedrockPricing: { status: "unpriced", basis: record.pricing.basis, reason: record.pricing.reason } } };
	});
	pi.registerCommand("bedrock", {
		description: "Inspect, refresh, or reconcile the consolidated Amazon Bedrock integration",
		handler: async (args, ctx) => {
			const command = args.trim();
			if (command && command !== "refresh" && command !== "reconcile") throw new Error("Usage: /bedrock [refresh|reconcile]");
			const target = resolveBedrockMantleTarget();
			if (command === "refresh") {
				const result = await ctx.modelRegistry.refresh({ providers: ["bedrock-mantle"], allowNetwork: true, force: true });
				if (result.errors.size) throw [...result.errors.values()][0];
			}
			if (command === "reconcile") {
				const existing = await readBaseline();
				if (existing) throw new Error(`AWS Bedrock baseline already exists for ${existing.month}; refusing to replace its accounting cutoff`);
				const now = new Date();
				const discovery = costExplorerServiceQuery(now, target.profile);
				const discovered = await pi.exec("aws", discovery.args, { timeout: 30_000 });
				if (discovered.code !== 0) throw new Error(`AWS Cost Explorer service discovery failed: ${(discovered.stderr || discovered.stdout || `exit ${discovered.code}`).trim()}`);
				const query = costExplorerQuery(parseBedrockServices(discovered.stdout), now, target.profile);
				const result = await pi.exec("aws", query.args, { timeout: 30_000 });
				if (result.code !== 0) throw new Error(`AWS Cost Explorer query failed: ${(result.stderr || result.stdout || `exit ${result.code}`).trim()}`);
				await writeBaseline(parseCostExplorerBaseline(result.stdout, query));
				await refreshStatus(ctx);
			}

			const models = ctx.modelRegistry.getAll().filter((model: any) => model.provider === "bedrock-mantle");
			const report = [`Amazon Bedrock`, `Mantle region: ${target.region}`, `Mantle profile: ${target.profile || "default credential chain"}`, `Runtime region: provider-scoped AWS region (fallback us-east-2)`, `Routes:`, ...models.map((model: any) => `  ${model.id} (${model.api})`), "", formatUsage(await summarize())].join("\n");
			ctx.ui.notify(report, "info");
		},
	});
}
