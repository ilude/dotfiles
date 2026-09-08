import { afterEach, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { trimTrailingWhitespace } from "../commands/commit/trim-trailing-whitespace.mjs";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
function fixture(bytes: Buffer | string) { const dir = mkdtempSync(join(tmpdir(), "commit-ws-")); dirs.push(dir); const file = join(dir, "file"); writeFileSync(file, bytes); return file; }

it.each([
  ["LF", "one  \ntwo\t\n", "one\ntwo\n"],
  ["CRLF", "one  \r\ntwo\t\r\n", "one\r\ntwo\r\n"],
  ["no final newline", "one \nlast\t", "one\nlast"],
])("repairs %s without changing line endings", async (_name, input, expected) => {
  const file = fixture(input); expect(await trimTrailingWhitespace(file)).toBe(true); expect(readFileSync(file, "utf8")).toBe(expected);
});
it("does not rewrite clean files", async () => { const file = fixture("clean\n"); expect(await trimTrailingWhitespace(file)).toBe(false); });
it("rejects binary files", async () => { await expect(trimTrailingWhitespace(fixture(Buffer.from([1, 0, 2])))).rejects.toThrow("binary"); });
