import type { AssistantMessage } from "@earendil-works/pi-ai";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { accountBedrockMessage, bedrockSessionReference } from "./accounting.js";
import { notifyGoalAccounting } from "./goal-notification.ts";

export type HelperAccountingContext = Partial<Pick<ExtensionContext, "sessionManager">>;
export type HelperAccountingAPI = Pick<ExtensionAPI, "events">;

/** Bind usage to the originating session, not whichever session is active later. */
export function helperResponseAccounting(ctx: HelperAccountingContext, pi?: HelperAccountingAPI): (message: AssistantMessage) => Promise<void> {
	const session = bedrockSessionReference(ctx);
	return async message => {
		const result = await accountBedrockMessage(message, session);
		if (result && pi) await notifyGoalAccounting(pi, result);
	};
}

/** Observe the completion itself, including an errored/aborted response arriving
 * after the caller's deadline race has already returned. */
export async function accountHelperCompletion(completion: Promise<AssistantMessage>, account: (message: AssistantMessage) => Promise<void>): Promise<AssistantMessage> {
	const response = await completion;
	await account(response);
	return response;
}

/** Native compaction consumes result(); Agent consumes terminal stream events.
 * Fence both paths on the same accounting promise, once per provider response.
 * Never account aggregate compaction/tool usage a second time. */
export function accountHelperStream(source: AssistantMessageEventStream, account: (message: AssistantMessage) => Promise<void>): AssistantMessageEventStream {
	let accounting: Promise<void> | undefined;
	const finalize = async (message: AssistantMessage): Promise<AssistantMessage> => {
		accounting ??= account(message);
		await accounting;
		return message;
	};
	return new class extends AssistantMessageEventStream {
		override async result(): Promise<AssistantMessage> {
			return finalize(await source.result());
		}
		override async *[Symbol.asyncIterator]() {
			for await (const event of source) {
				if (event.type === "done") await finalize(event.message);
				else if (event.type === "error") await finalize(event.error);
				yield event;
			}
		}
	}();
}
