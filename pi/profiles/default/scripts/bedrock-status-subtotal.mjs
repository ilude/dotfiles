#!/usr/bin/env node
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cacheFile = path.join(repo, "claude", "cache", "bedrock-status-subtotal.json");
const month = process.argv[2] ?? new Date().toISOString().slice(0, 7);
async function signature(file) {
  try {
    const stat = await fs.stat(file);
    return [stat.size, stat.mtimeMs];
  } catch (error) {
    if (error.code === "ENOENT") return [0, 0];
    throw error;
  }
}
try {
  process.env.PI_CODING_AGENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { summarize, ledgerPath, baselinePath } = await import("../lib/bedrock/ledger.ts");
  const profile = process.env.PI_CODING_AGENT_DIR;
  const inputs = {
    ledger: await signature(ledgerPath()), baseline: await signature(baselinePath()),
    pricing: await signature(path.join(profile, "bedrock-pricing.json")),
    catalog: await signature(path.join(profile, "lib", "bedrock", "pricing.ts")),
    dependencies: await signature(path.join(profile, "pnpm-lock.yaml")),
    helper: await signature(fileURLToPath(import.meta.url)),
  };
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, "utf8"));
    if (cached.month === month && JSON.stringify(cached.inputs) === JSON.stringify(inputs)) {
      process.stdout.write(JSON.stringify(cached.subtotal));
      process.exit(0);
    }
  } catch {}
  const summary = await summarize(month);
  const subtotal = { month, cost: summary.cost, baseline: summary.baseline, unpriced: summary.unpriced > 0 };
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  const temp = `${cacheFile}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ month, inputs, subtotal }), { mode: 0o600 });
  await fs.rename(temp, cacheFile);
  process.stdout.write(JSON.stringify(subtotal));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
