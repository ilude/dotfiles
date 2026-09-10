import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { accountBedrockMessage, bedrockSessionReference } from "../../lib/bedrock/accounting.js";
import { createBedrockModelProvider, resolveBedrockMantleTarget } from "../../lib/bedrock/provider.js";
import { callerArgs, dashboardArgs, parseCaller, parseQueryId, parseResults, queryArgs, resultsArgs } from "../../lib/bedrock/cloudwatch-snapshot.js";
import { createBaseline, formatStatus, formatUsage, readBaseline, summarize } from "../../lib/bedrock/ledger.js";

export default function bedrock(pi: ExtensionAPI): void {
	pi.registerProvider(createBedrockModelProvider());
	const refreshStatus = async (ctx: any) => {
		try { ctx.ui.setStatus("bedrock", formatStatus(await summarize())); }
		catch { ctx.ui.setStatus("bedrock", "bedrock: estimate unavailable"); }
	};
	pi.on("session_start", async (_event, ctx) => refreshStatus(ctx));
	pi.on("message_end", async (event, ctx) => {
		const result = await accountBedrockMessage(event.message, bedrockSessionReference(ctx), () => ctx.ui.setStatus("bedrock", "bedrock: estimate incomplete"));
		if (!result) return;
		if (result.persisted) await refreshStatus(ctx);
		return { message: result.message };
	});
	// Child/provider processes append to the shared ledger after their own tool
	// work. Refresh once the parent turn settles so the footer sees those writes.
	pi.on("agent_settled", async (_event, ctx) => refreshStatus(ctx));
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
				const capturedAt = new Date().toISOString();
				const identity = await pi.exec("aws", callerArgs(target.profile), { timeout: 30_000 });
				if (identity.code !== 0) throw new Error(`AWS caller lookup failed: ${(identity.stderr || identity.stdout || `exit ${identity.code}`).trim()}`);
				const principal = parseCaller(identity.stdout);
				const dashboard = await pi.exec("aws", dashboardArgs(target.profile), { timeout: 30_000 });
				if (dashboard.code !== 0) throw new Error(`CloudWatch dashboard lookup failed: ${(dashboard.stderr || dashboard.stdout || `exit ${dashboard.code}`).trim()}`);
				const started = await pi.exec("aws", queryArgs(dashboard.stdout, principal, new Date(capturedAt), target.profile), { timeout: 30_000 });
				if (started.code !== 0) throw new Error(`CloudWatch Logs query failed to start: ${(started.stderr || started.stdout || `exit ${started.code}`).trim()}`);
				const queryId = parseQueryId(started.stdout);
				let baseline;
				for (let attempt = 0; attempt < 20 && !baseline; attempt++) {
					const result = await pi.exec("aws", resultsArgs(queryId, target.profile), { timeout: 30_000 });
					if (result.code !== 0) throw new Error(`CloudWatch Logs query failed: ${(result.stderr || result.stdout || `exit ${result.code}`).trim()}`);
					const parsed = parseResults(result.stdout, principal, capturedAt); baseline = parsed.baseline;
					if (parsed.pending) await new Promise(resolve => setTimeout(resolve, 500));
				}
				if (!baseline) throw new Error("CloudWatch Logs query timed out");
				if (!await createBaseline(baseline)) throw new Error("AWS Bedrock baseline already exists; refusing to replace its accounting cutoff");
				await refreshStatus(ctx);
			}

			const models = ctx.modelRegistry.getAll().filter((model: any) => model.provider === "bedrock-mantle");
			const report = [`Amazon Bedrock`, `Mantle region: ${target.region}`, `Mantle profile: ${target.profile || "default credential chain"}`, `Runtime region: provider-scoped AWS region (fallback us-east-2)`, `Routes:`, ...models.map((model: any) => `  ${model.id} (${model.api})`), "", formatUsage(await summarize())].join("\n");
			ctx.ui.notify(report, "info");
		},
	});
}
