/** Let the TUI paint feedback before a command starts slower work. */
export function yieldForUi(): Promise<void> {
	// Fake-timer test runtimes do not paint and may leave setImmediate pending.
	if (Object.prototype.hasOwnProperty.call(setImmediate, "clock")) return Promise.resolve();
	return new Promise((resolve) => setImmediate(resolve));
}
