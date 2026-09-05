import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	captureDeliveryOrigin,
	deliveryId,
	deliveryOriginMatches,
	requireReceiptDelivery,
	sendWithReceipt,
	type DeliveryReceipt,
} from "../lib/background-delivery.ts";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("acknowledged background delivery adapter", () => {
	it("requires a parent session and canonicalizes parent workspace aliases", () => {
		const workspace = mkdtempSync(join(tmpdir(), "pi-delivery-"));
		roots.push(workspace);
		const alias = join(workspace, "alias");
		symlinkSync(workspace, alias, "junction");
		const origin = captureDeliveryOrigin({ cwd: alias, sessionId: "parent" });
		expect(origin.parentWorkspaceId).toBe(
			captureDeliveryOrigin({ cwd: workspace, sessionId: "parent" }).parentWorkspaceId,
		);
		expect(deliveryOriginMatches(origin, { parentSessionId: "parent", parentWorkspaceId: workspace })).toBe(true);
		expect(deliveryOriginMatches(origin, { parentSessionId: "other", parentWorkspaceId: workspace })).toBe(false);
		expect(() => captureDeliveryOrigin({ cwd: workspace, sessionId: undefined })).toThrow("parent session ID");
	});

	it("uses the narrow capability boundary and passes the stable receipt routing fields", async () => {
		const sender = vi.fn(async (_message: unknown, options: { deliveryId: string; sessionId: string }) => ({
			status: "inserted" as const,
			deliveryId: options.deliveryId,
			sessionId: options.sessionId,
			entryId: "entry",
		}));
		const origin = { parentSessionId: "parent", parentWorkspaceId: "/workspace" };
		const receipt = await sendWithReceipt(sender, { content: "bounded" }, origin, deliveryId("subagent", "run-1"));
		expect(receipt.status).toBe("inserted");
		expect(sender).toHaveBeenCalledWith(
			{ content: "bounded" },
			expect.objectContaining({ deliveryId: "subagent:run-1", sessionId: "parent", deliverAs: "followUp", triggerTurn: true }),
		);
		expect(() => requireReceiptDelivery({ sendMessage: vi.fn() })).toThrow(
			/Acknowledged background completion delivery is unavailable/,
		);
	});

	it("does not settle or consume before a deferred receipt arrives", async () => {
		let resolveReceipt!: (receipt: DeliveryReceipt) => void;
		const sender = vi.fn(
			() => new Promise<DeliveryReceipt>((resolve) => {
				resolveReceipt = resolve;
			}),
		);
		const origin = { parentSessionId: "parent", parentWorkspaceId: "/workspace" };
		let settled = false;
		const delivery = sendWithReceipt(sender, { content: "deferred" }, origin, deliveryId("background-terminal", "run-2"));
		void delivery.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		expect(sender).toHaveBeenCalledOnce();

		resolveReceipt({
			status: "inserted",
			deliveryId: "background-terminal:run-2",
			sessionId: "parent",
			entryId: "entry-2",
		});
		expect(await delivery).toMatchObject({ status: "inserted", entryId: "entry-2" });
	});
});
