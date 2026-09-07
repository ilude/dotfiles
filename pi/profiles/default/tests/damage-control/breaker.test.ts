import { describe, expect, it } from "vitest";
import { adapt } from "../../lib/damage-control/adapters.ts";
import { Breaker, isPolling } from "../../lib/damage-control/breaker.ts";
function request(command: string) { const r = adapt("bash", "id", { command }, "/cwd"); if (r.status !== "adapted") throw new Error(); return r.request; }
describe("bounded repeated-call breaker", () => {
  it("stops before fifth equivalent failure or sixth ordinary unchanged success", () => {
    for (const [failure, threshold] of [[true, 4], [false, 5]] as const) {
      const breaker = new Breaker();
      const r = request("echo unchanged");
      for (let i = 0; i < threshold; i++) { expect(breaker.before(r)).toBeUndefined(); breaker.result(r, { output: "same" }, failure); }
      expect(breaker.before(r)).toContain("change the approach");
    }
  });
  it("allows finite status polling and eventually stops a stuck poll", () => {
    let now = 0;
    const breaker = new Breaker(() => now);
    const r = request("git status --short");
    for (let i = 0; i < 10; i++) { expect(breaker.before(r)).toBeUndefined(); breaker.result(r, "pending", false); now += 1000; }
    now = 120_001;
    expect(breaker.before(r)).toContain("loop stopped");
    breaker.reset(); now = 0;
    for (let i = 0; i < 20; i++) breaker.result(r, "pending", false);
    expect(breaker.before(r)).toBeDefined();
  });
  it("rejects compound mutations and arbitrary reads as polling", () => {
    expect(isPolling(request("git status; rm file"))).toBe(false);
    expect(isPolling(request("cat status.txt"))).toBe(false);
    expect(isPolling(request("docker inspect anything"))).toBe(false);
  });
  it("changed outcomes break the streak; explicit resets clear evidence", () => {
    const breaker = new Breaker(); const r = request("echo test");
    for (let i = 0; i < 4; i++) breaker.result(r, "failure", true);
    breaker.result(r, "different", true);
    expect(breaker.before(r)).toBeUndefined();
    for (let i = 0; i < 4; i++) breaker.result(r, "same", true);
    breaker.reset(); expect(breaker.before(r)).toBeUndefined();
  });
});
