#!/usr/bin/env bun
import { loadMemoryIndex } from "../extensions/memory-index";
const idx = await loadMemoryIndex();
console.log(`active=${idx.rows.length}`);
