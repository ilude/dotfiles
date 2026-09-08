#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function trimTrailingWhitespace(file) {
  const input = await readFile(file);
  if (input.includes(0)) throw new Error(`Refusing binary file: ${file}`);
  const output = Buffer.from(input.toString("utf8").replace(/[\t ]+(?=\r?\n|$)/g, ""), "utf8");
  if (!output.equals(input)) await writeFile(file, output);
  return !output.equals(input);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length < 3) throw new Error("Usage: trim-trailing-whitespace.mjs <reported-path> [...]");
  for (const file of process.argv.slice(2)) await trimTrailingWhitespace(file);
}
