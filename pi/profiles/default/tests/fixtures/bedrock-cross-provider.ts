import type { Context } from "@earendil-works/pi-ai";

// Synthetic Codex history, including reasoning and tool IDs that need conversion.
export const codexHistory: Context = {
	systemPrompt: "Reply briefly.",
	tools: [{ name: "status", description: "Return the current status.", parameters: { type: "object", properties: {} } }],
	messages: [
		{ role: "user", content: "Check the status.", timestamp: 1 },
		{
			role: "assistant",
			api: "openai-codex-responses",
			provider: "openai-codex",
			model: "gpt-5.4",
			content: [
				{ type: "thinking", thinking: "I will check the status.", thinkingSignature: "opaque-codex-signature" },
				{ type: "toolCall", id: "call_status|fc_status", name: "status", arguments: {} },
			],
			usage: {
				input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "toolUse",
			timestamp: 2,
		},
		{
			role: "toolResult", toolCallId: "call_status|fc_status", toolName: "status",
			content: [{ type: "text", text: "OK" }], isError: false, timestamp: 3,
		},
		{ role: "user", content: "Reply with exactly OK. Do not use tools.", timestamp: 4 },
	],
};

// Available Mantle models observed by authenticated discovery on 2026-09-10.
// Fable 5.1 is intentionally absent: its actual latest route is Bedrock Runtime.
export const discoveredClaudeIds = [
	"anthropic.claude-haiku-4-5",
	"anthropic.claude-sonnet-5",
	"anthropic.claude-opus-5",
];
