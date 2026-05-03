#!/usr/bin/env bun
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadMemoryIndex, GLOBAL_LAYER_REPO_ID, indexDir } from "../lib/memory-index";
import { chainTail } from "../lib/memory-retrieve";
import { cluster, qualifies, formatCandidates } from "../lib/memory-promote";

function homeDir(): string { return process.env.HOME || process.env.USERPROFILE || os.homedir(); }

const idx = await loadMemoryIndex();

// Filter: exclude policy rows, exclude global layer, then collapse superseded chains.
const eligible = chainTail(
  idx.rows.filter(r => r.kind !== "policy" && r.repo_id !== GLOBAL_LAYER_REPO_ID)
);

const clusters = cluster(eligible).filter(c => qualifies(c));

const scanIso = new Date().toISOString();
const markdown = formatCandidates(
  cluster(eligible), // pass all clusters; formatCandidates filters qualifying internally
  scanIso,
  eligible.length
);

const outDir = path.join(homeDir(), ".pi", "agent", "index");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "policy-candidates.md");
fs.writeFileSync(outPath, markdown, "utf8");

console.log(`promote-scan candidates=${clusters.length} path=${outPath}`);
