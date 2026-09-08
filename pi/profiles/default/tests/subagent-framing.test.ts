import { describe, expect, it } from "vitest";
import { JsonLines } from "../lib/subagents/framing.ts";

describe("subagent LF framing", () => {
  it("preserves split UTF-8 and multiple frames", () => {
    const values: unknown[] = [];
    const parser = new JsonLines(value => values.push(value));
    const bytes = Buffer.from('{"text":"é"}\n{}\n');
    for (const byte of bytes) parser.push(Buffer.from([byte]));
    parser.end();
    expect(values).toEqual([{ text: "é" }, {}]);
  });
  it("does not treat CR as a delimiter", () => {
    const values: unknown[] = [];
    const parser = new JsonLines(value => values.push(value));
    parser.push(Buffer.from('{}\r'));
    expect(values).toEqual([]);
    parser.push(Buffer.from('\n'));
    expect(values).toEqual([{}]);
  });
  it("rejects oversized, blank, malformed and incomplete frames", () => {
    expect(() => new JsonLines(() => {}, 2).push(Buffer.from('123'))).toThrow(/limit/);
    expect(() => new JsonLines(() => {}, 256 * 1024).push(Buffer.from(JSON.stringify({ type: 'native-event', payload: 'x'.repeat(300000) }) + '\n'))).toThrow(/limit/);
    expect(() => new JsonLines(() => {}).push(Buffer.from('\n'))).toThrow(/Empty/);
    expect(() => new JsonLines(() => {}).push(Buffer.from('bad\n'))).toThrow();
    const parser = new JsonLines(() => {});
    parser.push(Buffer.from('{}'));
    expect(() => parser.end()).toThrow(/Incomplete/);
  });
});
