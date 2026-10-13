#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profile = resolve(root, "pi/profiles/default");
// Preserve the profile link, not its version-specific pnpm store target.
const packageDir = resolve(profile, "node_modules/@earendil-works/pi-coding-agent");
const destination = resolve(profile, ".herdr-plugin");
const template = readFileSync(resolve(root, "pi/herdr/herdr-plugin.toml.in"), "utf8");
const command = JSON.stringify([process.execPath, resolve(root, "scripts/pi-herdr-launch.mjs"), packageDir]);
mkdirSync(destination, { recursive: true });
writeFileSync(resolve(destination, "herdr-plugin.toml"), template.replace("@COMMAND@", command));
const linked = spawnSync(process.env.HERDR_BIN_PATH || "herdr", ["plugin", "link", destination], { encoding: "utf8", shell: false, windowsHide: true, timeout: 10_000 });
if (linked.error || linked.status !== 0) {
  console.error(linked.error?.message || linked.stderr || linked.stdout);
  process.exitCode = 1;
} else console.log(`Linked local.pi from ${destination}. Rerun setup after moving the checkout or updating Node. Pi upgrades follow the profile dependency link automatically.`);
