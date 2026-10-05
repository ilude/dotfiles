import { BrowserControlError, type BrowserSessionState } from "./browser-control.js";

export interface CdpEvent {
	method: string;
	params: Record<string, unknown>;
	sessionId?: string;
	targetId?: string;
}
export interface CdpCommandOptions { signal?: AbortSignal; timeoutMs?: number }
export type CdpSocketFactory = (url: string) => WebSocket;

function failure(code: string, message: string): BrowserControlError { return new BrowserControlError(code, message); }
function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function string(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
async function cancellable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return await work;
	if (signal.aborted) throw failure("cancelled", "Browser operation was cancelled.");
	return await new Promise<T>((resolve, reject) => {
		const abort = () => { signal.removeEventListener("abort", abort); reject(failure("cancelled", "Browser operation was cancelled.")); };
		signal.addEventListener("abort", abort, { once: true });
		void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
	});
}

/** One browser socket, flattened sessions, and independently cancellable pending commands. No reconnection. */
export class CdpConnection {
	private nextId = 0;
	private closed = false;
	private readonly pending = new Map<number, { finish: (error?: Error, result?: unknown) => void; sessionId?: string }>();
	private readonly listeners = new Set<(event: CdpEvent) => void>();
	private readonly disconnectListeners = new Set<() => void>();
	private readonly socket: WebSocket;
	private readonly ready: Promise<void>;
	private lifetimeAbort?: () => void;

	constructor(url: string, factory: CdpSocketFactory = (endpoint) => new WebSocket(endpoint), signal?: AbortSignal, timeoutMs = 10_000) {
		this.socket = factory(url);
		this.ready = new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => { reject(failure("cdp_timeout", "CDP connection timed out.")); this.close(); }, timeoutMs);
			const opened = () => { clearTimeout(timer); resolve(); };
			const disconnected = () => { clearTimeout(timer); reject(failure("cdp_disconnected", "CDP connection closed.")); };
			this.socket.addEventListener("open", opened, { once: true });
			this.socket.addEventListener("close", disconnected, { once: true });
			this.socket.addEventListener("error", disconnected, { once: true });
			this.onDisconnect(disconnected);
		});
		// A connection may be shut down before its first command.
		void this.ready.catch(() => {});
		this.socket.addEventListener("message", this.message);
		this.socket.addEventListener("close", this.disconnected);
		this.socket.addEventListener("error", this.disconnected);
		if (signal) {
			this.lifetimeAbort = () => this.close();
			signal.addEventListener("abort", this.lifetimeAbort, { once: true });
			this.onDisconnect(() => signal.removeEventListener("abort", this.lifetimeAbort!));
			if (signal.aborted) this.close();
		}
	}

	onEvent(listener: (event: CdpEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
	onDisconnect(listener: () => void): () => void { this.disconnectListeners.add(listener); return () => this.disconnectListeners.delete(listener); }

	async command<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string, options: CdpCommandOptions = {}): Promise<T> {
		const signal = options.signal;
		if (signal?.aborted) throw failure("cancelled", "Browser operation was cancelled.");
		return await new Promise<T>((resolve, reject) => {
			const id = ++this.nextId;
			let settled = false;
			const abort = () => finish(failure("cancelled", "Browser operation was cancelled."));
			const timer = setTimeout(() => finish(failure("cdp_timeout", "CDP command timed out.")), options.timeoutMs ?? 10_000);
			const finish = (error?: Error, result?: unknown) => {
				if (settled) return;
				settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); this.pending.delete(id);
				if (error) reject(error); else resolve(result as T);
			};
			this.pending.set(id, { finish, sessionId });
			signal?.addEventListener("abort", abort, { once: true });
			void this.ready.then(() => {
				if (settled) return;
				if (this.closed) { finish(failure("cdp_disconnected", "CDP connection closed.")); return; }
				try { this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
				catch { finish(failure("cdp_disconnected", "CDP command could not be sent.")); this.close(); }
			}, () => finish(failure("cdp_disconnected", "CDP connection closed.")));
		});
	}

	rejectSession(sessionId: string): void {
		for (const pending of [...this.pending.values()]) if (pending.sessionId === sessionId) pending.finish(failure("target_missing", "CDP target detached."));
	}

	private message = (event: MessageEvent) => {
		let message: Record<string, unknown> | undefined;
		try { message = record(JSON.parse(String(event.data))); } catch { this.close(); return; }
		if (!message) { this.close(); return; }
		if (typeof message.id === "number") {
			const pending = this.pending.get(message.id);
			if (!pending) return;
			if (message.sessionId !== pending.sessionId) { this.close(); return; }
			// Browser error strings can contain page values; never surface them.
			pending.finish(message.error ? failure("cdp_failed", "CDP command failed.") : undefined, message.result);
		} else if (typeof message.method === "string") {
			const params = record(message.params) ?? {};
			for (const listener of [...this.listeners]) {
				try { listener({ method: message.method, params, sessionId: string(message.sessionId) }); }
				catch { this.close(); return; }
			}
		}
	};
	private disconnected = () => this.close();
	close(): void {
		if (this.closed) return;
		this.closed = true;
		for (const pending of [...this.pending.values()]) pending.finish(failure("cdp_disconnected", "CDP connection closed."));
		this.socket.removeEventListener("message", this.message);
		this.socket.removeEventListener("close", this.disconnected);
		this.socket.removeEventListener("error", this.disconnected);
		try { this.socket.close(); } catch {}
		for (const listener of [...this.disconnectListeners]) listener();
		this.listeners.clear(); this.disconnectListeners.clear();
	}
}

