import { afterEach, expect, it, vi } from "vitest";
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile, mkdir: vi.fn(), writeFile: vi.fn() }));
import { checkReleases, RELEASE_CHECK_INTERVAL, releaseLag, releaseUrl } from "../lib/release-indicators.ts";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("reuses a fresh shared cache without fetching", async () => {
  const latest = { pi: ["1.3.0"], herdr: ["0.9.5"] };
  readFile.mockResolvedValue(JSON.stringify({ checkedAt: Date.now(), latest }));
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(await checkReleases(new AbortController().signal)).toEqual(latest);
  expect(fetch).not.toHaveBeenCalled();
});

it("uses a four-hour release check interval", () => {
  expect(RELEASE_CHECK_INTERVAL).toBe(4 * 60 * 60 * 1000);
});

it.each([
  ["1.2.3", ["1.2.3", "1.2.4", "1.3.0"], 2],
  ["v1.2.3", ["1.2.3", "1.2.4"], 1],
  ["1.2.3-preview.1", ["1.2.3", "1.2.4"], 2],
  ["1.2.3", ["1.2.3"], 0],
  ["1.2.3", undefined, undefined],
] as const)("counts stable releases newer than %s", (version, releases, expected) => {
  expect(releaseLag(version, releases ? [...releases] : undefined)).toBe(expected);
});

it("links outdated labels to the product release notes", () => {
  expect(releaseUrl("pi", "1.2.3", "1.2.4")).toBe("https://github.com/earendil-works/pi/blob/v1.2.4/packages/coding-agent/CHANGELOG.md");
  expect(releaseUrl("herdr", "0.9.3")).toBe("https://github.com/herdrdev/herdr/releases/latest");
});
