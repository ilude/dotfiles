#!/usr/bin/env bun
import { rebuildMemoryIndex, fingerprintPath } from "../lib/memory-index";
const idx = await rebuildMemoryIndex();
console.log(`memory-index rebuilt active=${idx.rows.length} fingerprint=${fingerprintPath()}`);
