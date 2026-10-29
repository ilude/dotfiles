import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { accountBedrockMessage, bedrockSessionReference } from "../../lib/bedrock/accounting.js";
import { createBedrockModelProvider, resolveBedrockMantleTarget } from "../../lib/bedrock/provider.js";
import { summarizeBilling, formatBillingUsage } from "../../lib/bedrock/billing.js";
import { writeCurSnapshot } from "../../lib/bedrock/cur-snapshot.js";
import { queryPersonalCur } from "../../lib/bedrock/cur-query.js";
import { registerProfileCommand } from "../../lib/profile-command.ts";

export const CUR_REFRESH_INTERVAL = 15 * 60_000;

export default function bedrock(pi: ExtensionAPI): void {
	pi.registerProvider(createBedrockModelProvider());
	let timer: ReturnType<typeof setInterval> | undefined;
	let controller: AbortController | undefined;
	let inFlight: Promise<void> | undefined;
	let activeContext: any;
	let generation = 0;
	const refreshStatus = async (_ctx: any) => {
		const epoch = generation;
		try {
			const { total } = await summarizeBilling();
			if (activeContext && epoch === generation) activeContext.ui.setStatus("bedrock", `bedrock: $${total.toFixed(2)}`);
		} catch { if (activeContext && epoch === generation) activeContext.ui.setStatus("bedrock", "bedrock: unavailable"); }
	};
	const refreshCur = (ctx: any): Promise<void> => {
		if (inFlight) return inFlight;
		const request = new AbortController();
		const epoch = generation;
		controller = request;
		inFlight = (async () => {
			const snapshot = await queryPersonalCur((...args) => pi.exec(...args), resolveBedrockMantleTarget().profile, request.signal);
			if (request.signal.aborted || !activeContext || epoch !== generation) return;
			await writeCurSnapshot(snapshot);
			await refreshStatus(ctx);
		})().finally(() => { inFlight = undefined; if (controller === request) controller = undefined; });
		return inFlight;
	};
	const refreshInBackground = (ctx: any) => {
		// Failure retains the successful persisted baseline and all later local usage.
		void refreshCur(ctx).catch(() => {});
	};
	pi.on("session_start", async (_event, ctx) => {
		activeContext = ctx;
		generation++;
		if (timer) clearInterval(timer);
		await refreshStatus(ctx);
		refreshInBackground(ctx);
		timer = setInterval(() => refreshInBackground(ctx), CUR_REFRESH_INTERVAL);
		timer.unref?.();
	});
	pi.on("session_shutdown", async () => {
		activeContext = undefined;
		generation++;
		if (timer) clearInterval(timer);
		timer = undefined;
		controller?.abort();
		await inFlight?.catch(() => {});
	});
	pi.on("message_end", async (event, ctx) => {
		const result = await accountBedrockMessage(event.message, bedrockSessionReference(ctx), () => ctx.ui.setStatus("bedrock", "bedrock: estimate incomplete"));
		if (!result) return;
		if (result.persisted) await refreshStatus(ctx);
		return { message: result.message };
	});
	// Accounting-only children have no network refresh or timers. Parent settlement
	// picks up their writes to the shared profile ledger.
	pi.on("agent_settled", async (_event, ctx) => refreshStatus(ctx));
	registerProfileCommand(pi, "bedrock", {
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
				ctx.ui.notify("Refreshing personal Bedrock billing…", "info");
				await refreshCur(ctx);
			}
			const models = ctx.modelRegistry.getAll().filter((model: any) => model.provider === "bedrock-mantle");
			const report = ["Amazon Bedrock", `Mantle region: ${target.region}`, `Mantle profile: ${target.profile || "default credential chain"}`, "Runtime region: provider-scoped AWS region (fallback us-east-2)", "Routes:", ...models.map((model: any) => `  ${model.id} (${model.api})`), "", await formatBillingUsage()].join("\n");
			ctx.ui.notify(report, "info");
		},
	});
}
