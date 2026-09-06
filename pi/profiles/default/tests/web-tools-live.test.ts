import { expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import webTools from "../extensions/web-tools/index.ts";

const cases = [
  { name: "ordinary", params: { query: "prompt injection OWASP" }, official: false },
  { name: "exact phrase", params: { query: "defenses", exact_phrases: ["prompt injection"] }, official: false },
  { name: "site restricted", params: { query: "prompt injection", site: "owasp.org" }, official: false },
  { name: "official documentation", params: { query: "Mozilla Readability documentation" }, official: true },
];

it.skipIf(process.env.PI_WEB_LIVE !== "1").each(cases)("search → fetch → Luna: $name", async ({ name, params, official }) => {
  const tools = new Map<string, any>();
  webTools({
    registerTool: (tool: any) => tools.set(tool.name, tool),
    exec: async (command: string, args: string[], options: any) => ({ ...await promisify(execFile)(command, args, options), code: 0, killed: false }),
  } as any);
  const signal = AbortSignal.timeout(60_000);
  const search = await tools.get("web_search").execute("live-search", { ...params, num_results: 5 }, signal);
  const text = search.content[0].text;
  const urls = [...text.matchAll(/^URL: (https?:\/\/\S+)/gm)].map((match) => new URL(match[1]));
  const isOwasp = (url: URL) => url.hostname === "owasp.org" || url.hostname.endsWith(".owasp.org");
  const source = urls.find(official
    ? (url) => url.hostname === "github.com" && url.pathname === "/mozilla/readability"
    : (url) => isOwasp(url) || (name === "exact phrase" && (
      url.hostname === "learn.microsoft.com" || url.hostname === "openai.com" ||
      (url.hostname === "github.com" && url.pathname === "/tldrsec/prompt-injection-defenses")
    )));
  expect(source, `Search should find a relevant primary source; returned: ${urls.map((url) => url.href).join(", ")}`).toBeTruthy();
  if (params.site) expect(urls.every(isOwasp)).toBe(true);
  expect(text).not.toContain("SearXNG engine failures");
  expect(["screened", "flagged"]).toContain(search.details.screening);
  const page = await tools.get("web_fetch").execute("live-fetch", { url: source!.href, max_chars: 8000 }, signal);
  expect(page.content[0].text).toMatch(official ? /readability/i : /prompt injection/i);
  expect(["screened", "flagged"]).toContain(page.details.screening);
  console.log(`${name}: search=${search.details.screening}, fetch=${page.details.screening}; review tokens=${(search.usage?.totalTokens ?? 0) + (page.usage?.totalTokens ?? 0)}`);
}, 65_000);
