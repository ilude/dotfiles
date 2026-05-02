#!/usr/bin/env bun
import { loadMemoryIndex } from "../lib/memory-index";
const idx = await loadMemoryIndex();
console.log(`active=${idx.rows.length}`);
