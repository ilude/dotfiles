import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { BedrockAccountingResult } from "./accounting.js";
import type { GoalAccountingEvent } from "../goal/usage.ts";

/** Await transport listeners so the next goal admission cannot overtake accounting.
 * Normal ledger accounting does not depend on a goal run being active. */
export async function notifyGoalAccounting(pi: Pick<ExtensionAPI, "events">, result: BedrockAccountingResult): Promise<void> {
	const session = result.record.session;
	if (!session || !pi.events) return;
	let runId: string | undefined;
	pi.events.emit("goal-run-id", { session, respond: (value: string) => { runId = value; } });
	if (!runId) return;
	const event: GoalAccountingEvent & { pending: Promise<void>[] } = {
		type: "goal-accounting", runId, session, recordId: result.record.id,
		timestamp: Date.parse(result.record.timestamp), persisted: result.persisted, pending: [],
	};
	pi.events.emit("goal-accounting", event);
	await Promise.all(event.pending);
}