export interface ManagedCdpTarget {
	targetId: string;
	sessionId: string;
	type: string;
	url: string;
	rootTargetId: string;
	parentTargetId?: string;
	openerId?: string;
	waitingForDebugger: boolean;
}
export interface CdpFrame {
	targetId: string;
	sessionId: string;
	frameId: string;
	parentFrameId?: string;
	url: string;
	securityOrigin: string;
	loaderId?: string;
	executionContextId?: number;
}
export interface ManagedTargetSetup {
	readonly target: Readonly<ManagedCdpTarget>;
	readonly signal: AbortSignal;
	/** Guard installation commands run while a new descendant is still paused. */
	command<T = Record<string, unknown>>(method: string, params?: Record<string, unknown>): Promise<T>;
}
export interface BrowserCdpOptions {
	/** Must inspect the current saved session and the OS process tuple, not just CDP reachability. */
	revalidate: (signal?: AbortSignal) => Promise<void>;
	/** Install Fetch/Network policy here. Failure disconnects without resuming a new target. */
	register: (setup: ManagedTargetSetup) => Promise<void>;
	signal?: AbortSignal;
	socketFactory?: CdpSocketFactory;
}

/** Session-owned transport. Never browser-global auto-attach, closeTarget, or Browser.close during disposal. */
export class BrowserCdpTransport {
	readonly state: Readonly<BrowserSessionState>;
	private readonly lifetime = new AbortController();
	private readonly connection: CdpConnection;
	private readonly targets = new Map<string, ManagedCdpTarget>();
	private readonly sessions = new Map<string, ManagedCdpTarget>();
	private readonly frames = new Map<string, CdpFrame>();
	private readonly requestedRoots = new Set<string>();
	private readonly managing = new Map<string, Promise<Readonly<ManagedCdpTarget>>>();
	private readonly registrations = new Map<string, Promise<void>>();
	private readonly listeners = new Set<(event: CdpEvent) => void | Promise<void>>();
	private readonly contexts = new Map<string, string>();
	private readonly initializingEvents = new Map<string, CdpEvent[]>();
	private readonly queuedEvents = new Map<string, CdpEvent[]>();
	private closed = false;
	private externalAbort?: () => void;
	private readonly options: BrowserCdpOptions;

