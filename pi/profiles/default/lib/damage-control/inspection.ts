import { analyzeRequest, type AnalysisDependencies, type CreationFacts } from "./analysis.ts";
import type { InspectionEvidence, InspectionInvocation, InspectionRoute, ToolRequest } from "./types.ts";
import type { PathFacts } from "./paths.ts";
import { analyzeShell } from "./shell.ts";

const mutations = new Set("rm remove-item rmdir del erase mv move-item rename-item cp copy-item mkdir new-item touch tee set-content add-content out-file kill pkill killall stop-process chmod chown truncate mktemp install start-process restart-service stop-service set-item set-itemproperty export-csv export-clixml".split(" "));
const simple = new Set("pwd get-location echo printf write-output out-host true false date uname hostname whoami id ps get-process get-service printenv which get-command cd set-location pushd".split(" "));

// All options must be recognized. Operands are already decoded data; substitutions
// are separate executable contexts in the grammar projection.
function options(args: string[], flags: string, values = ""): boolean {
  const switches = new Set(flags.split(" "));
  const valued = new Set(values.split(" "));
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") return true;
    if (!arg.startsWith("-")) continue;
    const [name] = arg.split("=");
    if (switches.has(name.toLowerCase())) { if (arg.includes("=")) return false; continue; }
    if (!valued.has(name.toLowerCase())) return false;
    if (!arg.includes("=") && ++i >= args.length) return false;
  }
  return true;
}

function activeOptions(args: string[], values: string): string[] {
  const valued = new Set(values.split(" "));
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") break;
    if (!arg.startsWith("-")) continue;
    result.push(arg);
    if (valued.has(arg.split("=")[0]) && !arg.includes("=")) i++;
  }
  return result;
}

function leading(args: string[], flags: string, values: string): { verb?: string; rest: string[] } {
  let i = 0;
  const switches = new Set(flags.split(" ")), valued = new Set(values.split(" "));
  for (; i < args.length && args[i].startsWith("-"); i++) {
    const [name] = args[i].split("=");
    if (switches.has(name.toLowerCase()) && !args[i].includes("=")) continue;
    if (!valued.has(name.toLowerCase())) return { rest: args };
    if (!args[i].includes("=") && ++i >= args.length) return { rest: args };
  }
  return { verb: args[i], rest: args.slice(i + 1) };
}

