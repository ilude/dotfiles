import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { lock } from "proper-lockfile";

export const STATE_SCHEMA_VERSION = 1;
export const LOCK_OPTIONS = Object.freeze({
  realpath: false,
  stale: 10_000,
  update: 5_000,
  retries: 0,
});

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function nonblank(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertName(name) {
  nonblank(name, "baseline name");
  if (!NAME_PATTERN.test(name) || name === "." || name === "..") {
    throw new Error("baseline name must be a safe identifier");
  }
}

function canonicalProspective(target) {
  const missing = [];
  let current = path.resolve(target);
  while (true) {
    try {
      return path.join(realpathSync.native(current), ...missing.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

function contained(target, root) {
  const resolvedRoot = path.resolve(root);
  const canonicalRoot = canonicalProspective(resolvedRoot);
  if (canonicalRoot !== resolvedRoot) return false;
  const canonicalTarget = canonicalProspective(target);
  const relative = path.relative(canonicalRoot, canonicalTarget);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function statePathFor(commonDir, baselineName) {
  assertName(baselineName);
  const root = path.resolve(nonblank(commonDir, "Git common directory"), "test-review");
  return path.join(root, baselineName, "state.json");
}

function assertCanonicalStatePath(statePath, commonDir, baselineName) {
  const expected = statePathFor(commonDir, baselineName);
  try {
    if (lstatSync(expected).isSymbolicLink()) {
      throw new Error("state path must not be a symbolic link");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const reviewRoot = path.resolve(commonDir, "test-review");
  if (path.resolve(statePath) !== path.resolve(expected) || !contained(statePath, reviewRoot) || canonicalProspective(expected) !== path.resolve(expected)) {
    throw new Error("state path is outside the canonical test-review root");
  }
  return expected;
}

function assertIdentity(state, identity) {
  object(identity, "identity");
  for (const field of ["baselineName", "repositoryId", "scopeId", "ownerId"]) {
    nonblank(identity[field], `identity.${field}`);
    if (state[field] !== identity[field]) throw new Error(`state ${field} mismatch`);
  }
}

function assertState(state, identity) {
  object(state, "state");
  if (state.schemaVersion !== STATE_SCHEMA_VERSION) throw new Error("unsupported state schema");
  assertIdentity(state, identity);
  nonblank(state.baselineName, "state.baselineName");
  for (const field of ["inventory", "units", "evidence", "measurements", "findings", "dispositions", "commands", "gaps", "comparisons"]) {
    if (!Array.isArray(state[field])) throw new Error(`state ${field} must be an array`);
  }
  return state;
}

async function withLock(statePath, callback) {
  const release = await lock(statePath, LOCK_OPTIONS);
  let operationError;
  try {
    return await callback();
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await release();
    } catch (releaseError) {
      if (operationError === undefined) throw releaseError;
    }
  }
}

async function replaceFile(temporary, statePath) {
  await rename(temporary, statePath);
}

async function atomicWrite(statePath, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = path.join(path.dirname(statePath), `.${path.basename(statePath)}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.close();
    await replaceFile(temporary, statePath);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function initializeState({ commonDir, baselineName, repositoryId, scopeId, ownerId, state = {} }) {
  const statePath = assertCanonicalStatePath(statePathFor(commonDir, baselineName), commonDir, baselineName);
  nonblank(repositoryId, "repositoryId");
  nonblank(scopeId, "scopeId");
  nonblank(ownerId, "ownerId");
  await mkdir(path.dirname(statePath), { recursive: true });
  assertCanonicalStatePath(statePath, commonDir, baselineName);
  return withLock(statePath, async () => {
    try {
      await stat(statePath);
      throw new Error("baseline state already exists");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const next = {
      inventory: [],
      units: [],
      evidence: [],
      measurements: [],
      findings: [],
      dispositions: [],
      commands: [],
      gaps: [],
      comparisons: [],
      ...state,
      schemaVersion: STATE_SCHEMA_VERSION,
      baselineName,
      repositoryId,
      scopeId,
      ownerId,
      status: state.status ?? "active",
    };
    assertState(next, { baselineName, repositoryId, scopeId, ownerId });
    await atomicWrite(statePath, next);
    return next;
  });
}

export async function readState({ statePath, commonDir, baselineName, repositoryId, scopeId, ownerId }) {
  const canonical = assertCanonicalStatePath(statePath, commonDir, baselineName);
  const parsed = JSON.parse(await readFile(canonical, "utf8"));
  return assertState(parsed, { baselineName, repositoryId, scopeId, ownerId });
}

export async function updateState({ statePath, commonDir, baselineName, repositoryId, scopeId, ownerId, update }) {
  if (typeof update !== "function") throw new Error("update must be a function");
  const canonical = assertCanonicalStatePath(statePath, commonDir, baselineName);
  return withLock(canonical, async () => {
    const current = assertState(JSON.parse(await readFile(canonical, "utf8")), { baselineName, repositoryId, scopeId, ownerId });
    const next = object(await update(structuredClone(current)), "updated state");
    for (const field of ["baselineName", "repositoryId", "scopeId", "ownerId"]) {
      if (next[field] !== current[field]) throw new Error(`state ${field} is immutable`);
    }
    next.schemaVersion = STATE_SCHEMA_VERSION;
    assertState(next, { baselineName, repositoryId, scopeId, ownerId });
    await atomicWrite(canonical, next);
    return next;
  });
}
