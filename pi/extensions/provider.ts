import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";

type ProviderAuthType = "api_key" | "oauth";

type ProviderEntry = {
	id: string;
	label: string;
	auth: ProviderAuthType;
	envVar?: string;
};

type ProviderCommand =
	| { action: "interactive" }
	| { action: "list" }
	| { action: "remove"; provider: string }
	| { action: "set"; provider: string };

const PROVIDERS: ProviderEntry[] = [
	{ id: "anthropic", label: "Anthropic (Claude Pro/Max)", auth: "oauth", envVar: "ANTHROPIC_API_KEY" },
	{ id: "openai-codex", label: "OpenAI Codex (ChatGPT Plus/Pro)", auth: "oauth" },
	{ id: "github-copilot", label: "GitHub Copilot", auth: "oauth" },
	{ id: "google-gemini-cli", label: "Google Gemini CLI", auth: "oauth" },
	{ id: "google-antigravity", label: "Google Antigravity", auth: "oauth" },
	{ id: "openai", label: "OpenAI", auth: "api_key", envVar: "OPENAI_API_KEY" },
	{ id: "azure-openai-responses", label: "Azure OpenAI Responses", auth: "api_key", envVar: "AZURE_OPENAI_API_KEY" },
	{ id: "google", label: "Google Gemini", auth: "api_key", envVar: "GEMINI_API_KEY" },
	{ id: "mistral", label: "Mistral", auth: "api_key", envVar: "MISTRAL_API_KEY" },
	{ id: "groq", label: "Groq", auth: "api_key", envVar: "GROQ_API_KEY" },
	{ id: "cerebras", label: "Cerebras", auth: "api_key", envVar: "CEREBRAS_API_KEY" },
	{ id: "xai", label: "xAI", auth: "api_key", envVar: "XAI_API_KEY" },
	{ id: "openrouter", label: "OpenRouter", auth: "api_key", envVar: "OPENROUTER_API_KEY" },
	{ id: "vercel-ai-gateway", label: "Vercel AI Gateway", auth: "api_key", envVar: "AI_GATEWAY_API_KEY" },
	{ id: "zai", label: "ZAI", auth: "api_key", envVar: "ZAI_API_KEY" },
	{ id: "opencode", label: "OpenCode Zen", auth: "api_key", envVar: "OPENCODE_API_KEY" },
	{ id: "opencode-go", label: "OpenCode Go", auth: "api_key", envVar: "OPENCODE_API_KEY" },
	{ id: "huggingface", label: "Hugging Face", auth: "api_key", envVar: "HF_TOKEN" },
	{ id: "fireworks", label: "Fireworks", auth: "api_key", envVar: "FIREWORKS_API_KEY" },
	{ id: "kimi-coding", label: "Kimi For Coding", auth: "api_key", envVar: "KIMI_API_KEY" },
	{ id: "minimax", label: "MiniMax", auth: "api_key", envVar: "MINIMAX_API_KEY" },
	{ id: "minimax-cn", label: "MiniMax (China)", auth: "api_key", envVar: "MINIMAX_CN_API_KEY" },
];

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

function parseProviderCommand(raw: string): ProviderCommand {
	const parts = raw.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return { action: "interactive" };
	if (parts.length === 1 && parts[0]?.toLowerCase() === "list") return { action: "list" };
	if (parts[0]?.toLowerCase() === "remove") {
		if (!parts[1]) throw new Error("Usage: /provider remove <provider>");
		if (parts.length > 2) throw new Error("Usage: /provider remove <provider>");
		return { action: "remove", provider: parts[1] };
	}
	if (parts.length > 1) throw new Error("Usage: /provider [list|remove <provider>|<provider>]");
	return { action: "set", provider: parts[0]! };
}

function resolveProvider(query: string): ProviderEntry | undefined {
	const exact = BY_ID.get(query);
	if (exact) return exact;
	const lowered = query.toLowerCase();
	const byId = PROVIDERS.find((provider) => provider.id.toLowerCase() === lowered);
	if (byId) return byId;
	return PROVIDERS.find((provider) => provider.label.toLowerCase() === lowered);
}

function describeConfiguredProviders(authStorage: any): string {
	if (!authStorage || typeof authStorage.list !== "function" || typeof authStorage.get !== "function") {
		return "No auth storage available in this context.";
	}
	const configured = authStorage
		.list()
		.map((id: string) => {
			const cred = authStorage.get(id);
			const type = cred?.type === "oauth" ? "oauth" : cred?.type === "api_key" ? "api_key" : "unknown";
			return `${id} (${type})`;
		})
		.sort();
	return configured.length > 0 ? `Configured providers: ${configured.join(", ")}` : "No providers configured yet.";
}

