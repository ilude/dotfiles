import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { ProfileRegistry } from "./profiles.js";

type Pending = { resolve(value: unknown): void; reject(error: Error): void; abort?: () => void };
type WorkerMessage = { type: "result"; id: string; details: unknown } | { type: "error"; id: string; error: string };
const STDERR_LIMIT = 16 * 1024;

export class AnalyticsWorker {
	private child: ChildProcess | undefined;
	private readonly pending = new Map<string, Pending>();
	private stderr = "";

	private start(): ChildProcess {
		if (this.child?.connected) return this.child;
		this.stderr = "";
		const child = fork(fileURLToPath(new URL("./worker.mjs", import.meta.url)), [], {
			stdio: ["ignore", "ignore", "pipe", "ipc"],
		});
		this.child = child;
		child.stderr?.setEncoding("utf8");
		child.stderr?.on("data", chunk => { this.stderr = `${this.stderr}${String(chunk)}`.slice(-STDERR_LIMIT); });
		child.on("message", value => this.receive(value));
		child.once("error", error => this.failAll(new Error(`analytics worker failed: ${error.message}`)));
		child.once("exit", (code, signal) => {
			const evidence = this.stderr.trim();
			this.failAll(new Error(`analytics worker exited (${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`})${evidence ? `: ${evidence}` : ""}`));
			if (this.child === child) this.child = undefined;
		});
		return child;
	}

	private receive(value: unknown): void {
		if (!value || typeof value !== "object") return;
		const message = value as WorkerMessage;
		if (typeof message.id !== "string" || (message.type !== "result" && message.type !== "error")) return;
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id); pending.abort?.();
		if (message.type === "error") pending.reject(new Error(typeof message.error === "string" ? message.error : "analytics worker error"));
		else pending.resolve(message.details);
	}

	private failAll(error: Error): void {
		for (const pending of this.pending.values()) { pending.abort?.(); pending.reject(error); }
		this.pending.clear();
	}

	execute(registry: ProfileRegistry, request: object, signal?: AbortSignal): Promise<unknown> {
		if (signal?.aborted) return Promise.reject(new Error("analytics query was cancelled"));
		const child = this.start(); const id = randomUUID();
		return new Promise((resolve, reject) => {
			const onAbort = () => { child.send({ type: "cancel", id }); };
			if (signal) signal.addEventListener("abort", onAbort, { once: true });
			this.pending.set(id, { resolve, reject, abort: signal ? () => signal.removeEventListener("abort", onAbort) : undefined });
			child.send({ type: "execute", id, registry, request }, error => {
				if (!error) return;
				const pending = this.pending.get(id); if (!pending) return;
				this.pending.delete(id); pending.abort?.(); reject(new Error(`analytics worker send failed: ${error.message}`));
			});
		});
	}

	close(): void {
		const child = this.child; this.child = undefined;
		if (!child) return;
		this.failAll(new Error("analytics worker closed"));
		child.kill();
	}
}