function invocationRoute(invocation: InspectionInvocation): InspectionRoute {
  const { executable: exe } = invocation;
  if (mutations.has(exe)) return "mutation";
  if (invocation.args.some(arg => !arg.known)) return "review";
  const args = invocation.args.flatMap(arg => arg.known ? [arg.value] : []);
  // Wrappers with spawn/environment semantics require review, even if their
  // normalized inner executable is familiar.
  if (invocation.wrappers.some(wrapper => wrapper !== "command")) return "review";
  if (exe === "git") {
    const { verb, rest } = leading(args, "--no-pager --literal-pathspecs", "-c --git-dir --work-tree");
    if (!verb) return "review";
    if ("add am apply bisect checkout cherry-pick clean clone commit fetch gc init merge mv pull push rebase reset restore revert rm stash submodule switch update-index update-ref worktree".split(" ").includes(verb)) return "mutation";
    if (activeOptions(rest, "--format --pretty --max-count -n --untracked-files --diff-filter").some(arg => /^--output(?:=|$)/.test(arg))) return "mutation";
    // -c can configure arbitrary helpers; do not infer observation from the verb.
    if (args.includes("-c")) return "review";
    if (!"status diff log show rev-parse ls-files ls-tree".split(" ").includes(verb)) return "review";
    return options(rest, "--short -s --porcelain --branch -b --stat --numstat --name-only --name-status --cached --staged --no-ext-diff --no-textconv --oneline --all --graph --decorate --no-decorate --patch -p --quiet --exit-code --reverse --raw --abbrev-commit --show-toplevel --verify --show-prefix --others --exclude-standard --deleted --modified", "--format --pretty --max-count -n --untracked-files --diff-filter") ? "observation" : "review";
  }
  if (exe === "kubectl") {
    const { verb, rest } = leading(args, "", "--context --namespace -n --kubeconfig --cluster --user --server --request-timeout");
    if (!verb) return "review";
    if ("delete apply create replace patch edit scale drain cordon uncordon rollout label annotate set expose run attach cp port-forward".split(" ").includes(verb)) return "mutation";
    if (!["get", "describe", "logs"].includes(verb)) return "review";
    return options(rest, "--all-namespaces -a --watch -w --previous -p --follow -f --timestamps --show-labels --all-containers", "--context --namespace -n --kubeconfig --selector -l --field-selector --output -o --container -c --tail --since --since-time --limit-bytes --request-timeout") && !rest.some(arg => /(?:go-template-file|jsonpath-file)/.test(arg)) ? "observation" : "review";
  }
  if (exe === "aws") {
    const { verb: service, rest } = leading(args, "--no-cli-pager --no-paginate --no-sign-request --debug", "--profile --region --endpoint-url --output --query --ca-bundle --cli-read-timeout --cli-connect-timeout");
    const operation = rest[0];
    if (!operation) return "review";
    if (/^(?:put|create|delete|update|modify|start|stop|terminate|run|invoke|attach|detach|associate|disassociate|enable|disable|register|deregister|authorize|revoke|reboot|restore|import|export|send)-/.test(operation) || service === "s3" && ["cp", "mv", "rm", "sync", "mb", "rb"].includes(operation)) return "mutation";
    const selected: Record<string, string[]> = {
      sts: ["get-caller-identity"],
      ec2: ["describe-instances", "describe-regions", "describe-vpcs", "describe-subnets", "describe-security-groups", "describe-volumes", "describe-images"],
      eks: ["list-clusters", "describe-cluster", "list-nodegroups", "describe-nodegroup"],
      iam: ["list-users", "list-roles", "get-role", "get-user", "list-attached-role-policies"],
      rds: ["describe-db-instances", "describe-db-clusters"],
      logs: ["describe-log-groups", "describe-log-streams", "get-log-events", "filter-log-events"],
      s3api: ["list-buckets", "list-objects-v2", "head-object", "get-bucket-location"],
    };
    if (!service || !selected[service]?.includes(operation)) return "review";
    return options(rest.slice(1), "--no-cli-pager --no-paginate --no-sign-request --debug", "--profile --region --endpoint-url --output --query --ca-bundle --cli-read-timeout --cli-connect-timeout --filters --instance-ids --cluster-name --name --nodegroup-name --role-name --user-name --db-instance-identifier --db-cluster-identifier --log-group-name --log-stream-name --filter-pattern --start-time --end-time --limit --bucket --key --prefix --max-items --page-size --starting-token") ? "observation" : "review";
  }
  if (["curl", "wget", "invoke-webrequest", "invoke-restmethod"].includes(exe)) {
    if (activeOptions(args, "-H --header -X --request -Method -Headers --url -Uri").some(arg => /^(?:--output(?:=|$)|--output-document(?:=|$)|--remote-name(?:=|$)|--remote-header-name(?:=|$)|-outfile$)/i.test(arg) || exe === "curl" && /^-[oO]/.test(arg) || exe === "wget" && /^-O/.test(arg))) return "mutation";
    const methodAt = args.findIndex(arg => ["-X", "--request", "-Method"].includes(arg));
    if (methodAt >= 0 && args[methodAt + 1] && !["GET", "HEAD", "OPTIONS"].includes(args[methodAt + 1].toUpperCase())) return "mutation";
    return "review";
  }
  if (exe === "sed" && activeOptions(args, "-e --expression -f --file").some(arg => /^-i/.test(arg) || /^--in-place(?:=|$)/.test(arg))) return "mutation";
  if (exe === "date" && activeOptions(args, "-d --date -r --reference").some(arg => /^-s/.test(arg) || /^--set(?:=|$)/.test(arg))) return "mutation";
  if (exe === "hostname" && args.length) return "review";
  if (simple.has(exe)) return "observation";
  if (["cat", "get-content", "head", "tail", "wc", "ls", "dir", "get-childitem", "stat", "file", "du", "less", "more"].includes(exe)) return options(args, "-a -l -la -al -h -lh -r -s -f --follow --recursive --recurse -recurse -force -raw --all --human-readable --count -l -w -c --bytes --lines", "-n --lines -c --bytes -path -literalpath -encoding -totalcount -tail --format --depth") ? "observation" : "review";
  if (["grep", "rg", "select-string"].includes(exe)) return options(args, "-n -i -r -r -l -h -v -f --fixed-strings --ignore-case --line-number --files --hidden --no-ignore --count --files-with-matches --only-matching -o -quiet -simplematch -casesensitive", "-e --regexp -f --file -g --glob --iglob --type -t --context -c -a -b -pattern -path -literalpath -context") ? "observation" : "review";
  if (exe === "find") {
    const predicates = activeOptions(args, "-name -iname -path -ipath -maxdepth -mindepth -type -size -mtime -mmin -user -group");
    if (predicates.includes("-delete") || predicates.some(arg => ["-fprint", "-fprint0", "-fprintf", "-fls"].includes(arg))) return "mutation";
    if (predicates.some(arg => ["-exec", "-execdir", "-ok", "-okdir"].includes(arg))) return "review";
    return options(args, "-print -print0 -ls -type -empty -readable -writable -executable -not -o -a", "-name -iname -path -ipath -maxdepth -mindepth -type -size -mtime -mmin -user -group") ? "observation" : "review";
  }
  if (["sort", "uniq", "cut", "tr"].includes(exe)) {
    if (exe === "sort" && args.some(arg => arg === "-o" || arg.startsWith("--output") || /^-o./.test(arg))) return "mutation";
    return options(args, "-n -r -u -f -b -d -c -s --numeric-sort --reverse --unique", "-k -t -f -d -c --key --field-separator --fields --delimiter --characters") ? "observation" : "review";
  }
  // Includes filters with executable source, interpreters, HTTP and kubectl exec.
  return "review";
}

