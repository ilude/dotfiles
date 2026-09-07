import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { curlResponse } from "../extensions/web-tools/curl.js";
const servers: Server[] = []; const directories: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
async function fixture() {
  const server = createServer((req, res) => {
    if (req.url === "/slow") return;
    if (req.url === "/metadata") { res.writeHead(302, { location: "http://169.254.169.254/" }); res.end(); return; }
    if (req.url === "/large") { res.write("x".repeat(2 * 1024 * 1024 + 1)); res.end(); return; }
    res.setHeader("content-type", "text/html");
    res.end(`<html><title>Curl fixture</title><main>Literal path: ${req.url}</main></html>`);
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
it("uses native curl with literal arguments, without following redirects implicitly", async () => {
  const base = await fixture(); const path = "/?literal=$(echo%20not-executed)&a=1;2";
  const reply = await curlResponse(base + path, AbortSignal.timeout(2000), 1500);
  expect(reply.status).toBe(200); expect(reply.text).toContain(path);
  const redirect = await curlResponse(base + "/metadata", AbortSignal.timeout(2000), 1500);
  expect(redirect.status).toBe(302); expect(redirect.headers.get("location")).toBe("http://169.254.169.254/");
});
it("bounds output, time, and missing-binary failures", async () => {
  const base = await fixture();
  await expect(curlResponse(base, AbortSignal.timeout(2000), 1000, "missing-pi-curl-fixture-executable")).rejects.toThrow(/unavailable/);
  await expect(curlResponse(base + "/slow", AbortSignal.timeout(2000), 50)).rejects.toThrow(/failed/);
  await expect(curlResponse(base + "/large", AbortSignal.timeout(2000), 1500)).rejects.toThrow(/byte limit/);
});
it("feeds transport-failure curl recovery through the existing extractor and validates redirected metadata", async () => {
  const base = await fixture();
  const directory = mkdtempSync(join(tmpdir(), "pi-curl-test-")); directories.push(directory);
  const preload = join(directory, "node-failure.mjs");
  const script = fileURLToPath(new URL("../extensions/web-tools/fetch.js", import.meta.url));
  const run = (url: string) => promisify(execFile)(process.execPath, ["--import", pathToFileURL(preload).href, script, url], { timeout: 10000 });
  for (const failure of [
    'globalThis.fetch = async () => { throw new TypeError("Synthetic Node transport failure"); };',
    'globalThis.fetch = async () => new Response(new ReadableStream({ start(c) { c.error(new TypeError("Synthetic body transport failure")); } }));',
  ]) {
    writeFileSync(preload, failure);
    const result = await run(base + "/article");
    expect(result.stdout).toContain("Transport: native curl"); expect(result.stdout).toContain("Literal path: /article");
  }
  await expect(run(base + "/metadata")).rejects.toThrow(/Cloud metadata endpoints are not allowed/);
});
