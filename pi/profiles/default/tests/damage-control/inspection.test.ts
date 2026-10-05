import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyInspection } from "../../lib/damage-control/inspection.ts";
import { analyzeShell } from "../../lib/damage-control/shell.ts";
import type { AnalysisDependencies, CreationFacts } from "../../lib/damage-control/analysis.ts";
import type { Policy, Settings, ToolRequest } from "../../lib/damage-control/types.ts";
import type { PathFacts } from "../../lib/damage-control/paths.ts";

const policy = { version: 1, commands: [], paths: { zeroAccess: [], exclusions: [], readOnly: [], noDelete: [], writeConfirm: [], readConfirm: [], generated: [], scratch: [], integrity: [] } } satisfies Policy;
const settings = { version: 1, judge: { enabled: false, provider: "openai-codex", model: "luna", reasoning: "high", deadlineMs: 1000, retries: 0 }, parseBudgetMs: 1000 } satisfies Settings;
const dependencies: AnalysisDependencies = { policy, settings };
const facts: PathFacts = { platform: process.platform === "win32" ? "win32" : "posix", cwd: process.cwd(), repo: process.cwd(), profile: process.cwd(), realpath, home: process.env.HOME ?? process.cwd() };
const context: CreationFacts = { wasCreated: () => false, wasDockerCreated: () => false };
function request(language: "bash" | "powershell", command: string, cwd = facts.cwd): ToolRequest {
  return { callId: "test", cwd, text: command, tool: language, language, input: { command } };
}
async function classify(language: "bash" | "powershell", command: string) {
  return classifyInspection(request(language, command), facts, context, dependencies);
}

describe("complete shell inspection with actual grammars and inert inputs", () => {
  it.each([
    ["bash", "cat README.md | grep inspection"],
    ["powershell", "Get-Content README.md | Select-String inspection"],
    ["bash", "git -C repo status --short"],
    ["bash", "git diff --stat; git log --oneline -n 3; git show HEAD"],
    ["bash", "kubectl --namespace default get pods"],
    ["powershell", "kubectl --context staging -n app describe pod example"],
    ["bash", "kubectl -n app logs example --tail=20"],
    ["bash", "aws --profile test sts get-caller-identity"],
    ["powershell", "aws --region us-east-1 ec2 describe-instances"],
    ["bash", "aws eks list-clusters --region us-east-1"],
    ["bash", "printf '%s\\n' 'git commit; kubectl delete pod x; rm file'"],
    ["powershell", "Select-String -Pattern 'Remove-Item; git commit' -Path README.md"],
    ["bash", "printf x 1>&2"],
    ["powershell", "Get-Content README.md 2>&1"],
    ["bash", "cd repo; cat README.md"],
    ["bash", "x=README.md; cat \"$x\""],
    ["powershell", "$x = 'README.md'; Get-Content $x"],
    ["bash", "cat file | wc -l"],
    ["bash", "find . -name '*.ts' -print"],
    ["bash", "find . -name '-delete' -print"],
    ["bash", "git log --format='--output=example'"],
  ] as const)("observational: %s %s", async (language, command) => {
    const result = await classify(language, command);
    expect(result.route, JSON.stringify(result)).toBe("observation");
  });

  it.each([
    ["bash", "cat file; rm file"],
    ["powershell", "Get-Content file; Remove-Item file"],
    ["bash", "printf x > output.txt"],
    ["bash", "printf x >& output.txt"],
    ["bash", "cat file | tee copy.txt"],
    ["powershell", "Get-Content file | Out-File output.txt"],
    ["powershell", "Get-Content file > output.txt"],
    ["bash", "kubectl --context staging -n app delete pod x"],
    ["bash", "aws --profile test ec2 terminate-instances --instance-ids i-test"],
    ["bash", "git status; git commit -m x"],
    ["bash", "git diff --output=patch.txt"],
    ["bash", "curl -o output.txt https://example.invalid"],
    ["powershell", "Invoke-WebRequest https://example.invalid -OutFile output.txt"],
    ["bash", "find . -delete"],
    ["bash", "sed -i 's/a/b/' file"],
    ["bash", "find . -exec rm {} \\;"],
    ["bash", "mktemp; rm temp"],
    ["bash", "kill 12345"],
    ["bash", "date -s2026-10-05"],
    ["bash", "printf '%s' \"$(rm file)\""],
    ["bash", "x=$(rm file); echo x"],
    ["powershell", "$x = $(Remove-Item file); Write-Output x"],
    ["powershell", "Get-Content file | ForEach-Object { Remove-Item file }"],
    ["powershell", "& { Get-Content x; Remove-Item x }"],
    ["bash", "bash -c 'cat file; rm file'"],
    ["powershell", "pwsh -Command 'Remove-Item file'"],
    ["bash", "python -c 'import os; os.remove(\"x\")'"],
  ] as const)("mutating: %s %s", async (language, command) => {
    const result = await classify(language, command);
    expect(result.route, JSON.stringify(result)).toBe("mutation");
  });

  it.each([
    ["bash", "unknown-tool inspect"],
    ["bash", "awk '{ system(\"rm file\") }' file"],
    ["powershell", "[System.IO.File]::WriteAllText('file', 'x')"],
    ["bash", "rg --pre helper pattern file"],
    ["powershell", "Get-Content file | Where-Object { Test-Path $_ }"],
    ["bash", "bash -c 'cat file'"],
    ["bash", "python -c 'print(1)'"],
    ["bash", "curl https://example.invalid"],
    ["bash", "curl -H '-o' https://example.invalid"],
    ["bash", "sed -e '-i' file"],
    ["bash", "openssl s_client -connect example.invalid:443"],
    ["bash", "kubectl exec example -- cat file"],
    ["bash", "aws s3api get-object --bucket example --key x output.txt"],
    ["bash", "aws unfamiliar get-mystery"],
    ["bash", "git -c diff.external=helper diff"],
    ["bash", "git diff --ext-diff"],
    ["bash", "cat \"$unresolved\""],
    ["bash", "echo 'unterminated"],
  ] as const)("review required: %s %s", async (language, command) => {
    expect((await classify(language, command)).route).toBe("review");
  });

  it("blocks native writes and preserves native inspection", async () => {
    const write: ToolRequest = { callId: "write", cwd: facts.cwd, text: "write", tool: "write", input: { path: "file", content: "x" } };
    expect((await classifyInspection(write, facts, context, dependencies)).route).toBe("mutation");
    const read: ToolRequest = { callId: "read", cwd: facts.cwd, text: "read", tool: "read", input: { path: "file" } };
    expect((await classifyInspection(read, facts, context, dependencies)).route).toBe("observation");
  });
});

