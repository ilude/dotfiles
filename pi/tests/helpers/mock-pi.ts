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

// ---------------------------------------------------------------------------
// Git remote fixtures for repo-id and layering tests
// ---------------------------------------------------------------------------

export interface GitRemoteFixture {
  label: string;
  remotes: Record<string, string>;
  preferredRemote?: string;
  expectedSlug: string;
}

/** Table-driven fixtures mapping real-world remote formats to expected repo ID slugs.
 *  These must match the decision tables in pi/docs/expertise-layering.md (T1 contract).
 */
export const GIT_REMOTE_FIXTURES: GitRemoteFixture[] = [
  // HTTPS -- GitHub
  { label: "GitHub HTTPS with .git suffix", remotes: { origin: "https://github.com/owner/repo.git" }, expectedSlug: "gh/owner/repo" },
  { label: "GitHub HTTPS without .git suffix", remotes: { origin: "https://github.com/owner/repo" }, expectedSlug: "gh/owner/repo" },
  { label: "GitHub HTTPS uppercase host", remotes: { origin: "https://GITHUB.COM/Owner/Repo.git" }, expectedSlug: "gh/owner/repo" },
  // SCP-style SSH -- GitHub
  { label: "GitHub SCP with .git suffix", remotes: { origin: "git@github.com:owner/repo.git" }, expectedSlug: "gh/owner/repo" },
  { label: "GitHub SCP without .git suffix", remotes: { origin: "git@github.com:owner/repo" }, expectedSlug: "gh/owner/repo" },
  { label: "GitHub SCP uppercase host", remotes: { origin: "git@GITHUB.COM:Owner/Repo.git" }, expectedSlug: "gh/owner/repo" },
  // SSH with explicit port -- GitHub
  { label: "SSH URL with explicit port", remotes: { origin: "ssh://git@github.com/owner/repo.git" }, expectedSlug: "gh/owner/repo" },
  // HTTPS -- GitLab
  { label: "GitLab HTTPS with .git suffix", remotes: { origin: "https://gitlab.com/owner/repo.git" }, expectedSlug: "gl/owner/repo" },
  { label: "GitLab HTTPS uppercase host", remotes: { origin: "https://GITLAB.COM/Owner/Repo.git" }, expectedSlug: "gl/owner/repo" },
  // SCP-style SSH -- GitLab
  { label: "GitLab SCP with .git suffix", remotes: { origin: "git@gitlab.com:owner/repo.git" }, expectedSlug: "gl/owner/repo" },
  // HTTPS -- nested GitLab groups
  { label: "GitLab nested group (two levels)", remotes: { origin: "https://gitlab.com/group/subgroup/repo.git" }, expectedSlug: "gl/group/subgroup/repo" },
  { label: "GitLab SCP nested group", remotes: { origin: "git@gitlab.com:group/subgroup/repo.git" }, expectedSlug: "gl/group/subgroup/repo" },
  { label: "GitLab nested group (three levels)", remotes: { origin: "https://gitlab.com/org/team/project/repo.git" }, expectedSlug: "gl/org/team/project/repo" },
  // HTTPS -- Bitbucket
  { label: "Bitbucket HTTPS with .git suffix", remotes: { origin: "https://bitbucket.org/owner/repo.git" }, expectedSlug: "bb/owner/repo" },
  // HTTPS -- Azure DevOps (strips _git segment)
  { label: "Azure DevOps HTTPS with _git segment", remotes: { origin: "https://dev.azure.com/org/project/_git/repo" }, expectedSlug: "az/org/project/repo" },
  // HTTPS -- unknown/external host with non-standard port
  { label: "external host with non-standard port", remotes: { origin: "https://example.com:8443/owner/repo.git" }, expectedSlug: "ext/example.com/owner/repo" },
  // Multiple remotes -- selection precedence
  { label: "multiple remotes uses origin by default", remotes: { upstream: "https://github.com/canonical/repo.git", origin: "https://github.com/fork/repo.git" }, expectedSlug: "gh/fork/repo" },
  { label: "multiple remotes preferred remote wins over origin", remotes: { upstream: "https://github.com/owner/aux", origin: "https://github.com/fork/repo.git" }, preferredRemote: "upstream", expectedSlug: "gh/owner/aux" },
  { label: "multiple remotes no origin falls back lexically", remotes: { upstream: "https://github.com/org/repo.git", backup: "https://github.com/backup/repo.git" }, expectedSlug: "gh/backup/repo" },
];

/** Fixtures for Windows-safe normalization edge cases */
export const WINDOWS_NORMALIZATION_FIXTURES: GitRemoteFixture[] = [
  { label: "reserved name CON", remotes: { origin: "https://github.com/owner/CON.git" }, expectedSlug: "gh/owner/con_" },
  { label: "reserved name PRN", remotes: { origin: "https://github.com/owner/PRN.git" }, expectedSlug: "gh/owner/prn_" },
  { label: "reserved name AUX", remotes: { origin: "https://github.com/owner/AUX.git" }, expectedSlug: "gh/owner/aux_" },
  { label: "reserved name NUL", remotes: { origin: "https://github.com/owner/NUL.git" }, expectedSlug: "gh/owner/nul_" },
  { label: "reserved name COM1", remotes: { origin: "https://github.com/owner/COM1.git" }, expectedSlug: "gh/owner/com1_" },
  { label: "reserved name LPT1", remotes: { origin: "https://github.com/owner/LPT1.git" }, expectedSlug: "gh/owner/lpt1_" },
  { label: "trailing dot on repo name", remotes: { origin: "https://github.com/owner/repo..git" }, expectedSlug: "gh/owner/repo" },
  { label: "case folding across path", remotes: { origin: "https://GITHUB.COM/MyOrg/MyRepo.git" }, expectedSlug: "gh/myorg/myrepo" },
];
