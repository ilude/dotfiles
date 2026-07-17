export interface AsyncPollerOptions<T> {
	intervalMs: number;
	run: (signal: AbortSignal) => Promise<T>;
	onValue: (value: T) => void | Promise<void>;
	equals?: (left: T, right: T) => boolean;
	onError?: (error: unknown) => void;
}

export interface AsyncPoller {
	start(): void;
	dispose(): void;
}

class AsyncPollerController<T> implements AsyncPoller {
	private active = false;
	private generation = 0;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private controller: AbortController | undefined;
	private hasValue = false;
	private lastValue!: T;
	private readonly equals: (left: T, right: T) => boolean;

	constructor(private readonly options: AsyncPollerOptions<T>) {
		this.equals = options.equals ?? Object.is;
	}

	start(): void {
		if (this.active) return;
		this.active = true;
		this.generation += 1;
		this.hasValue = false;
		void this.tick(this.generation);
	}

	dispose(): void {
		if (!this.active && !this.timer && !this.controller) return;
		this.active = false;
		this.generation += 1;
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		this.controller?.abort();
		this.controller = undefined;
	}

	private isActiveGeneration(generation: number): boolean {
		return this.active && generation === this.generation;
	}

	private isCurrentRun(
		generation: number,
		controller: AbortController,
	): boolean {
		return !controller.signal.aborted && this.isActiveGeneration(generation);
	}

	private schedule(generation: number): void {
		if (!this.isActiveGeneration(generation)) return;
		this.timer = setTimeout(() => {
			void this.tick(generation);
		}, this.options.intervalMs);
		this.timer.unref?.();
	}

	private async emitChanged(value: T): Promise<void> {
		if (this.hasValue && this.equals(this.lastValue, value)) return;
		this.lastValue = value;
		this.hasValue = true;
		await this.options.onValue(value);
	}

	private async tick(generation: number): Promise<void> {
		if (!this.isActiveGeneration(generation)) return;
		const controller = new AbortController();
		this.controller = controller;
		try {
			const value = await this.options.run(controller.signal);
			if (!this.isCurrentRun(generation, controller)) return;
			await this.emitChanged(value);
		} catch (error) {
			if (!controller.signal.aborted) this.options.onError?.(error);
		} finally {
			if (this.controller === controller) this.controller = undefined;
			this.schedule(generation);
		}
	}
}

export function createAsyncPoller<T>(
	options: AsyncPollerOptions<T>,
): AsyncPoller {
	if (!Number.isFinite(options.intervalMs) || options.intervalMs < 1) {
		throw new Error("Async poll interval must be a positive finite number");
	}
	return new AsyncPollerController(options);
}
