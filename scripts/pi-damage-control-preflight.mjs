#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function fail(message, exitCode = 1) {
  process.stderr.write(`pp: damage-control preflight failed: ${message}\n`);
  process.exitCode = exitCode;
}

const [bootstrapArgument, ...extraArguments] = process.argv.slice(2);
if (!bootstrapArgument || extraArguments.length > 0) {
  fail("usage: node pi-damage-control-preflight.mjs <bootstrap.js>", 2);
} else {
  const bootstrapPath = resolve(bootstrapArgument);
  try {
    const stat = statSync(bootstrapPath);
    if (!stat.isFile()) {
      fail(`bootstrap is not a file: ${bootstrapPath}`);
    } else {
      // Pass source on stdin with an explicit module type. Node 25 can accept
      // incomplete ESM in a standalone .js file during path-based --check when
      // no package.json ancestor declares its type.
      const checked = spawnSync(process.execPath, ["--input-type=module", "--check"], {
        encoding: "utf8",
        input: readFileSync(bootstrapPath),
        windowsHide: true,
      });
      if (checked.error) {
        fail(`could not check bootstrap syntax: ${checked.error.message}`);
      } else if (checked.status !== 0) {
        const detail = `${checked.stderr || checked.stdout || "invalid JavaScript"}`
          .replace(/[\r\n]+/g, " ")
          .trim()
          .slice(0, 500);
        fail(`bootstrap has invalid JavaScript syntax: ${detail}`);
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`bootstrap is unavailable: ${detail}`);
  }
}
