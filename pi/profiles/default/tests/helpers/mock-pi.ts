import { vi } from "vitest";
import type { TSchema } from "typebox";

export function createMockPi() {
	const hooks: Array<{ event: string; handler: Function }> = [];
	const commands: Array<{ name: string; handler: Function }> = [];
	const tools: Array<{ name: string; description: string; parameters: any; execute: Function; exposure?: string; outputSchema?: TSchema; sourceInfo?: { source: string; origin: string } }> = [];
	let activeTools: string[] = [];
	const mockPi = {
		events: { emit: vi.fn(), on: vi.fn(() => () => {}) },
		registerTool: vi.fn((tool: { name: string; description: string; parameters: any; execute: Function; exposure?: string; outputSchema?: TSchema }) => {
			tools.push({ ...tool, sourceInfo: { source: "extension", origin: "top-level" } });
			if ((!tool.exposure || tool.exposure === "direct" || tool.exposure === "model-only") && !activeTools.includes(tool.name)) activeTools.push(tool.name);
		}),
		on: vi.fn((event: string, handler: Function) => hooks.push({ event, handler })),
		exec: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
		registerCommand: vi.fn((name: string, definition: { handler: Function }) =>
			commands.push({ name, handler: definition.handler }),
		),
		appendEntry: vi.fn(),
		getAllTools: vi.fn(() => tools.map((tool) => ({ ...tool }))),
		getActiveTools: vi.fn(() => [...activeTools]),
		setActiveTools: vi.fn((names: string[]) => { activeTools = [...names]; }),
		_commands: commands,
		_tools: tools,
		_getTool: (name: string) => tools.find((tool) => tool.name === name),
		_getHook: (event: string) => hooks.filter((hook) => hook.event === event),
	};
	return mockPi;
}

export function createMockCtx(overrides: Record<string, unknown> = {}) {
	return {
		cwd: "/test/dir",
		abort: vi.fn(),
		sessionManager: { getSessionId: vi.fn(() => "mock-session") },
		ui: {
			notify: vi.fn(),
			setStatus: vi.fn(),
			confirm: vi.fn(async () => true),
			input: vi.fn(async () => undefined as string | undefined),
			select: vi.fn(async () => undefined as string | undefined),
		},
		hasUI: true,
		isProjectTrusted: () => true,
		...overrides,
	};
}