async function promptProviderSelection(ctx: any, auth: ProviderAuthType): Promise<ProviderEntry | undefined> {
	const options = PROVIDERS.filter((provider) => provider.auth === auth).map(
		(provider) => `${provider.id} — ${provider.label}`,
	);
	const selected = await ctx.ui.select(
		auth === "api_key" ? "Select API-key provider" : "Select OAuth provider",
		options,
	);
	if (!selected) return undefined;
	const providerId = selected.split(" — ")[0];
	return providerId ? BY_ID.get(providerId) : undefined;
}

async function setApiKeyForProvider(ctx: any, provider: ProviderEntry) {
	const placeholder = provider.envVar ? `Paste key (or set ${provider.envVar})` : "Paste API key";
	const key = await ctx.ui.input(`API key for ${provider.id}`, placeholder);
	if (key === undefined) {
		ctx.ui.notify("Cancelled.", "info");
		return;
	}
	const trimmed = key.trim();
	if (!trimmed) {
		ctx.ui.notify("API key cannot be empty.", "error");
		return;
	}
	ctx.modelRegistry.authStorage.set(provider.id, { type: "api_key", key: trimmed });
	ctx.ui.notify(`Saved API key for ${provider.id} in ~/.pi/agent/auth.json`, "info");
}

async function handleSet(ctx: any, provider: ProviderEntry) {
	if (provider.auth === "oauth") {
		ctx.ui.notify(
			`${provider.id} uses OAuth. Run /login and choose ${provider.label}.`,
			"warning",
		);
		return;
	}
	await setApiKeyForProvider(ctx, provider);
}

async function handleRemove(ctx: any, provider: ProviderEntry) {
	const exists = ctx.modelRegistry.authStorage.get(provider.id);
	if (!exists) {
		ctx.ui.notify(`No credentials found for ${provider.id}.`, "warning");
		return;
	}
	const confirmed = await ctx.ui.confirm("Remove provider auth", `Remove saved credentials for ${provider.id}?`);
	if (!confirmed) {
		ctx.ui.notify("Cancelled.", "info");
		return;
	}
	ctx.modelRegistry.authStorage.remove(provider.id);
	ctx.ui.notify(`Removed credentials for ${provider.id} from ~/.pi/agent/auth.json`, "info");
}

async function runInteractiveFlow(ctx: any) {
	const action = await ctx.ui.select("Provider auth action", [
		"Set API key",
		"Set OAuth provider (guided)",
		"Remove provider auth",
		"Show configured providers",
	]);
	if (!action) {
		ctx.ui.notify("Cancelled.", "info");
		return;
	}

	if (action === "Show configured providers") {
		ctx.ui.notify(describeConfiguredProviders(ctx.modelRegistry.authStorage), "info");
		return;
	}

	if (action === "Set OAuth provider (guided)") {
		const provider = await promptProviderSelection(ctx, "oauth");
		if (!provider) {
			ctx.ui.notify("Cancelled.", "info");
			return;
		}
		ctx.ui.notify(`${provider.id} uses OAuth. Run /login and choose ${provider.label}.`, "info");
		return;
	}

	if (action === "Set API key") {
		const provider = await promptProviderSelection(ctx, "api_key");
		if (!provider) {
			ctx.ui.notify("Cancelled.", "info");
			return;
		}
		await handleSet(ctx, provider);
		return;
	}

	const configured = ctx.modelRegistry.authStorage.list() as string[];
	if (!configured.length) {
		ctx.ui.notify("No configured providers to remove.", "warning");
		return;
	}
	const selected = await ctx.ui.select("Remove provider auth", configured.sort());
	if (!selected) {
		ctx.ui.notify("Cancelled.", "info");
		return;
	}
	const provider = resolveProvider(selected);
	if (!provider) {
		ctx.ui.notify(`Unknown provider: ${selected}`, "error");
		return;
	}
	await handleRemove(ctx, provider);
}

export default function registerProviderCommand(pi: ExtensionAPI) {
	pi.registerCommand("provider", {
		description: "Manage provider credentials (API keys in ~/.pi/agent/auth.json, OAuth guidance)",
		handler: async (args, ctx) => {
			let command: ProviderCommand;
			try {
				command = parseProviderCommand(args);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}

			if (command.action === "interactive") {
				await runInteractiveFlow(ctx);
				return;
			}

			if (command.action === "list") {
				ctx.ui.notify(describeConfiguredProviders(ctx.modelRegistry.authStorage), "info");
				return;
			}

			if (command.action === "set") {
				const provider = resolveProvider(command.provider);
				if (!provider) {
					ctx.ui.notify(`Unknown provider: ${command.provider}`, "error");
					return;
				}
				await handleSet(ctx, provider);
				return;
			}

			const provider = resolveProvider(command.provider);
			if (!provider) {
				ctx.ui.notify(`Unknown provider: ${command.provider}`, "error");
				return;
			}
			await handleRemove(ctx, provider);
		},
	});
}

export { parseProviderCommand, resolveProvider, describeConfiguredProviders };