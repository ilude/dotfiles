import { beforeEach, describe, expect, it, vi } from "vitest";

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}

describe("damage-control extension", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.restoreAllMocks();
    setPlatform(originalPlatform);
  });

  it("asks for docker compose down on linux and blocks when not confirmed", async () => {
    setPlatform("linux");
    const mod = await import("../extensions/damage-control.ts");

    const result = await mod.evaluateDangerousCommand(
      "docker compose down",
      [
        {
          pattern: "docker compose down",
          reason: "docker compose down stops and removes containers",
          action: "ask",
          platforms: ["linux"],
        },
      ],
      {
        hasUI: true,
        ui: { confirm: vi.fn(async () => false) },
      },
    );

    expect(result).toEqual({
      block: true,
      reason:
        'Confirmation required for dangerous command (matched "docker compose down"): docker compose down stops and removes containers',
    });
  });

  it("allows docker compose down on linux when confirmed", async () => {
    setPlatform("linux");
    const mod = await import("../extensions/damage-control.ts");
    const confirm = vi.fn(async () => true);

    const result = await mod.evaluateDangerousCommand(
      "docker compose down",
      [
        {
          pattern: "docker compose down",
          reason: "docker compose down stops and removes containers",
          action: "ask",
          platforms: ["linux"],
        },
      ],
      {
        hasUI: true,
        ui: { confirm },
      },
    );

    expect(confirm).toHaveBeenCalledWith(
      "Confirm dangerous command",
      "docker compose down stops and removes containers",
    );
    expect(result).toBeUndefined();
  });

  it("allows docker compose down on macOS and Windows because linux-only rule does not apply", async () => {
    const mod = await import("../extensions/damage-control.ts");

    setPlatform("darwin");
    const macResult = await mod.evaluateDangerousCommand("docker compose down", [
      {
        pattern: "docker compose down",
        reason: "docker compose down stops and removes containers",
        action: "ask",
        platforms: ["linux"],
      },
    ]);

    setPlatform("win32");
    const windowsResult = await mod.evaluateDangerousCommand("docker down", [
      {
        pattern: "docker down",
        reason: "docker down stops and removes containers",
        action: "ask",
        platforms: ["linux"],
      },
    ]);

    expect(macResult).toBeUndefined();
    expect(windowsResult).toBeUndefined();
  });
});
