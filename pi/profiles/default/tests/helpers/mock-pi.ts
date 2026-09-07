import { vi } from "vitest";

export function createMockPi() {
	const hooks: Array<{ event: string; handler: Function }> = [];
	const commands: Array<{ name: string; handler: Function }> = [];
	const tools: Array<{ name: string; parameters?: any; execute?: Function }> = [];
	const mockPi = {
		events: { emit: vi.fn(), on: vi.fn(() => () => {}) },
		registerTool: vi.fn((tool: { name: string; parameters?: any; execute?: Function }) => tools.push(tool)),
		on: vi.fn((event: string, handler: Function) => hooks.push({ event, handler })),
		exec: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
		registerCommand: vi.fn((name: string, definition: { handler: Function }) =>
			commands.push({ name, handler: definition.handler }),
		),
		appendEntry: vi.fn(),
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
