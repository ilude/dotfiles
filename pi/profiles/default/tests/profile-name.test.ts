import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = vi.hoisted(() => ({ home: "", directory: "" }));
vi.mock("@earendil-works/pi-coding-agent", () => ({ getAgentDir: () => state.directory }));
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return { ...original, homedir: () => state.home };
});
import { activeProfileName } from "../lib/profile.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-native-profile-"));
  roots.push(root);
  state.home = join(root, "home");
  mkdirSync(join(state.home, ".pi"), { recursive: true });
  const target = join(root, "profiles", "default");
  mkdirSync(target, { recursive: true });
  return { root, target };
}

describe("native profile identity", () => {
  it("resolves the native agent alias to default", () => {
    const { target } = fixture();
    state.directory = join(state.home, ".pi", "agent");
    symlinkSync(target, state.directory, "junction");
    expect(activeProfileName()).toBe("default");
  });

  it("preserves explicit named-profile labels even when they are symlinks", () => {
    const { root, target } = fixture();
    state.directory = join(root, "work");
    symlinkSync(target, state.directory, "junction");
    expect(activeProfileName()).toBe("work");
  });
});
