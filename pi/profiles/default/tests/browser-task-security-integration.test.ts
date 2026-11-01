import { describe, expect, it } from "vitest";
import { browserFillExpression, browserScrollExpression, BrowserControlError } from "../lib/browser-control.js";

describe("bounded browser page actions", () => {
  it("builds a native fill expression that dispatches input and change without a policy dependency", () => {
    const expression = browserFillExpression("#field", "synthetic value");
    expect(expression).toContain("document.querySelectorAll(\"#field\")");
    expect(expression).toContain("setter.call(element, \"synthetic value\")");
    expect(expression).toContain("new InputEvent('input'");
    expect(expression).toContain("new Event('change'");
  });

  it("keeps scroll movement bounded and scoped to a selected element", () => {
    const expression = browserScrollExpression({ scroll_mode: "by", selector: "#pane", delta_y: 1200 });
    expect(expression).toContain("document.querySelectorAll(selector)");
    expect(expression).toContain("Math.max(-2000, Math.min(2000, value))");
    expect(() => browserScrollExpression({ delta_y: 2001 })).toThrow(BrowserControlError);
  });
});
