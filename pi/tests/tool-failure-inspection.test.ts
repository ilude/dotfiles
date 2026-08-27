import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBoundedInspection, fixCheckToken } from "../lib/tool-failure-inspection.ts";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe("bounded tool-failure inspection", () => {
	it("denies protected and out-of-workspace reads before content is loaded", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-inspection-"));
		roots.push(root);
		const secret = path.join(root, ".env");
		const outside = path.join(path.dirname(root), "outside-secret.txt");
		await fs.writeFile(secret, "token=must-not-be-read");
		await fs.writeFile(outside, "secret=must-not-be-read");
		const inspection = createBoundedInspection(root, { protectedPaths: [".env"] });
		await expect(inspection.readRepository(secret)).rejects.toThrow("protected");
		await expect(inspection.readRepository(outside)).rejects.toThrow("outside");
	});

	it("returns a bounded structurally redacted call and result envelope", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-inspection-envelope-")); roots.push(root); const transcript = path.join(root, "session.jsonl");
		await fs.writeFile(transcript, [
			JSON.stringify({ role: "assistant", timestamp: "2026-08-25T00:00:00Z", content: [{ type: "toolCall", id: "one", name: "bash", arguments: { command: "echo ok", nested: { password: "do-not-show", safe: "value" }, oversized: Array.from({ length: 40 }, (_, index) => index) } }] }),
			JSON.stringify({ role: "toolResult", timestamp: "2026-08-25T00:01:00Z", toolCallId: "one", isError: true, content: [{ type: "text", text: "failure " + Array.from({ length: 300 }, (_, index) => String(index)).join(",") }] }),
		].join("\n") + "\n");
		const inspection = createBoundedInspection(root, { selectedCoordinates: [{ filePath: transcript, line: 2, callLine: 1, token: "opaque" }], limits: { maxBytesPerCall: 1024, maxBytesPerTurn: 1024 } });
		const envelope = JSON.parse(await inspection.readSelectedTranscript("opaque")) as { tool: string; call: { argumentShape: { nested: { password: string } } }; result: { status: string; text: string }; timestampValid: boolean; sessionDigest: string; token: string };
		expect(envelope).toMatchObject({ tool: "bash", result: { status: "error" }, timestampValid: true, token: "opaque" });
		expect(envelope.call.argumentShape.nested.password).toBe("[REDACTED]");
		expect(JSON.stringify(envelope)).toContain("[TRUNCATED]");
		expect(JSON.stringify(envelope)).not.toContain("do-not-show");
	});

	it("resolves persisted entry IDs instead of trusting query-order line numbers", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-entry-id-")); roots.push(root); const transcript = path.join(root, "session.jsonl");
		await fs.writeFile(transcript, [
			{ type: "message", id: "noise", message: { role: "user", content: [{ type: "text", text: "noise" }] } },
			{ type: "message", id: "call-entry", timestamp: "2026-08-25T00:00:00Z", message: { role: "assistant", content: [{ type: "toolCall", id: "one", name: "bash", arguments: { command: "false" } }] } },
			{ type: "message", id: "result-entry", timestamp: "2026-08-25T00:01:00Z", message: { role: "toolResult", toolCallId: "one", isError: true, content: [{ type: "text", text: "failed" }] } },
		].map(JSON.stringify).join("\n") + "\n");
		const inspection = createBoundedInspection(root, { selectedCoordinates: [{ filePath: transcript, line: 1, callLine: 1, resultEntryId: "result-entry", callEntryId: "call-entry", token: "opaque" }] });
		const envelope = JSON.parse(await inspection.readSelectedTranscript("opaque")) as { tool: string; result: { text: string } };
		expect(envelope).toMatchObject({ tool: "bash", result: { text: "failed" } });
	});

	it("admits only an inspected later successful Bash command as a fix check", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-fix-check-")); roots.push(root); const transcript = path.join(root, "session.jsonl");
		const call = (id: string, command?: string) => ({ role: "assistant", timestamp: id === "failed" ? "2026-08-25T00:00:00Z" : "2026-08-26T00:00:00Z", content: [{ type: "toolCall", id, name: "bash", arguments: command === undefined ? {} : { command } }] });
		await fs.writeFile(transcript, [call("failed"), { role: "toolResult", timestamp: "2026-08-25T00:00:01Z", toolCallId: "failed", isError: true, content: [{ type: "text", text: "command is a required property" }] }, call("success", "echo fixed"), { role: "toolResult", timestamp: "2026-08-26T00:00:01Z", toolCallId: "success", isError: false, content: [{ type: "text", text: "ok" }] }].map(JSON.stringify).join("\n") + "\n");
		const inspection = createBoundedInspection(root, { selectedCoordinates: [{ filePath: transcript, line: 2, callLine: 1, token: "failure" }, { filePath: transcript, line: 4, callLine: 3, token: fixCheckToken("failure"), fixCheckFor: "failure" }] });
		await inspection.readSelectedTranscript("failure");
		await expect(inspection.readSelectedTranscript(fixCheckToken("failure"))).resolves.toContain('"status":"success"');
		inspection.resetTurn();
		await expect(inspection.readSelectedTranscript(fixCheckToken("failure"))).rejects.toThrow("selected failure");
	});

	it("selects transcript coordinates, redacts content, and enforces limits", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-inspection-"));
		roots.push(root);
		const transcript = path.join(root, "session.jsonl");
		await fs.writeFile(transcript, "first\napi_key=abcdefghijklmnopqrstuvwxyz123456\nthird\n");
		const inspection = createBoundedInspection(root, {
			selectedCoordinates: [{ filePath: transcript, line: 2 }],
			limits: { maxItemsPerTurn: 1, maxBytesPerTurn: 100 },
		});
		await expect(inspection.readTranscript({ filePath: transcript, line: 1 })).rejects.toThrow("not selected");
		await expect(inspection.readTranscript({ filePath: transcript, line: 2 })).resolves.toBe("api_key=[REDACTED]");
		await expect(inspection.readRepository(transcript)).rejects.toThrow("item limit");
	});
});
