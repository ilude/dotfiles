/**
 * Shared mock factory for pi's ExtensionAPI and related types.
 * Used across all extension test suites.
 */
import { vi } from "vitest";

export interface RegisteredTool {
  name: string;
  label?: string;
  description: string;
  parameters: any;
  execute: Function;
  renderCall?: Function;
  renderResult?: Function;
  promptSnippet?: string;
  promptGuidelines?: string[];
}

export interface RegisteredHook {
  event: string;
  handler: Function;
}

export function createMockPi() {
  const tools: RegisteredTool[] = [];
  const hooks: RegisteredHook[] = [];
  const commands: Array<{ name: string; handler: Function }> = [];

  const mockPi = {
    registerTool: vi.fn((toolDef: any) => {
      tools.push(toolDef);
    }),
    on: vi.fn((event: string, handler: Function) => {
      hooks.push({ event, handler });
    }),
    exec: vi.fn(async (_cmd: string, _args?: string[], _opts?: any) => ({
      code: 0,
      stdout: "",
      stderr: "",
    })),
    registerCommand: vi.fn((name: string, def: any) => {
      commands.push({ name, handler: def.handler });
    }),
    sendUserMessage: vi.fn(async (_msg: string) => {}),

    // Test helpers
    _tools: tools,
    _hooks: hooks,
    _commands: commands,
    _getTool: (name: string) => tools.find((t) => t.name === name),
    _getHook: (event: string) => hooks.filter((h) => h.event === event),
  };

  return mockPi;
}

export function createMockCtx(overrides: Record<string, any> = {}) {
  return {
    cwd: "/test/dir",
    ui: {
      notify: vi.fn(),
      confirm: vi.fn(async () => true),
      input: vi.fn(async () => undefined as string | undefined),
      select: vi.fn(async () => undefined as string | undefined),
    },
    hasUI: true,
    ...overrides,
  };
}

export function createMockTheme() {
  return {
    fg: vi.fn((_color: string, text: string) => text),
    bold: vi.fn((text: string) => text),
  };
}

export function createMockSignal() {
  const controller = new AbortController();
  return { controller, signal: controller.signal };
}
