/**
 * Behavioral tests for probe-thinking-level.ts (T4 Phase 2 Wave 2).
 *
 * AC #5 requires BOTH directions tested:
 *   - probe with a known thinking-level signal returns the parsed level
 *     (e.g. "minimal", "high", or whatever the probe captures from the
 *     getThinkingLevel API).
 *   - probe with no signal (no setThinkingLevel/getThinkingLevel API
 *     present) returns the documented no-signal sentinels.
 */

import { describe, expect, it, vi } from "vitest";
import { createMockPi, createMockCtx } from "./helpers/mock-pi";
import probeExtension, { runThinkingLevelProbe } from "../extensions/probe-thinking-level";

describe("runThinkingLevelProbe -- direct invocation", () => {
	it("returns the parsed level when setThinkingLevel + getThinkingLevel are present", () => {
		// Simulate a Pi instance with a working thinking-level API.
		// getThinkingLevel returns whatever was last set, mimicking the host.
		let currentLevel = "off";
		const pi = createMockPi() as any;
		pi.setThinkingLevel = vi.fn((level: string) => {
			currentLevel = level;
		});
		pi.getThinkingLevel = vi.fn(() => currentLevel);

		const result = runThinkingLevelProbe(pi);

		expect(result.hasSet).toBe(true);
		expect(result.hasGet).toBe(true);
		expect(result.before).toBe("off");
		expect(result.afterMinimal).toBe("minimal");
		expect(result.afterXhigh).toBe("xhigh");
		expect(result.report).toContain("probe: hasSetThinkingLevel=true");
		expect(result.report).toContain('probe: setThinkingLevel("minimal") OK, now=minimal');
		expect(result.report).toContain('probe: setThinkingLevel("xhigh") OK, clamped_to=xhigh');
	});

	it("documents the no-signal sentinel (no setter/getter present)", () => {
		// Pi instance WITHOUT setThinkingLevel/getThinkingLevel methods.
		// The probe must report hasSet=false, hasGet=false, and afterMinimal /
		// afterXhigh stay null (the documented no-signal sentinel) because the
		// probe never invokes a missing setter.
		const pi = createMockPi() as any;
		// Explicitly delete any inherited methods so typeof checks return "undefined".
		delete pi.setThinkingLevel;
		delete pi.getThinkingLevel;

		const result = runThinkingLevelProbe(pi);

		expect(result.hasSet).toBe(false);
		expect(result.hasGet).toBe(false);
		expect(result.before).toBe("(no getter)");
		expect(result.afterMinimal).toBeNull();
		expect(result.afterXhigh).toBeNull();
		expect(result.report).toContain("probe: hasSetThinkingLevel=false");
		expect(result.report).toContain("probe: hasGetThinkingLevel=false");
		expect(result.report).toContain("probe: before=(no getter)");
		// No setThinkingLevel call lines should appear when the setter is absent.
		expect(result.report).not.toContain('setThinkingLevel("minimal")');
		expect(result.report).not.toContain('setThinkingLevel("xhigh")');
	});
});

describe("probe-thinking-level extension -- session_start integration", () => {
	it("registers a session_start hook that calls setStatus and notify", async () => {
		const pi = createMockPi() as any;
		pi.setThinkingLevel = vi.fn();
		pi.getThinkingLevel = vi.fn(() => "low");

		probeExtension(pi);
		const hooks = pi._getHook("session_start");
		expect(hooks.length).toBeGreaterThan(0);

		const setStatus = vi.fn();
		const notify = vi.fn();
		const ctx = {
			...createMockCtx(),
			ui: { ...createMockCtx().ui, setStatus, notify },
		};

		await hooks[0].handler({}, ctx as any);

		expect(setStatus).toHaveBeenCalledWith("probe-thinking", "probe: ok");
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("probe: hasSetThinkingLevel=true"),
			"info",
		);
	});

	it("status reports 'probe: missing' when the thinking-level API is absent", async () => {
		const pi = createMockPi() as any;
		delete pi.setThinkingLevel;
		delete pi.getThinkingLevel;

		probeExtension(pi);
		const hooks = pi._getHook("session_start");

		const setStatus = vi.fn();
		const notify = vi.fn();
		const ctx = {
			...createMockCtx(),
			ui: { ...createMockCtx().ui, setStatus, notify },
		};

		await hooks[0].handler({}, ctx as any);

		expect(setStatus).toHaveBeenCalledWith("probe-thinking", "probe: missing");
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("probe: hasSetThinkingLevel=false"),
			"info",
		);
	});
});
