import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Fresh-process validation entrypoint: exercises Pi's actual extension loader and
// model catalog without credentials, sessions, network access, or a live parent.
const profile = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = path.join(profile, "node_modules/@earendil-works/pi-coding-agent/package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const cli = path.resolve(path.dirname(manifestPath), manifest.bin.pi);
const extension = path.join(profile, "extensions/bedrock/provider.ts");
const scratch = await mkdtemp(path.join(tmpdir(), "pi-bedrock-child-loader-"));
try {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [cli, "--offline", "--no-session", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-tools", "--extension", extension, "--list-models"], {
    cwd: scratch,
    env: { ...process.env, PI_CODING_AGENT_DIR: path.join(scratch, "profile"), AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: "", AWS_SESSION_TOKEN: "" },
    timeout: 20_000,
    maxBuffer: 2_000_000,
  });
  assert.match(stdout, /^bedrock-mantle\s+anthropic\.claude-/m, `provider models absent\n${stderr}`);
  console.log(`Pi ${manifest.version}: child-only Bedrock provider loaded through the real CLI offline.`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
