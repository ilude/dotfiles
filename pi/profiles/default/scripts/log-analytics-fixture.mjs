import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { once } from "node:events";

const PROFILES = ["default", "legacy"];
const FILES_PER_PROFILE = 8;
const SMALL_RECORDS_PER_FILE = 600;
const LARGE_RECORDS_PER_FILE = 400;
const SMALL_TARGET_BYTES = 10 * 1024 * 1024;
const LARGE_TARGET_BYTES = 620 * 1024 * 1024;
const RECORD_BYTES = { small: 1_000, large: 100_000 };

function recordFor(profile, fileIndex, n, recordsPerFile, padding) {
  const recent = n < 2;
  const isFailure = n === 1;
  const isTarget = profile === "default" && fileIndex === 0 && n === 3;
  const isFeedback = n === (recordsPerFile - 1);
  const isGap = n === (recordsPerFile - 2);
  const role = n === 0 ? "toolCall" : n % 2 === 0 ? "toolResult" : n === 1 ? "toolResult" : "assistant";
  const text = isTarget ? "early-target: exact generated lookup " : isFeedback ? "feedback-marker: excellent, no profanity " : isFailure ? "synthetic recorded failure " : "synthetic tool output ";
  const contentBytes = n < 3 ? Math.min(padding, 2_000) : padding;
  const message = {
    role,
    toolName: role === "toolCall" || role === "toolResult" ? "fixture_tool" : undefined,
    toolCallId: role === "toolCall" || role === "toolResult" ? `join-${n}` : undefined,
    isError: role === "toolResult" ? isFailure : undefined,
    content: [{ type: "text", text: `${text}${"x".repeat(contentBytes - text.length)}` }],
  };
  for (const key of Object.keys(message)) if (message[key] === undefined) delete message[key];
  return {
    type: "message",
    id: `${profile}-${fileIndex}-${n}`,
    ...(isGap ? {} : { timestamp: recent ? "2026-09-03T12:00:00Z" : isFeedback ? "2026-03-31T12:00:00Z" : "2026-02-01T12:00:00Z" }),
    message,
  };
}

async function writeLine(stream, line) {
  if (stream.write(`${line}\n`)) return;
  await once(stream, "drain");
}

async function writeSession(file, profile, fileIndex, recordsPerFile, recordBytes) {
  const sessionId = `fixture-${String(fileIndex).padStart(2, "0")}`;
  const header = { type: "session", version: 3, id: sessionId, cwd: "/synthetic/log-analytics", timestamp: "2020-01-01T00:00:00Z" };
  const stream = createWriteStream(file, { encoding: "utf8" });
  await writeLine(stream, JSON.stringify(header));
  for (let n = 0; n < recordsPerFile; n++) {
    const record = recordFor(profile, fileIndex, n, recordsPerFile, recordBytes);
    // Keep the generated output large and realistic while preserving native JSON shape.
    const raw = JSON.stringify(record);
    const desired = n < 3 ? 2_000 : recordBytes;
    if (Buffer.byteLength(raw) < desired) {
      const message = record.message;
      const current = message.content[0].text;
      message.content[0].text = current + "x".repeat(desired - Buffer.byteLength(raw));
    }
    await writeLine(stream, JSON.stringify(record));
  }
  await new Promise((resolve, reject) => { stream.end(error => error ? reject(error) : resolve()); });
  const stat = await fs.stat(file);
  return { profile, sessionId, file, bytes: stat.size, records: recordsPerFile + 1, failures: 1, feedback: 1, timestampGaps: 1 };
}

export async function generateFixture(root, size = "small") {
  if (size !== "small" && size !== "large") throw new Error(`unknown fixture size: ${size}`);
  const target = size === "small" ? SMALL_TARGET_BYTES : LARGE_TARGET_BYTES;
  const recordsPerFile = size === "small" ? SMALL_RECORDS_PER_FILE : LARGE_RECORDS_PER_FILE;
  const recordBytes = RECORD_BYTES[size];
  const base = path.join(root, size);
  const registry = { active: "default", roots: { default: path.join(base, "default"), legacy: path.join(base, "legacy") } };
  const files = [];
  for (const profile of PROFILES) {
    const sessions = path.join(registry.roots[profile], "sessions");
    await fs.mkdir(sessions, { recursive: true });
    for (let fileIndex = 0; fileIndex < FILES_PER_PROFILE; fileIndex++) {
      const sessionId = `fixture-${String(fileIndex).padStart(2, "0")}`;
      const file = path.join(sessions, `${sessionId}.jsonl`);
      files.push(await writeSession(file, profile, fileIndex, recordsPerFile, recordBytes));
    }
  }
  const totalRecords = files.reduce((sum, file) => sum + file.records, 0);
  const expected = {
    totalRecords,
    byProfile: Object.fromEntries(PROFILES.map(profile => [profile, files.filter(file => file.profile === profile).reduce((sum, file) => sum + file.records, 0)])),
    failures: files.length,
    feedback: files.length,
    timestampGaps: files.length,
    joinIds: Math.ceil(recordsPerFile / 2) + 1,
    crossJoinRows: (recordsPerFile + 1) ** 2 * FILES_PER_PROFILE,
    targetBytes: target,
    recordsPerFile,
  };
  return { size, targetBytes: target, registry, files, expected, actualBytes: files.reduce((sum, file) => sum + file.bytes, 0) };
}

export function cacheDirectory(registry) { return path.join(registry.roots.default, ".analytics-state"); }
export async function clearFixtureCache(registry) { await fs.rm(cacheDirectory(registry), { recursive: true, force: true }); }
export async function fixtureCacheEntries(registry) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(cacheDirectory(registry), "metadata.json"), "utf8"));
    return Array.isArray(value.entries) ? value.entries.length : 0;
  } catch { return 0; }
}
export const fixtureConstants = { profiles: PROFILES, filesPerProfile: FILES_PER_PROFILE, smallTargetBytes: SMALL_TARGET_BYTES, largeTargetBytes: LARGE_TARGET_BYTES };