describe("inspection source evidence and normal trust isolation", () => {
  let root: string;
  let fixtureFacts: PathFacts;
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "pi-inspection-test-"));
    fixtureFacts = { ...facts, cwd: root, repo: root };
    // Fixtures are written but never executed.
    await writeFile(path.join(root, "read.sh"), "cat README.md\n");
    await writeFile(path.join(root, "mutate.sh"), "rm file\n");
    await writeFile(path.join(root, "protected.sh"), "echo secret\n");
  });
  afterAll(async () => { await rm(root, { recursive: true, force: true }); });

  it("does not consult normal trust when inspecting a supported body", async () => {
    const trust = vi.fn(async () => true);
    const call = request("bash", "bash mutate.sh", root);
    const normal = await analyzeShell(call, { repositoryRoot: root, scriptTrust: trust });
    expect(trust).toHaveBeenCalledTimes(1);
    expect(normal.effects.some(effect => effect.operation === "delete")).toBe(false);
    expect(normal.internal?.inspection).toBeUndefined();
    const inspected = await analyzeShell(call, { repositoryRoot: root, scriptTrust: trust, inspection: true });
    expect(trust).toHaveBeenCalledTimes(1);
    expect(inspected.effects.some(effect => effect.operation === "delete")).toBe(true);
    expect(inspected.internal?.inspection?.sources[0].source).toBe("rm file\n");
    expect((await classifyInspection(call, fixtureFacts, context, dependencies)).route).toBe("mutation");
  });

  it("supplies complete invocation and available bounded source for T2, never treats source as proof", async () => {
    const call = request("bash", "bash read.sh", root);
    const result = await classifyInspection(call, fixtureFacts, context, dependencies);
    expect(result.route).toBe("review");
    expect(result.request).toEqual({ tool: "bash", input: { command: "bash read.sh" }, cwd: root });
    expect(result.sources).toEqual([{ path: path.join(root, "read.sh"), source: "cat README.md\n" }]);
  });

  it("records missing and protected source omissions", async () => {
    const missing = await classifyInspection(request("bash", "bash missing.sh", root), fixtureFacts, context, dependencies);
    expect(missing.route).toBe("review");
    expect(missing.sources[0]).toMatchObject({ omission: expect.any(String) });
    const protectedDependencies = { ...dependencies, policy: { ...policy, paths: { ...policy.paths, zeroAccess: [path.join(root, "protected.sh")] } } };
    const protectedResult = await classifyInspection(request("bash", "bash protected.sh", root), fixtureFacts, context, protectedDependencies);
    expect(protectedResult.route).toBe("review");
    expect(protectedResult.sources[0].source).toBeUndefined();
    expect(protectedResult.sources[0].omission).toContain("denied");
    expect(protectedResult.analysis.matches.some(match => match.action === "block")).toBe(true);
  });

  it("preserves normal-mode analysis and its outbound-source exclusion", async () => {
    const call = request("powershell", "Get-Content file | Select-String x");
    const normal = await analyzeShell(call);
    const inspected = await analyzeShell(call, { inspection: true });
    expect(inspected.effects).toEqual(normal.effects);
    expect(inspected.uncertainties).toEqual(normal.uncertainties);
    expect(inspected.matches).toEqual(normal.matches);
    const script = await analyzeShell(request("bash", "bash read.sh", root), { repositoryRoot: root });
    expect(script.internal?.scripts?.[0].source).toBeUndefined();
  });
});
