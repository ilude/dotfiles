import { describe, expect, it } from "vitest";
import { FIRST_NAMES, NameAllocator } from "../lib/subagents/names.ts";

describe("subagent human names", () => {
  it("provides 64 unique first names", () => {
    expect(FIRST_NAMES).toHaveLength(64);
    expect(new Set(FIRST_NAMES.map(name => name.toLocaleLowerCase("en-US"))).size).toBe(64);
  });

  it("allocates case-insensitively and falls back through the bounded pool", () => {
    const names = new NameAllocator(["Ada", "Bea"], ["Stone", "Vale"]);
    expect(names.allocate("one")).toBe("Ada");
    expect(names.allocate("two")).toBe("Bea");
    expect(names.allocate("three")).toBe("Ada Stone");
    expect(names.allocate("four")).toBe("Ada Vale");
    expect(names.allocate("five")).toBe("Bea Stone");
    expect(names.allocate("six")).toBe("Bea Vale");
    expect(names.allocate("seven")).toBe("Ada Stone 2");
    expect(names.has("ADA STONE 2")).toBe(true);
  });

  it("releases only the current owner and makes release idempotent", () => {
    const names = new NameAllocator(["Clara"], ["Adler"]);
    const first = names.allocate("first");
    expect(names.release(first, "stale")).toBe(false);
    expect(names.release(first, "first")).toBe(true);
    expect(names.release(first, "first")).toBe(false);
    expect(names.allocate("second")).toBe("Clara");
  });
});
