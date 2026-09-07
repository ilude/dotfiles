// Loaded only by the supported CLI smoke in an empty temporary profile.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, realpathSync, symlinkSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

export default async function () {
  const source = process.env.DC_FIXTURE_SOURCE;
  const scratch = process.env.DC_FIXTURE_SCRATCH;
  const marker = process.env.DC_FIXTURE_MARKER;
  try {
    assert(source && scratch && marker);
    globalThis.fetch = async () => { throw new Error("Network disabled in loader fault fixture"); };
    const results = [];
    // Load the actual default extension set, then reload it. No session starts,
    // tool execution, model requests, or copied credentials are involved.
    const liveLoader = new DefaultResourceLoader({ cwd: scratch, agentDir: source, noContextFiles: true, noSkills: true, noThemes: true, noPromptTemplates: true });
    for (const phase of ["startup", "reload"]) {
      await liveLoader.reload();
      const loaded = liveLoader.getExtensions();
      assert.deepEqual(loaded.errors, [], `Default ${phase}: extension load errors`);
      const guard = loaded.extensions.find(extension => extension.commands.has("dc"));
      assert(guard, `Default ${phase}: Damage Control not discovered`);
      assert(loaded.extensions.some(extension => extension.commands.has("commit")), "Existing /commit command must remain registered");
      assert(loaded.extensions.some(extension => extension.path.replaceAll("\\", "/").endsWith("/operator-footer.ts")), "Existing footer must remain loaded");
      let health = "";
      await guard.commands.get("dc").handler("status", { hasUI: true, modelRegistry: { find: () => undefined }, ui: { notify: message => { health = message; } } });
      assert(health.startsWith("damage-control: ready"), health);
      const handler = guard.handlers.get("tool_call")[0];
      assert.equal(await handler({ toolName: "commit_git_review" }, {}), undefined);
      assert(!guard.handlers.has("user_bash"), "Direct operator shell remains exempt");
      results.push(`Default ${phase}: discovered guard ready; /commit and footer coexist; direct operator shell exempt`);
    }
    for (const fault of ["missing-loader", "missing-dependency", "missing-wasm", "malformed-policy", "factory-throw"]) {
      const root = path.join(scratch, fault);
      const profile = path.join(root, "profile");
      const bootstrapDir = path.join(profile, "extensions", "damage-control");
      mkdirSync(bootstrapDir, { recursive: true });
      mkdirSync(path.join(profile, "node_modules"), { recursive: true });
      writeFileSync(path.join(profile, "package.json"), '{"type":"module"}');
      cpSync(path.join(source, "lib"), path.join(profile, "lib"), { recursive: true });
      for (const name of ["damage-control-rules.yaml", "damage-control-settings.json"]) cpSync(path.join(source, name), path.join(profile, name));
      const packages = ["jiti", "yaml", "web-tree-sitter", "tree-sitter-bash", "tree-sitter-powershell", "tree-sitter-python", "tree-sitter-javascript", "tree-sitter-typescript"];
      const link = name => symlinkSync(realpathSync(path.join(source, "node_modules", name)), path.join(profile, "node_modules", name), process.platform === "win32" ? "junction" : "dir");
      for (const name of packages) link(name);
      const bootstrap = path.join(bootstrapDir, "index.js");
      const text = readFileSync(path.join(source, "extensions", "damage-control", "index.js"), "utf8");
      writeFileSync(bootstrap, text);
      if (fault === "missing-loader") rmSync(path.join(profile, "node_modules", "jiti"), { recursive: true });
      if (fault === "missing-dependency") rmSync(path.join(profile, "node_modules", "yaml"), { recursive: true });
      if (fault === "missing-wasm") {
        rmSync(path.join(profile, "node_modules", "tree-sitter-bash"), { recursive: true });
        mkdirSync(path.join(profile, "node_modules", "tree-sitter-bash"));
        writeFileSync(path.join(profile, "node_modules", "tree-sitter-bash", "package.json"), '{"name":"tree-sitter-bash","version":"0.0.0"}');
      }
      if (fault === "malformed-policy") writeFileSync(path.join(profile, "damage-control-rules.yaml"), "version: [invalid");
      if (fault === "factory-throw") writeFileSync(path.join(profile, "lib", "damage-control", "enforcement.ts"), 'export function initialize() { throw new Error("synthetic initialization throw"); }');
      const loader = new DefaultResourceLoader({ cwd: root, agentDir: profile, noContextFiles: true, noSkills: true, noThemes: true, noPromptTemplates: true });
      await loader.reload();
      const loaded = loader.getExtensions();
      assert.deepEqual(loaded.errors, [], `${fault}: factory must retain its registrations`);
      assert.equal(loaded.extensions.length, 1, `${fault}: bootstrap discovered exactly once`);
      const extension = loaded.extensions[0];
      const handler = extension.handlers.get("tool_call")?.[0];
      assert(handler, `${fault}: missing committed guard`);
      const denied = await handler({ toolName: "write", toolCallId: "synthetic", input: { path: "public.txt", content: "inert" } }, { cwd: root });
      assert(denied?.block, `${fault}: required failure allowed a covered call`);
      assert(!extension.handlers.has("user_bash"), "Direct operator shell must remain unintercepted");
      results.push(`${fault}: committed fail-closed guard`);
      // Exercise the real resource-loader cache boundary after restoring only
      // fixture-owned data/dependency links/source.
      {
        if (fault === "missing-loader") link("jiti");
        if (fault === "missing-dependency") link("yaml");
        if (fault === "missing-wasm") { rmSync(path.join(profile, "node_modules", "tree-sitter-bash"), { recursive: true }); link("tree-sitter-bash"); }
        if (fault === "factory-throw") cpSync(path.join(source, "lib", "damage-control", "enforcement.ts"), path.join(profile, "lib", "damage-control", "enforcement.ts"));
        if (fault === "malformed-policy") cpSync(path.join(source, "damage-control-rules.yaml"), path.join(profile, "damage-control-rules.yaml"));
        await loader.reload();
        let health = "";
        await loader.getExtensions().extensions[0].commands.get("dc").handler("status", { hasUI: true, modelRegistry: { find: () => undefined }, ui: { notify: message => { health = message; } } });
        assert(health.startsWith("damage-control: ready"), health);
        results.push(`${fault} repair: actual resource-loader reload ready`);
      }
    }
    writeFileSync(marker, JSON.stringify({ results }));
  } catch (error) {
    writeFileSync(marker, JSON.stringify({ error: String(error), stack: error?.stack }));
  }
}