	private constructor(state: BrowserSessionState, endpoint: string, options: BrowserCdpOptions) {
		this.options = options;
		this.state = Object.freeze({ ...state });
		this.connection = new CdpConnection(endpoint, options.socketFactory, this.lifetime.signal);
		this.connection.onEvent(this.event);
		this.connection.onDisconnect(() => this.dispose());
		if (options.signal) {
			this.externalAbort = () => this.dispose();
			options.signal.addEventListener("abort", this.externalAbort, { once: true });
			if (options.signal.aborted) this.dispose();
		}
	}

	static async connect(state: BrowserSessionState, options: BrowserCdpOptions): Promise<BrowserCdpTransport> {
		await options.revalidate(options.signal);
		const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);
		let endpoint: string;
		try {
			const response = await fetch(`http://127.0.0.1:${state.cdpPort}/json/version`, { signal });
			const version = record(await response.json());
			const raw = string(version?.webSocketDebuggerUrl);
			if (!response.ok || !raw) throw new Error();
			const url = new URL(raw);
			if (url.protocol !== "ws:" || url.hostname !== "127.0.0.1" || Number(url.port) !== state.cdpPort || url.username || url.password || !url.pathname.startsWith("/devtools/browser/")) throw new Error();
			endpoint = url.href;
		} catch { throw failure(options.signal?.aborted ? "cancelled" : "cdp_failed", "Verified browser CDP endpoint is unavailable."); }
		await options.revalidate(options.signal);
		return new BrowserCdpTransport(state, endpoint, options);
	}

	get signal(): AbortSignal { return this.lifetime.signal; }
	/** Events observed during setup are delivered after registration, with initial frame identity ready.
	 * Handlers may use command(); register itself must still use setup.command(). */
	onEvent(listener: (event: CdpEvent) => void | Promise<void>): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
	managedTargets(): Readonly<ManagedCdpTarget>[] { return [...this.targets.values()].map((target) => ({ ...target })); }

	async revalidate(signal?: AbortSignal): Promise<void> {
		if (this.closed || signal?.aborted) throw failure(signal?.aborted ? "cancelled" : "cdp_disconnected", "Browser transport is no longer active.");
		try { await this.options.revalidate(signal); }
		catch (error) { this.dispose(); throw error; }
		if (this.closed || signal?.aborted) throw failure("cancelled", "Browser operation was cancelled.");
	}

	/** Select one exact existing target. Prior traffic in attached tabs is not controlled. */
	async manage(targetId: string, signal?: AbortSignal): Promise<Readonly<ManagedCdpTarget>> {
		await this.revalidate(signal);
		if (!targetId) throw failure("target_missing", "An exact target ID is required.");
		let work = this.managing.get(targetId);
		if (!work) {
			work = this.manageRoot(targetId);
			this.managing.set(targetId, work);
			void work.catch(() => this.dispose());
		}
		const result = await cancellable(work, signal);
		await this.revalidate(signal);
		return result;
	}

	private async manageRoot(targetId: string): Promise<Readonly<ManagedCdpTarget>> {
		if (!this.targets.has(targetId)) {
			this.requestedRoots.add(targetId);
			try {
				// Root-scoped auto-attachment, never browser-global setAutoAttach.
				await this.connection.command("Target.autoAttachRelated", { targetId, waitForDebuggerOnStart: true }, undefined, { signal: this.signal });
			} catch (error) { this.dispose(); throw error; }
		}
		const registration = this.registrations.get(targetId);
		if (!registration) { this.dispose(); throw failure("target_missing", "CDP did not attach the exact requested target."); }
		await registration;
		await this.revalidate();
		const target = this.targets.get(targetId);
		if (!target) throw failure("target_missing", "Managed target is no longer attached.");
		return { ...target };
	}

	/** Initialize blank, register guards, then let the caller authorize and navigate. */
	async create(signal?: AbortSignal): Promise<Readonly<ManagedCdpTarget>> {
		await this.revalidate(signal);
		const result = await this.connection.command<{ targetId?: string }>("Target.createTarget", { url: "about:blank" }, undefined, { signal });
		if (!result.targetId) throw failure("target_missing", "CDP did not create an exact target.");
		return await this.manage(result.targetId, signal);
	}

	async command<T = Record<string, unknown>>(targetId: string, method: string, params: Record<string, unknown> = {}, options: CdpCommandOptions = {}): Promise<T> {
		await this.revalidate(options.signal);
		const registration = this.registrations.get(targetId);
		if (!registration) throw failure("target_missing", "Target is not managed by this session.");
		await cancellable(registration, options.signal);
		await this.revalidate(options.signal);
		const target = this.targets.get(targetId);
		if (!target) throw failure("target_missing", "Managed target is no longer attached.");
		const signal = options.signal ? AbortSignal.any([options.signal, this.signal]) : this.signal;
		const result = await this.connection.command<T>(method, params, target.sessionId, { ...options, signal });
		await this.revalidate(options.signal);
		return result;
	}

	/** Exact frame and CDP owning session, including OOPIF descendants. No fallback to the top frame. */
	async frame(targetId: string, frameId: string, signal?: AbortSignal): Promise<Readonly<CdpFrame>> {
		await this.revalidate(signal);
		const root = this.targets.get(targetId);
		if (!root) throw failure("target_missing", "Target is not managed by this session.");
		const matches = [...this.frames.values()].filter((frame) => frame.frameId === frameId && this.isWithin(frame.targetId, root.targetId));
		// An OOPIF can temporarily appear in both parent and child frame trees. Its default context identifies the executor.
		const executable = matches.filter((frame) => frame.executionContextId !== undefined);
		const candidates = executable.length ? executable : matches;
		if (candidates.length !== 1) throw failure("frame_missing", "Exact frame is absent or ambiguous; refresh the frame mapping.");
		return { ...candidates[0]! };
	}

	async frameList(targetId: string, signal?: AbortSignal): Promise<Readonly<CdpFrame>[]> {
		await this.revalidate(signal);
		if (!this.targets.has(targetId)) throw failure("target_missing", "Target is not managed by this session.");
		return [...this.frames.values()].filter((frame) => this.isWithin(frame.targetId, targetId)).map((frame) => ({ ...frame }));
	}

	/** A cached frame lease is not authority to operate after a navigation/context replacement. */
	async revalidateFrame(expected: Readonly<CdpFrame>, signal?: AbortSignal): Promise<Readonly<CdpFrame>> {
		const current = await this.frame(expected.targetId, expected.frameId, signal);
		if (current.sessionId !== expected.sessionId || current.parentFrameId !== expected.parentFrameId || current.loaderId !== expected.loaderId
			|| current.url !== expected.url || current.securityOrigin !== expected.securityOrigin
			|| current.executionContextId !== expected.executionContextId) throw failure("frame_stale", "Frame identity changed; inspect the exact frame again.");
		return current;
	}

	private isWithin(targetId: string, ancestorId: string): boolean {
		let current = this.targets.get(targetId);
		while (current) { if (current.targetId === ancestorId) return true; current = current.parentTargetId ? this.targets.get(current.parentTargetId) : undefined; }
		return false;
	}

	private event = (event: CdpEvent) => {
		if (event.method === "Target.attachedToTarget") { this.attached(event); return; }
		if (event.method === "Target.targetDestroyed") {
			const targetId = string(event.params.targetId), target = targetId ? this.targets.get(targetId) : undefined;
			if (target) this.remove(target);
			return;
		}
		if (event.method === "Target.detachedFromTarget") {
			const sessionId = string(event.params.sessionId);
			const target = sessionId && this.sessions.get(sessionId);
			if (target) this.remove(target);
			return;
		}
		const target = event.sessionId ? this.sessions.get(event.sessionId) : undefined;
		if (!target) return; // Never project/control unrelated attached tabs.
		if (event.method.startsWith("Page.frame") || event.method.startsWith("Runtime.executionContext")) this.initializingEvents.get(target.targetId)?.push(event);
		this.updateFrameEvent(target, event);
		const projected: CdpEvent = { ...event, targetId: target.targetId };
		const queue = this.queuedEvents.get(target.targetId);
		if (queue) queue.push(projected);
		else this.projectEvent(projected);
	};

	private updateFrameEvent(target: ManagedCdpTarget, event: CdpEvent): void {
		if (event.method === "Page.frameAttached") {
			const frameId = string(event.params.frameId), parentFrameId = string(event.params.parentFrameId);
			if (frameId && parentFrameId && !this.frames.has(`${target.sessionId}:${frameId}`)) {
				this.frames.set(`${target.sessionId}:${frameId}`, { targetId: target.targetId, sessionId: target.sessionId, frameId, parentFrameId, url: "about:blank", securityOrigin: "null" });
			}
		} else if (event.method === "Page.frameNavigated") {
			const frame = record(event.params.frame);
			if (frame) this.saveFrame(target, frame);
		} else if (event.method === "Page.frameDetached") {
			this.removeFrameTree(target.sessionId, string(event.params.frameId));
		} else if (event.method === "Runtime.executionContextCreated") {
			const context = record(event.params.context), aux = record(context?.auxData);
			const frameId = string(aux?.frameId);
			if (frameId && aux?.isDefault === true && typeof context?.id === "number") {
				const key = `${target.sessionId}:${frameId}`;
				const frame = this.frames.get(key);
				if (frame) frame.executionContextId = context.id;
				this.contexts.set(`${target.sessionId}:${context.id}`, key);
			}
		} else if (event.method === "Runtime.executionContextsCleared") {
			for (const frame of this.frames.values()) if (frame.sessionId === target.sessionId) delete frame.executionContextId;
			for (const key of this.contexts.keys()) if (key.startsWith(`${target.sessionId}:`)) this.contexts.delete(key);
		} else if (event.method === "Runtime.executionContextDestroyed") {
			const key = `${target.sessionId}:${event.params.executionContextId}`;
			const frameKey = this.contexts.get(key);
			if (frameKey) { const frame = this.frames.get(frameKey); if (frame && frame.executionContextId === event.params.executionContextId) delete frame.executionContextId; this.contexts.delete(key); }
		}
	}

	private projectEvent(event: CdpEvent): void {
		for (const listener of [...this.listeners]) {
			try { void Promise.resolve(listener(event)).catch(() => this.dispose()); }
			catch { this.dispose(); }
		}
	}

	private attached(event: CdpEvent): void {
		const info = record(event.params.targetInfo), sessionId = string(event.params.sessionId), targetId = string(info?.targetId);
		if (!info || !sessionId || !targetId) { this.dispose(); return; }
		const parentId = string(info.parentId);
		const parent = event.sessionId ? this.sessions.get(event.sessionId) : parentId ? this.targets.get(parentId) : undefined;
		const openerId = string(info.openerId);
		const opener = openerId ? this.targets.get(openerId) : undefined;
		const root = this.requestedRoots.has(targetId);
		if (!root && !parent && !opener) { this.dispose(); return; } // Unexpected auto-attachment is not silently adopted.
		const existing = this.targets.get(targetId);
		if (existing) { if (existing.sessionId !== sessionId) this.dispose(); return; }
		const target: ManagedCdpTarget = { targetId, sessionId, type: string(info.type) ?? "unknown", url: typeof info.url === "string" ? info.url : "", rootTargetId: root ? targetId : (parent ?? opener)!.rootTargetId, parentTargetId: (parent ?? opener)?.targetId, openerId, waitingForDebugger: event.params.waitingForDebugger === true };
		this.targets.set(targetId, target); this.sessions.set(sessionId, target);
		this.initializingEvents.set(targetId, []);
		this.queuedEvents.set(targetId, []);
		const registration = this.register(target);
		this.registrations.set(targetId, registration);
		void registration.then(() => {
			const events = this.queuedEvents.get(targetId) ?? [];
			this.queuedEvents.delete(targetId);
			if (this.sessions.get(sessionId) !== target) return;
			for (const queued of events) this.projectEvent(queued);
		}, () => this.dispose());
	}

	private async register(target: ManagedCdpTarget): Promise<void> {
		await this.revalidate();
		const command = async <T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
			await this.revalidate();
			if (this.sessions.get(target.sessionId) !== target) throw failure("target_missing", "Managed target is no longer attached.");
			return await this.connection.command<T>(method, params, target.sessionId, { signal: this.signal });
		};
		await cancellable(this.options.register({ target: Object.freeze({ ...target }), signal: this.signal, command }), this.signal);
		await command("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
		if (target.type === "page" || target.type === "iframe") {
			await command("Page.enable");
			const tree = await command<{ frameTree?: unknown }>("Page.getFrameTree");
			this.saveTree(target, tree.frameTree);
			// The frame-tree reply may predate events observed while Fetch/ Page were enabling.
			for (const event of this.initializingEvents.get(target.targetId) ?? []) this.updateFrameEvent(target, event);
		}
		this.initializingEvents.delete(target.targetId);
		await command("Runtime.enable");
		await this.revalidate();
		if (target.waitingForDebugger) await command("Runtime.runIfWaitingForDebugger");
		target.waitingForDebugger = false;
	}

	private saveTree(target: ManagedCdpTarget, value: unknown): void {
		const tree = record(value), frame = record(tree?.frame);
		if (frame) this.saveFrame(target, frame);
		if (Array.isArray(tree?.childFrames)) for (const child of tree.childFrames) this.saveTree(target, child);
	}
	private saveFrame(target: ManagedCdpTarget, value: Record<string, unknown>): void {
		const frameId = string(value.id);
		if (!frameId || typeof value.url !== "string" || typeof value.securityOrigin !== "string") return;
		const key = `${target.sessionId}:${frameId}`;
		this.removeFrameTree(target.sessionId, frameId);
		this.frames.set(key, { targetId: target.targetId, sessionId: target.sessionId, frameId, parentFrameId: string(value.parentId), url: value.url, securityOrigin: value.securityOrigin, loaderId: string(value.loaderId) });
		if (!string(value.parentId)) target.url = value.url;
	}
	private removeFrameTree(sessionId: string, frameId?: string): void {
		if (!frameId) return;
		for (const frame of [...this.frames.values()]) if (frame.sessionId === sessionId && frame.parentFrameId === frameId) this.removeFrameTree(sessionId, frame.frameId);
		const key = `${sessionId}:${frameId}`;
		this.frames.delete(key);
		for (const [context, frame] of this.contexts) if (frame === key) this.contexts.delete(context);
	}
	private remove(target: ManagedCdpTarget): void {
		for (const child of [...this.targets.values()]) if (child.parentTargetId === target.targetId) this.remove(child);
		this.connection.rejectSession(target.sessionId);
		this.initializingEvents.delete(target.targetId); this.queuedEvents.delete(target.targetId);
		this.targets.delete(target.targetId); this.sessions.delete(target.sessionId); this.registrations.delete(target.targetId); this.requestedRoots.delete(target.targetId); this.managing.delete(target.targetId);
		for (const frame of [...this.frames.values()]) if (frame.sessionId === target.sessionId) this.removeFrameTree(target.sessionId, frame.frameId);
	}

	/** Disconnect on shutdown/reload/tree/switch. This never closes tabs or terminates the browser. */
	dispose(): void {
		if (this.closed) return;
		this.closed = true;
		this.lifetime.abort(); this.connection.close();
		if (this.externalAbort) this.options.signal?.removeEventListener("abort", this.externalAbort);
		this.initializingEvents.clear(); this.queuedEvents.clear();
		this.targets.clear(); this.sessions.clear(); this.frames.clear(); this.contexts.clear(); this.registrations.clear(); this.requestedRoots.clear(); this.managing.clear(); this.listeners.clear();
	}
}
