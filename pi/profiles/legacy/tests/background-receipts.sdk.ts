import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fauxAssistantMessage, registerFauxProvider } from "@earendil-works/pi-ai/compat";
import {
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import backgroundTerminalExtension from "../extensions/background-terminal/index.ts";
import {
	getBackgroundTerminalManager,
	resetBackgroundTerminalManager,
} from "../extensions/background-terminal/manager.ts";
import { canonicalizeDeliveryWorkspace } from "../lib/background-delivery.ts";

const roots: string[] = [];
afterEach(async () => {
	await resetBackgroundTerminalManager();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("background terminal actual SDK receipt seam", () => {
	it("inserts a failed process result once and presents it to the originating provider turn", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "pi-sdk-receipts-"));
		roots.push(cwd);
		const agentDir = join(cwd, "agent");
		const faux = registerFauxProvider();
		const model = faux.getModel();
		const modelRuntime = await ModelRuntime.create({
			authPath: join(agentDir, "auth.json"),
			modelsPath: null,
			allowModelNetwork: false,
		});
		await modelRuntime.setRuntimeApiKey(model.provider, "faux-test-key");
		modelRuntime.registerProvider(model.provider, {
			baseUrl: model.baseUrl,
			apiKey: "faux-test-key",
			api: faux.api,
			models: faux.models.map((item) => ({
				id: item.id,
				name: item.name,
				api: item.api,
				reasoning: item.reasoning,
				input: item.input,
				cost: item.cost,
				contextWindow: item.contextWindow,
				maxTokens: item.maxTokens,
				baseUrl: item.baseUrl,
			})),
		});
		const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
		const resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			extensionFactories: [backgroundTerminalExtension],
		});
		await resourceLoader.reload();
		const sessionManager = SessionManager.create(cwd, join(cwd, "sessions"));
		const { session } = await createAgentSession({
			cwd,
			agentDir,
			model,
			modelRuntime,
			resourceLoader,
			sessionManager,
			settingsManager,
			tools: ["bg_start", "bg_kill"],
		});
		try {
			await session.bindExtensions({ mode: "print" });
			let providerInput = "";
			faux.setResponses([
				(context) => {
					providerInput = JSON.stringify(context.messages);
					return fauxAssistantMessage("Failure received");
				},
				fauxAssistantMessage("No duplicate result"),
			]);
			const tool = session.agent.state.tools.find((candidate) => candidate.name === "bg_start");
			if (!tool) throw new Error("The actual SDK did not register bg_start");
			await tool.execute("sdk-bg-start", {
				command: "node -e 'process.stderr.write(\"sdk-failure\\n\");process.exit(7)'",
				title: "actual-sdk-receipt",
			}, new AbortController().signal, () => {});
			const manager = getBackgroundTerminalManager();
			const entries = () => sessionManager.getEntries().filter(
				(entry) => entry.type === "custom_message" && entry.customType === "background-terminal-result",
			);
			await vi.waitFor(() => {
				expect(entries()).toHaveLength(1);
				expect(manager.hasPendingCompletion("bg-1")).toBe(false);
			}, { timeout: 10000 });
			await session.waitForIdle();
			expect(entries()[0]).toMatchObject({
				content: expect.stringContaining("sdk-failure"),
				details: { id: "bg-1", status: "failed", exitCode: 7 },
			});
			expect(providerInput).toContain("sdk-failure");
			expect(manager.get("bg-1")?.origin).toEqual({
				parentSessionId: session.sessionId,
				parentWorkspaceId: canonicalizeDeliveryWorkspace(cwd),
			});
			expect(manager.deliveryState("bg-1")?.phase).toBe("consumed");
			const sessionFile = sessionManager.getSessionFile();
			if (!sessionFile) throw new Error("Expected a persisted test session");
			expect(readFileSync(sessionFile, "utf8")).toContain("background-terminal-result");
			await session.prompt("Continue without replaying the completed process");
			expect(entries()).toHaveLength(1);
			expect(manager.pendingCompletions()).toHaveLength(0);
		} finally {
			await resetBackgroundTerminalManager();
			await session.abort();
			session.dispose();
			faux.unregister();
		}
	});
});
