import { ReloadMonitor, type ReloadScope } from "./reload-monitor.ts";

/** Session-scoped monitoring, independent of whether a footer is installed. */
export class ProfileReload {
	private readonly monitor: ReloadMonitor;
	constructor(monitor = new ReloadMonitor()) { this.monitor = monitor; }
	private timer: ReturnType<typeof setInterval> | undefined;
	private readonly listeners = new Set<() => void>();

	get needed(): boolean { return this.monitor.needed; }
	get error(): string | undefined { return this.monitor.error; }
	get shouldReload(): boolean { return this.needed && !this.error; }

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	start(scope: ReloadScope, reportError: (error: string) => void, reset = true): void {
		this.stop();
		if (reset) this.monitor.reset(scope);
		let reportedError: string | undefined;
		const check = () => {
			const before = `${this.needed}:${this.error}`;
			this.monitor.check();
			if (this.error && this.error !== reportedError) reportError(this.error);
			reportedError = this.error;
			if (before !== `${this.needed}:${this.error}`) this.changed();
		};
		check();
		this.changed();
		this.timer = setInterval(check, 2000);
		this.timer.unref();
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
	}

	private changed(): void {
		for (const listener of this.listeners) listener();
	}
}
