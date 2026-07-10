import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const { readFileSyncMock } = vi.hoisted(() => ({
	readFileSyncMock: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return { ...actual, readFileSync: readFileSyncMock };
});

async function registerExtension() {
	const { default: piInstructions } = await import(
		"../extensions/pi-instructions.ts"
	);
	const pi = createMockPi();
	piInstructions(pi as never);
	return {
		hook: pi._getHook("before_agent_start")[0].handler,
	};
}

describe("pi-instructions extension", () => {
	beforeEach(() => {
		vi.resetModules();
		readFileSyncMock.mockReset();
	});

	it("appends trimmed Pi instructions to the existing system prompt", async () => {
		readFileSyncMock.mockReturnValue("  compact Pi instructions\n");
		const { hook } = await registerExtension();

		await expect(
			hook({ systemPrompt: "base prompt" }, createMockCtx()),
		).resolves.toEqual({
			systemPrompt: "base prompt\n\ncompact Pi instructions",
		});
	});

	it.each([
		["empty", () => readFileSyncMock.mockReturnValue("  \n")],
		[
			"missing",
			() =>
				readFileSyncMock.mockImplementation(() => {
					throw new Error("missing");
				}),
		],
	])("warns and leaves the prompt unchanged when the instruction file is %s", async (_case, arrange) => {
		arrange();
		const { hook } = await registerExtension();
		const ctx = createMockCtx();
		const event = { systemPrompt: "base prompt" };

		await expect(hook(event, ctx)).resolves.toBeUndefined();
		expect(event.systemPrompt).toBe("base prompt");
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("Pi-specific instructions skipped"),
			"warning",
		);
	});

	it("caches the first module-level file read across hook calls", async () => {
		readFileSyncMock
			.mockReturnValueOnce("first content")
			.mockReturnValue("changed content");
		const { hook } = await registerExtension();

		const first = await hook({ systemPrompt: "one" }, createMockCtx());
		const second = await hook({ systemPrompt: "two" }, createMockCtx());

		expect(first.systemPrompt).toBe("one\n\nfirst content");
		expect(second.systemPrompt).toBe("two\n\nfirst content");
		expect(readFileSyncMock).toHaveBeenCalledTimes(1);
	});
});
