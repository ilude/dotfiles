import { realpathSync } from "node:fs";
import { resolve } from "node:path";

export type DeliveryOrigin = {
	readonly parentSessionId: string;
	readonly parentWorkspaceId: string;
};

export type DeliveryReceipt =
	| {
			readonly status: "inserted";
			readonly deliveryId: string;
			readonly sessionId: string;
			readonly entryId: string;
		}
	| {
			readonly status: "discarded";
			readonly deliveryId: string;
			readonly sessionId: string;
			readonly reason:
				| "queue_cleared"
				| "aborted"
				| "session_replaced"
				| "quit";
		}
	| {
			readonly status: "rejected";
			readonly deliveryId: string;
			readonly sessionId: string;
			readonly reason: "preflight_failed" | "session_mismatch";
			readonly error: unknown;
		}
	| {
			readonly status: "uncertain";
			readonly deliveryId: string;
			readonly sessionId: string;
			readonly error: unknown;
		};

export type DeliveryPhase =
	| "pending"
	| "in-flight"
	| "inserted"
	| "discarded"
	| "rejected"
	| "uncertain"
	| "consumed";

export type DeliveryRetryGate = "none" | "interactive" | "session-start" | "held";

export interface DeliveryState {
	readonly phase: DeliveryPhase;
	readonly retryGate: DeliveryRetryGate;
	readonly failureReported: boolean;
}

export interface ReceiptDeliverySender {
	(message: unknown, options: {
		readonly deliveryId: string;
		readonly sessionId: string;
		readonly triggerTurn?: boolean;
		readonly deliverAs?: "steer" | "followUp" | "nextTurn";
	}): Promise<DeliveryReceipt>;
}

interface ReceiptCapableAPI {
	sendMessageWithReceipt?: ReceiptDeliverySender;
}

export function canonicalizeDeliveryWorkspace(value: string): string {
	const absolute = resolve(value);
	let canonical: string;
	try {
		canonical = realpathSync.native(absolute);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Delivery workspace cannot be resolved because it does not exist or is inaccessible: ${absolute}: ${detail}`,
		);
	}
	return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

export function captureDeliveryOrigin(input: {
	readonly cwd: string;
	readonly sessionId: string | undefined;
}): DeliveryOrigin {
	const parentSessionId = input.sessionId?.trim();
	if (!parentSessionId)
		throw new Error("Background completion delivery requires a parent session ID.");
	if (!input.cwd.trim())
		throw new Error("Background completion delivery requires a parent cwd.");
	return {
		parentSessionId,
		parentWorkspaceId: canonicalizeDeliveryWorkspace(input.cwd),
	};
}

export function deliveryId(kind: "subagent" | "background-terminal", id: string): string {
	return `${kind}:${id}`;
}

export function deliveryOriginMatches(
	origin: DeliveryOrigin,
	current: DeliveryOrigin,
): boolean {
	// Origins are captured by real filesystem identity once. Comparing retained
	// records must not depend on a later filesystem change or path casing.
	const normalize = (workspace: string): string => {
		const absolute = resolve(workspace);
		return process.platform === "win32" ? absolute.toLowerCase() : absolute;
	};
	return origin.parentSessionId === current.parentSessionId &&
		normalize(origin.parentWorkspaceId) === normalize(current.parentWorkspaceId);
}

export function requireReceiptDelivery(
	api: unknown,
): ReceiptDeliverySender {
	const candidate = api as ReceiptCapableAPI;
	if (typeof candidate.sendMessageWithReceipt !== "function")
		throw new Error(
			"Acknowledged background completion delivery is unavailable in this Pi SDK; refusing to start background work.",
		);
	return candidate.sendMessageWithReceipt.bind(api);
}

function isReceipt(value: unknown): value is DeliveryReceipt {
	if (!value || typeof value !== "object") return false;
	const candidate = value as {
		status?: unknown;
		deliveryId?: unknown;
		sessionId?: unknown;
		reason?: unknown;
		entryId?: unknown;
	};
	if (typeof candidate.deliveryId !== "string" || typeof candidate.sessionId !== "string") return false;
	if (candidate.status === "inserted") return typeof candidate.entryId === "string";
	if (candidate.status === "discarded")
		return ["queue_cleared", "aborted", "session_replaced", "quit"].includes(String(candidate.reason));
	if (candidate.status === "rejected")
		return ["preflight_failed", "session_mismatch"].includes(String(candidate.reason));
	return candidate.status === "uncertain";
}

export async function sendWithReceipt(
	sender: ReceiptDeliverySender,
	message: unknown,
	origin: DeliveryOrigin,
	id: string,
): Promise<DeliveryReceipt> {
	const receipt = await sender(message, {
		deliveryId: id,
		sessionId: origin.parentSessionId,
		deliverAs: "followUp",
		triggerTurn: true,
	});
	if (!isReceipt(receipt) || receipt.deliveryId !== id || receipt.sessionId !== origin.parentSessionId)
		return {
			status: "uncertain",
			deliveryId: id,
			sessionId: origin.parentSessionId,
			error: new Error("The SDK returned an invalid or mismatched delivery receipt."),
		};
	return receipt;
}

export function retryGateForReceipt(receipt: DeliveryReceipt): DeliveryRetryGate {
	if (receipt.status === "discarded") return "interactive";
	if (receipt.status === "rejected") return "session-start";
	if (receipt.status === "uncertain") return "held";
	return "none";
}

export function receiptFailureLabel(receipt: DeliveryReceipt): string | undefined {
	if (receipt.status === "inserted") return undefined;
	return receipt.status === "uncertain"
		? "uncertain SDK delivery receipt"
		: `${receipt.status} (${receipt.reason})`;
}

export function isExpectedDeliveryCancellation(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as { name?: unknown; code?: unknown };
	return candidate.name === "AbortError" || candidate.code === "ABORT_ERR";
}
