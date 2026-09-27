import { ReloadMonitor, type ReloadScope } from "./reload-monitor.ts";

const RELOAD_POLL_MS = 15_000;
export const RELOAD_REFRESH_REQUEST = "default:profile-reload:refresh";

/** Session-scoped monitoring, independent of whether a footer is installed. */
export class ProfileReload {
	private readonly monitor: ReloadMonitor;
	private readonly pollMs: number;
	constructor(monitor = new ReloadMonitor(), pollMs = RELOAD_POLL_MS) { this.monitor = monitor; this.pollMs = pollMs; }
	private timer: ReturnType<typeof setInterval> | undefined;
	private readonly listeners = new Set<() => void>();
	private generation = 0;
	private queue: Promise<void> = Promise.resolve();
	private busy = false;
	private reportError: ((error: string) => void) | undefined;
	private reportedError: string | undefined;

	get needed(): boolean { return this.monitor.needed; }
	get error(): string | undefined { return this.monitor.error; }
	get shouldReload(): boolean { return this.needed && !this.error; }

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	start(scope: ReloadScope, reportError: (error: string) => void, reset = true): Promise<void> {
		this.stop();
		const generation = ++this.generation;
		this.reportError = reportError;
		this.reportedError = undefined;
		const initialScan = this.enqueue(generation, () => reset || !this.monitor.isInitialized ? this.monitor.reset(scope) : this.monitor.check());
		this.changed();
		this.timer = setInterval(() => this.requestCheck(), this.pollMs);
		this.timer.unref();
		return initialScan;
	}

	/** Force a scan now, coalescing behind existing work without blocking Pi's event loop. */
	refresh(): Promise<void> { return this.requestCheck(true); }

	private requestCheck(force = false): Promise<void> {
		if (!this.timer && !this.busy) return Promise.resolve();
		if (this.busy && !force) return this.queue;
		return this.enqueue(this.generation, () => this.monitor.check());
	}

	private enqueue(generation: number, scan: () => Promise<void>): Promise<void> {
		const task = this.queue.then(async () => {
			if (generation !== this.generation) return;
			this.busy = true;
			try {
				const before = `${this.needed}:${this.error}`;
				await scan();
				if (generation !== this.generation) return;
				if (this.error && this.error !== this.reportedError) this.reportError?.(this.error);
				this.reportedError = this.error;
				if (before !== `${this.needed}:${this.error}`) this.changed();
			} finally {
				this.busy = false;
			}
		});
		this.queue = task.catch(() => undefined);
		return task;
	}

	stop(): void {
		this.generation++;
		this.monitor.cancel();
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
		this.reportError = undefined;
	}

	private changed(): void {
		for (const listener of this.listeners) listener();
	}
}
