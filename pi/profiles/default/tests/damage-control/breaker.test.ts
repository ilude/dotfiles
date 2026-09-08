import { describe, expect, it } from "vitest";
import { Breaker, type WatchdogRequest } from "../../lib/damage-control/breaker.ts";

const request = (command: string): WatchdogRequest => ({ tool: "bash", input: { command }, cwd: "/cwd" });

describe("failed-call watchdog", () => {
  it("allows twelve exact failures and stops attempt thirteen despite changed errors", () => {
    const breaker = new Breaker();
    const call = request("false");
    for (let i = 0; i < 12; i++) {
      expect(breaker.before(call)).toBeUndefined();
      breaker.result(call, true);
    }
    expect(breaker.before(call)).toContain("attempt 13");
  });

  it("never limits repeated successes and success clears a failure streak", () => {
    const breaker = new Breaker();
    const call = request("status");
    for (let i = 0; i < 100; i++) { expect(breaker.before(call)).toBeUndefined(); breaker.result(call, false); }
    for (let i = 0; i < 11; i++) breaker.result(call, true);
    breaker.result(call, false);
    expect(breaker.before(call)).toBeUndefined();
  });

  it("resets on an unrelated call as selected by the operator", () => {
    const breaker = new Breaker();
    const failing = request("false");
    for (let i = 0; i < 12; i++) breaker.result(failing, true);
    expect(breaker.before(request("read-log"))).toBeUndefined();
    expect(breaker.before(failing)).toBeUndefined();
  });

  it("includes cwd in identity and explicit reset clears evidence", () => {
    const breaker = new Breaker();
    const call = request("false");
    for (let i = 0; i < 12; i++) breaker.result(call, true);
    expect(breaker.before({ ...call, cwd: "/other" })).toBeUndefined();
    for (let i = 0; i < 12; i++) breaker.result(call, true);
    breaker.reset();
    expect(breaker.before(call)).toBeUndefined();
  });
});
