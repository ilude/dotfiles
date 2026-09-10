import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBedrockModelRoutes, contextForBedrockRoute, createBedrockRoutingStream, resolveBedrockMantleTarget } from "../lib/bedrock/provider.ts";
import { readRecords } from "../lib/bedrock/ledger.ts";
import registerBedrockProvider from "../extensions/bedrock/provider.ts";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

let scratch: string | undefined;

afterEach(() => { vi.unstubAllEnvs(); if (scratch) rmSync(scratch, { recursive: true, force: true }); scratch = undefined; });

describe("Bedrock provider routing", () => {
	it("registers the provider-only child extension without operator commands", () => {
		const registerProvider = vi.fn(); const registerCommand = vi.fn();
		registerBedrockProvider({ registerProvider, registerCommand, on: vi.fn() } as any);
		expect(registerProvider).toHaveBeenCalledOnce(); expect(registerCommand).not.toHaveBeenCalled();
	});
	it("accounts and annotates finalized child responses without a status surface", async () => {
		scratch = mkdtempSync(join(tmpdir(), "bedrock-child-accounting-")); vi.stubEnv("PI_CODING_AGENT_DIR", scratch);
		let messageEnd: any;
		const registerCommand = vi.fn();
		registerBedrockProvider({ registerProvider: vi.fn(), registerCommand, on: vi.fn((name: string, handler: any) => { if (name === "message_end") messageEnd = handler; }) } as any);
		const message: any = { role: "assistant", provider: "amazon-bedrock", model: "openai.gpt-5.6-luna", timestamp: Date.now(), usage: { input: 1_000_000, output: 0 } };
		const result = await messageEnd({ message }, { sessionManager: { getSessionFile: () => "child.jsonl" } });
		expect(result.message.bedrockPricing.status).toBe("estimated");
		expect((await readRecords()).map(record => record.session)).toEqual(["child.jsonl"]);
		expect(readFileSync(join(scratch, "bedrock-usage.jsonl"), "utf8")).toContain("openai.gpt-5.6-luna");
		expect(registerCommand).not.toHaveBeenCalled();
	});
	it("keeps regions scoped and curates newest supported routes", () => {
		expect(resolveBedrockMantleTarget({ AWS_REGION: "eu-west-1" }).region).toBe("us-east-1");
		expect(resolveBedrockMantleTarget({ BEDROCK_MANTLE_REGION: "us-west-2", AWS_PROFILE: "work" })).toMatchObject({ region: "us-west-2", profile: "work" });
		const routes = buildBedrockModelRoutes(["anthropic.claude-sonnet-4-6", "anthropic.claude-sonnet-5", "openai.gpt-5.6-luna", "openai.gpt-5.6-sol"]);
		expect(routes.map(route => route.model.id)).toEqual(expect.arrayContaining(["anthropic.claude-sonnet-5", "openai.gpt-5.6-luna", "openai.gpt-5.6-sol"]));
		expect(routes.some(route => route.model.id === "anthropic.claude-sonnet-4-6")).toBe(false);
	});
	it("normalizes route identity and replays matching context through the target", async () => {
		const route = buildBedrockModelRoutes(["openai.gpt-5.6-luna"]).find(item => item.model.id === "openai.gpt-5.6-luna")!;
		const adapter = vi.fn((_model, _context) => { const stream = createAssistantMessageEventStream(); queueMicrotask(() => { const message: any = { role: "assistant", content: [], api: route.target.api, provider: route.target.provider, model: route.target.id, responseModel: route.target.id, usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 1 }; stream.push({ type: "done", reason: "stop", message }); stream.end(); }); return stream; });
		const stream = createBedrockRoutingStream(async () => "token", () => route, { openAI: adapter as any });
		const events: any[] = []; for await (const event of stream(route.model, { systemPrompt: "", messages: [], tools: [] } as any)) events.push(event);
		expect(events.at(-1).message).toMatchObject({ provider: "bedrock-mantle", model: route.model.id, responseModel: route.target.id });
		const replayed = contextForBedrockRoute({ messages: [
			{ role: "assistant", provider: "anthropic", api: "anthropic-messages", model: "claude-opus-5", responseModel: "claude-opus-5", content: [] },
			events.at(-1).message,
		] } as any, route).messages;
		expect(replayed[0]).toMatchObject({ provider: "anthropic", model: "claude-opus-5" });
		expect(replayed[1]).toMatchObject({ provider: route.target.provider, model: route.target.id });
		expect(adapter).toHaveBeenCalledOnce();
	});
	it("returns an unavailable-route error without invoking another transport", async () => {
		const adapter = vi.fn(); const model: any = { id: "missing", provider: "bedrock-mantle", api: "openai-responses" };
		const events: any[] = []; for await (const event of createBedrockRoutingStream(async () => "x", () => undefined, { openAI: adapter as any })(model, { messages: [] } as any)) events.push(event);
		expect(events.at(-1).error.errorMessage).toContain("No Bedrock route"); expect(adapter).not.toHaveBeenCalled();
	});
});
