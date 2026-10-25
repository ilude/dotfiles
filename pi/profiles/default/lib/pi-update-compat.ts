import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, rm, open, readFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { currentPaneIdentity, type CurrentPaneIdentity } from "./subagents/herdr-layout-api.ts";
import { result, type HerdrCli } from "./herdr-cli.ts";
import { parseUpdateEndpoint, requestCooperativeRestart, type RestartResult, type UpdateEndpoint } from "./pi-update.ts";
import { samePlatformPath } from "./path-identity.ts";
// @ts-expect-error Shared executable JavaScript lives outside this TS project.
import { updateRegistryDirectory } from "../../../../scripts/pi-update-host.mjs";

export interface RestartCoordinates { sessionFile: string; sessionId: string; cwd: string; leafId?: string | null }

/** Restart the current session through its installed update host or Herdr compatibility endpoint. */
export async function restartCurrentPiSession(env: NodeJS.ProcessEnv = process.env, installedVersion: () => Promise<string> = resolveInstalledPiVersion): Promise<RestartResult> {
  const endpoint = parseUpdateEndpoint(env.PI_UPDATE_ENDPOINT);
  if (!endpoint) return { status: "skipped", reason: "This Pi process has no cooperative restart endpoint. Relaunch through the default Pi launcher first." };
  if (!endpoint.server) return { status: "skipped", reason: "New-tab restart is supported only for Pi sessions running in Herdr; this session was left running." };
  const profile = env.PI_CODING_AGENT_DIR;
  if (!profile) return { status: "failed", reason: "Active Pi profile is unavailable." };
  let version: string;
  try { version = await installedVersion(); }
  catch (error) { return { status: "failed", reason: error instanceof Error ? error.message : String(error) }; }
  return requestCooperativeRestart(endpoint, version, "new-tab");
}
async function resolveInstalledPiVersion(): Promise<string> {
  const profile = process.env.PI_CODING_AGENT_DIR;
  if (!profile) throw new Error("Active Pi profile is unavailable");
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../scripts/pi-deps-link-setup");
  const refreshed = spawnSync("bash", [script, "--profile", "default"], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
  if (refreshed.error || refreshed.status !== 0) throw new Error(`Pi runtime link refresh failed: ${refreshed.error?.message ?? refreshed.stderr?.trim() ?? `exit ${refreshed.status}`}`);
  const defaultProfile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (resolve(profile) !== defaultProfile) throw new Error("/pi --restart requires the default Pi profile");
  const pkg: unknown = JSON.parse(await readFile(join(defaultProfile, "node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8"));
  if (!object(pkg) || typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(pkg.version)) throw new Error("Installed Pi version unavailable from refreshed runtime link");
  return pkg.version;
}
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const ended = (socket: Socket, value: unknown) => new Promise<void>(accept => {
  if (socket.destroyed) return accept();
  socket.end(`${JSON.stringify(value)}\n`, accept);
});

/** An old process can load this endpoint through /reload without replacing its parent. */
export async function createCompatibilityEndpoint(options: {
  profile: string; env: NodeJS.ProcessEnv; sessionId: string; cli: HerdrCli;
  eligibility: () => string | undefined;
  prepare: (version: string) => Promise<RestartCoordinates>;
  isCurrent?: (saved: RestartCoordinates) => boolean;
  shutdown: () => void;
  directory?: string;
}) {
  const directory = options.directory ?? updateRegistryDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `${process.pid}-compat-${randomUUID()}.json`);
  const sockets = new Set<Socket>();
  let closed = false;
  let requesting: Socket | undefined;
  let pending: { socket: Socket; version: string; coordinates: RestartCoordinates; origin: CurrentPaneIdentity; created: Promise<string>; timer: ReturnType<typeof setTimeout> } | undefined;
  const server = createServer(socket => {
    sockets.add(socket); socket.on("error", () => {}); socket.on("close", () => sockets.delete(socket));
    socket.setTimeout(45_000, () => socket.destroy());
    let buffer = "", consumed = false;
    socket.on("data", chunk => {
      buffer += String(chunk);
      if (buffer.length > 8192) return socket.destroy();
      if (consumed || !buffer.includes("\n")) return;
      consumed = true;
      void (async () => {
        const request: unknown = JSON.parse(buffer.slice(0, buffer.indexOf("\n")));
        if (!object(request) || request.token !== endpoint.token || closed) return socket.destroy();
        if (request.action === "restart" && typeof request.version === "string") {
          if (request.mode !== undefined && request.mode !== "new-tab") return ended(socket, { status: "failed", reason: "Unsupported restart mode" });
          const reason = options.eligibility();
          if (reason || requesting) return ended(socket, { status: "skipped", reason: reason ?? "Migration is already in progress" });
          requesting = socket;
          const coordinates = await options.prepare(request.version);
          const headerFile = await open(coordinates.sessionFile, "r");
          try {
            const buffer = Buffer.alloc(64 * 1024);
            const { bytesRead } = await headerFile.read(buffer, 0, buffer.length, 0);
            const header: unknown = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8").split("\n", 1)[0]!);
            if (!object(header) || header.type !== "session" || header.id !== coordinates.sessionId) throw new Error("Saved session identity does not match");
          } finally { await headerFile.close(); }
          const origin = await currentPaneIdentity(options.cli);
          const pane = result(await options.cli(["pane", "get", origin.pane_id])).pane;
          const paneLabel = typeof pane?.label === "string" ? pane.label : "Orchestrator";
          if (options.eligibility()) { requesting = undefined; return ended(socket, { status: "skipped", reason: "Session became busy before migration" }); }
          // The replacement bootstrap admits itself before opening the conversation file.
          const placement = request.mode === "new-tab" ? ["--placement", "tab", "--workspace", origin.workspace_id] : ["--placement", "split", "--direction", "down", "--target-pane", origin.pane_id];
          const created = options.cli(["plugin", "pane", "open", "--plugin", "local.pi", "--entrypoint", "pi", ...placement,
            "--cwd", coordinates.cwd, "--env", `PI_HERDR_PROFILE_DIR=${options.profile}`, "--env", "PI_HERDR_SESSION_FILE=", "--env", "PI_HERDR_PLAN_PATH=", "--env", "PI_HERDR_PLAN_RUN=",
            "--env", `PI_UPDATE_MIGRATION=${JSON.stringify(endpoint)}`, "--env", `PI_UPDATE_PANE_LABEL=${paneLabel}`, "--no-focus"])
            .then(text => {
              const response = result(text);
              const replacement = response.plugin_pane?.pane ?? response.pane ?? response.root_pane;
              if (typeof replacement?.pane_id !== "string" || replacement.workspace_id !== origin.workspace_id
                || (request.mode === "new-tab" ? replacement.tab_id === origin.tab_id : replacement.tab_id !== origin.tab_id)) throw new Error(request.mode === "new-tab" ? "Replacement did not open in a new tab" : "Replacement did not open in the original tab");
              return replacement.pane_id as string;
            });
          const timer = setTimeout(() => {
            if (pending?.socket !== socket) return;
            pending = undefined; requesting = undefined;
            void ended(socket, { status: "failed", reason: "Replacement did not complete migration admission; original session retained" });
          }, 35_000);
          pending = { socket, version: request.version, coordinates, origin, created, timer };
          try { await created; }
          catch (error) { clearTimeout(timer); pending = undefined; throw error; }
          return;
        }
        if (request.action === "admit" && pending) {
          const current = pending;
          const replacement = parseUpdateEndpoint(JSON.stringify(request.endpoint));
          const pane = await current.created;
          if (!replacement || replacement.pid === process.pid || replacement.server !== endpoint.server || !samePlatformPath(replacement.profile, endpoint.profile) || replacement.pane !== pane) throw new Error("Invalid replacement admission");
          const reason = options.eligibility() ?? (options.isCurrent && !options.isCurrent(current.coordinates) ? "session identity or branch changed" : undefined);
          if (reason) {
            clearTimeout(current.timer); pending = undefined; requesting = undefined;
            await ended(current.socket, { status: "skipped", reason });
            return ended(socket, { error: reason });
          }
          clearTimeout(current.timer); pending = undefined;
          await Promise.all([
            ended(current.socket, { status: "handoff", endpoint: { ...replacement, sessionId: current.coordinates.sessionId } }),
            ended(socket, { ...current.coordinates, version: current.version, originPid: process.pid, origin: current.origin }),
          ]);
          // A draft or new run arriving during admission must not be discarded.
          requesting = undefined;
          if (!options.eligibility() && (!options.isCurrent || options.isCurrent(current.coordinates))) options.shutdown();
          return;
        }
        await ended(socket, { status: "skipped", reason: "No migration awaiting admission" });
      })().catch(error => {
        if (requesting === socket) {
          requesting = undefined;
          if (pending?.socket === socket) { clearTimeout(pending.timer); pending = undefined; }
        }
        void ended(socket, { status: "failed", error: error instanceof Error ? error.message : String(error), reason: error instanceof Error ? error.message : String(error) });
      });
    });
  });
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Compatibility endpoint unavailable");
  const endpoint: UpdateEndpoint = { port: address.port, token: randomBytes(32).toString("hex"), pid: process.pid, profile: options.profile,
    server: options.env.HERDR_SOCKET_PATH ?? "", pane: options.env.HERDR_PANE_ID ?? "", sessionId: options.sessionId };
  await writeFile(file, JSON.stringify(endpoint), { mode: 0o600, flag: "wx" });
  return {
    endpoint,
    async close() {
      if (closed) return;
      closed = true;
      if (pending) { clearTimeout(pending.timer); pending = undefined; }
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(accept => server.close(() => accept()));
      await rm(file, { force: true });
    },
  };
}