function routeFor(request: ToolRequest, analysis: InspectionEvidence["analysis"]): { route: InspectionRoute; reason: string } {
  if (request.tool === "edit" || request.tool === "write") return { route: "mutation", reason: "native edit/write is not inspection" };
  if (analysis.health.status !== "ready") return { route: "review", reason: `inspection analysis failed: ${analysis.health.reason}` };
  if (analysis.effects.some(effect => ["write", "delete", "truncate", "upload", "mutate"].includes(effect.operation))) return { route: "mutation", reason: "parsed call contains an intentional mutation" };
  if (request.tool !== "bash" && request.tool !== "powershell") return { route: "observation", reason: "native inspection tool" };
  const invocations = analysis.internal?.inspection?.invocations ?? [];
  const routes = invocations.map(invocationRoute);
  if (routes.includes("mutation")) return { route: "mutation", reason: "parsed executable arguments establish mutation" };
  // Opaque effects for these directly recognized invocations reflect normal
  // analysis's narrower modeling, not inspection uncertainty. Never ignore
  // parser errors, unresolved arguments, script execution, or nested programs.
  const recognized = new Set(invocations.filter((_, i) => routes[i] === "observation").map(item => item.executable));
  const unresolved = analysis.effects.some(effect => (effect.operation === "unknown" || effect.operation === "execute") && !(recognized.has(effect.context.executable ?? "") && (effect.resolution === "static" || effect.reason.toLowerCase() === `effects of executable ${effect.context.executable} are not statically modeled`)));
  if (!invocations.length || routes.includes("review") || unresolved || analysis.internal?.inspection?.sources.length || analysis.uncertainties.some(reason => ![...recognized].some(exe => reason.toLowerCase() === `effects of executable ${exe} are not statically modeled`))) return { route: "review", reason: "complete call includes unresolved execution or unsupported inspection arguments" };
  return { route: "observation", reason: "complete parsed call uses established observational forms" };
}

/** No approvals are consulted; source reads retain normal protected/repository bounds.
 * Evidence is local and unredacted. T2 must redact its explicit outbound projection.
 */
export async function classifyInspection(request: ToolRequest, facts: PathFacts, context: CreationFacts, dependencies: AnalysisDependencies): Promise<InspectionEvidence> {
  const { analysis } = await analyzeRequest(request, facts, context, {
    ...dependencies,
    analyze: async (shellRequest, shellDependencies) => analyzeShell(shellRequest, { ...shellDependencies, inspection: true, scriptTrust: undefined }),
  });
  return { ...routeFor(request, analysis), request: { tool: request.tool, input: request.input, cwd: request.cwd }, analysis, sources: analysis.internal?.inspection?.sources ?? [] };
}
