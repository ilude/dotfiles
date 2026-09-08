import { describe, expect, it } from "vitest";
import { NameAllocator } from "../lib/subagents/names.ts";

describe("subagent human names", () => {
  it("allocates case-insensitively and falls back through the bounded pool", () => {
    const names = new NameAllocator(["Ada", "Bea"], ["Stone", "Vale"]);
    expect(names.allocate()).toBe("Ada");
    expect(names.allocate()).toBe("Bea");
    expect(names.allocate()).toBe("Ada Stone");
    expect(names.allocate()).toBe("Ada Vale");
    expect(names.allocate()).toBe("Bea Stone");
    expect(names.allocate()).toBe("Bea Vale");
    expect(names.allocate()).toBe("Ada Stone 2");
    expect(names.has("ADA STONE 2")).toBe(true);
  });

  it("never treats a settled name as available again", () => {
    const names = new NameAllocator(["Clara"], ["Adler"]);
    const first = names.allocate();
    names.reserve("clara adler");
    expect(first).toBe("Clara");
    expect(names.allocate()).toBe("Clara Adler 2");
  });
});
