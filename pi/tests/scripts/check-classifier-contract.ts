#!/usr/bin/env bun
/**
 * V1 cross-task integration check.
 * Shells out to classify.py with three canned prompts and validates each
 * stdout JSON against router-v3-output.schema.json.
 * Exit 0 if all three pass, nonzero otherwise.
 */

import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

const schemaPath = resolve(
  repoRoot,
  "pi/prompt-routing/docs/router-v3-output.schema.json"
);
const classifyScript = resolve(repoRoot, "pi/prompt-routing/classify.py");

const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));

const CANNED_PROMPTS = [
  { label: "trivial", text: "what is the http 404 code for" },
  { label: "ambiguous", text: "review my auth flow" },
  { label: "hard", text: "design a distributed consensus protocol with byzantine tolerance" },
];

const KNOWN_SCHEMA_VERSIONS = new Set(["3.0.0"]);
const VALID_MODEL_TIERS = new Set(["Haiku", "Sonnet", "Opus"]);
const VALID_EFFORTS = new Set(["none", "low", "medium", "high"]);

interface Route {
  model_tier: string;
  effort: string;
}

interface Candidate extends Route {
  confidence: number;
}

interface ClassifierOutput {
  schema_version: string;
  primary: Route;
  candidates: Candidate[];
  confidence: number;
  [key: string]: unknown;
}

function validateOutput(raw: string, label: string): void {
  let parsed: ClassifierOutput;
  try {
    parsed = JSON.parse(raw.trim()) as ClassifierOutput;
  } catch (e) {
    throw new Error(`[${label}] JSON parse failed: ${e}\nRaw: ${raw}`);
  }

  // Required fields
  const required = ["schema_version", "primary", "candidates", "confidence"] as const;
  for (const field of required) {
    if (!(field in parsed)) {
      throw new Error(`[${label}] missing required field: ${field}`);
    }
  }

  // schema_version
  if (!KNOWN_SCHEMA_VERSIONS.has(parsed.schema_version)) {
    throw new Error(
      `[${label}] unknown schema_version: ${parsed.schema_version} (known: ${[...KNOWN_SCHEMA_VERSIONS].join(", ")})`
    );
  }

  // primary route
  if (!VALID_MODEL_TIERS.has(parsed.primary.model_tier)) {
    throw new Error(`[${label}] primary.model_tier invalid: ${parsed.primary.model_tier}`);
  }
  if (!VALID_EFFORTS.has(parsed.primary.effort)) {
    throw new Error(`[${label}] primary.effort invalid: ${parsed.primary.effort}`);
  }

  // candidates array
  if (!Array.isArray(parsed.candidates) || parsed.candidates.length < 1) {
    throw new Error(`[${label}] candidates must be non-empty array`);
  }
  for (const c of parsed.candidates) {
    if (!VALID_MODEL_TIERS.has(c.model_tier)) {
      throw new Error(`[${label}] candidate.model_tier invalid: ${c.model_tier}`);
    }
    if (!VALID_EFFORTS.has(c.effort)) {
      throw new Error(`[${label}] candidate.effort invalid: ${c.effort}`);
    }
    if (typeof c.confidence !== "number" || c.confidence < 0 || c.confidence > 1) {
      throw new Error(`[${label}] candidate.confidence out of range: ${c.confidence}`);
    }
  }

  // top-level confidence
  if (
    typeof parsed.confidence !== "number" ||
    parsed.confidence < 0 ||
    parsed.confidence > 1
  ) {
    throw new Error(`[${label}] confidence out of range: ${parsed.confidence}`);
  }
}

let allPassed = true;

for (const { label, text } of CANNED_PROMPTS) {
  const result = spawnSync("python", [classifyScript, text], {
    encoding: "utf-8",
    cwd: resolve(repoRoot, "pi/prompt-routing"),
  });

  if (result.status !== 0) {
    console.error(`[${label}] classify.py exited ${result.status}`);
    if (result.stderr) console.error(result.stderr);
    allPassed = false;
    continue;
  }

  try {
    validateOutput(result.stdout, label);
    console.log(`[${label}] ok -- ${result.stdout.trim()}`);
  } catch (e) {
    console.error(`[${label}] FAIL: ${e}`);
    allPassed = false;
  }
}

if (!allPassed) {
  process.exit(1);
}
console.log("All 3 canned prompts validated against router-v3-output.schema.json");
