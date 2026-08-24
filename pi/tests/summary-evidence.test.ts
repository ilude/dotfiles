import { describe, expect, it, vi } from "vitest";
import summarizeExtension from "../extensions/summarize/index.ts";
import {
	redactSummarySecrets,
	serializeSummaryEvidence,
} from "../extensions/summarize/evidence.ts";

function sessionEntries() {
	return [
		{
			id: "1",
			type: "message",
			parentId: null,
			timestamp: new Date().toISOString(),
			message: {
				role: "user",
				content: [{ type: "text", text: "Deploy this" }],
				timestamp: Date.now(),
			},
		},
		{
			id: "2",
			type: "message",
			parentId: "1",
			timestamp: new Date().toISOString(),
			message: {
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "private reasoning" },
					{
						type: "toolCall",
						id: "call-1",
						name: "bash",
						arguments: { command: "test", token: "synthetic-secret-value" },
					},
				],
				provider: "test",
				model: "test",
				usage: {},
				stopReason: "toolUse",
				timestamp: Date.now(),
			},
		},
		{
			id: "3",
			type: "message",
			parentId: "2",
			timestamp: new Date().toISOString(),
			message: {
				role: "toolResult",
				toolCallId: "call-1",
				toolName: "bash",
				content: [{ type: "text", text: "failed with exit 2" }],
				isError: true,
				timestamp: Date.now(),
			},
		},
		{
			id: "4",
			type: "custom_message",
			parentId: "3",
			timestamp: new Date().toISOString(),
			customType: "workflow.hiddenPrompt",
			content: "hidden instructions",
			display: false,
		},
	] as never;
}

describe("summary evidence", () => {
	it("redacts secrets and keeps tool failures without thinking or hidden prompts", () => {
		const evidence = serializeSummaryEvidence(sessionEntries());
		expect(evidence).toContain("TOOL CALL bash");
		expect(evidence).toContain('"token": "[REDACTED]"');
		expect(evidence).toContain("TOOL RESULT bash (error)");
		expect(evidence).toContain("failed with exit 2");
		expect(evidence).not.toContain("synthetic-secret-value");
		expect(evidence).not.toContain("private reasoning");
		expect(evidence).not.toContain("hidden instructions");
	});

	it("caps the full packet with head-tail retention", () => {
		const entries = [
			{
				id: "1",
				type: "message",
				parentId: null,
				timestamp: new Date().toISOString(),
				message: {
					role: "user",
					content: [{ type: "text", text: `HEAD-${"x".repeat(500)}-TAIL` }],
					timestamp: Date.now(),
				},
			},
		] as never;
		const evidence = serializeSummaryEvidence(entries, 160);
		expect(Buffer.byteLength(evidence, "utf8")).toBeLessThanOrEqual(160);
		expect(evidence).toContain("HEAD-");
		expect(evidence).toContain("-TAIL");
		expect(evidence).toContain("evidence capped");
	});

	it("redacts authorization, quoted values, query tokens, and private keys", () => {
		const text = redactSummarySecrets(
			`Authorization: Bearer synthetic-token-123?token=visible-value\npassword = "hello \\"world\\" tail"\n-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----\n-----BEGIN EC PRIVATE KEY-----\ntruncated-private-material`,
		);
		expect(text).not.toContain("synthetic-token-123");
		expect(text).not.toContain("visible-value");
		expect(text).not.toContain("world");
		expect(text).not.toContain("private-material");
		expect(text).not.toContain("truncated-private-material");
	});

	it("omits prior summarize runs while retaining later user work", () => {
		const entries = [
			{
				id: "1",
				type: "custom_message",
				parentId: null,
				timestamp: new Date().toISOString(),
				customType: "slash-echo",
				content: "/summarize",
				display: true,
			},
			{
				id: "2",
				type: "message",
				parentId: "1",
				timestamp: new Date().toISOString(),
				message: {
					role: "assistant",
					content: [{ type: "text", text: "old recap payload" }],
					provider: "test",
					model: "test",
					usage: {},
					stopReason: "stop",
					timestamp: Date.now(),
				},
			},
			{
				id: "3",
				type: "message",
				parentId: "2",
				timestamp: new Date().toISOString(),
				message: {
					role: "user",
					content: [{ type: "text", text: "new work" }],
					timestamp: Date.now(),
				},
			},
		] as never;
		const evidence = serializeSummaryEvidence(entries);
		expect(evidence).not.toContain("old recap payload");
		expect(evidence).toContain("new work");
	});

	it("caps individual messages before assembling the packet", () => {
		const entries = [
			{
				id: "1",
				type: "message",
				parentId: null,
				timestamp: new Date().toISOString(),
				message: {
					role: "user",
					content: [{ type: "text", text: "x".repeat(2_000_000) }],
					timestamp: Date.now(),
				},
			},
		] as never;
		const evidence = serializeSummaryEvidence(entries);
		expect(Buffer.byteLength(evidence, "utf8")).toBeLessThan(9_000);
		expect(evidence).toContain("user message capped");
	});
});

describe("summarize command", () => {
	it("injects bounded evidence into a hidden prompt for the active turn", async () => {
		let command:
			| { handler: (args: string, ctx: Record<string, unknown>) => Promise<void> }
			| undefined;
		const sendMessage = vi.fn();
		let releaseIdle!: () => void;
		const idle = new Promise<void>((resolve) => {
			releaseIdle = resolve;
		});
		const pi = {
			registerCommand: vi.fn((name: string, definition) => {
				if (name === "summarize") command = definition;
			}),
			sendMessage,
		};
		summarizeExtension(pi as never);
		if (!command) throw new Error("summarize command was not registered");

		const pending = command.handler("focus on validation", {
			waitForIdle: vi.fn(() => idle),
			sessionManager: { getBranch: () => sessionEntries() },
		});

		expect(sendMessage).toHaveBeenCalledOnce();
		expect(sendMessage).toHaveBeenNthCalledWith(
		1,
		expect.objectContaining({
			customType: "slash-echo",
			content: "/summarize focus on validation",
			display: true,
		}),
		{ triggerTurn: false },
		);
		releaseIdle();
		await pending;

		expect(sendMessage).toHaveBeenCalledTimes(2);
		expect(sendMessage).toHaveBeenNthCalledWith(
		2,
		expect.objectContaining({
			customType: "workflow.hiddenPrompt",
			display: false,
			content: expect.stringContaining("<session_evidence>"),
		}),
		{ triggerTurn: true, deliverAs: "followUp" },
		);
		expect(sendMessage.mock.calls[1]?.[0].content).toContain(
			"Additional focus: focus on validation",
		);
	});
});
