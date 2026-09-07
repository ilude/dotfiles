export class GatewayCircuit {
	private key = "";
	private failures = 0;
	private openedUntil = 0;
	private probing = false;
	private now: () => number;
	constructor(now: () => number = Date.now) { this.now = now; }
	configure(endpoint: string, credential: string): void {
		const key = `${endpoint}\0${credential}`;
		if (key !== this.key) { this.key = key; this.failures = 0; this.openedUntil = 0; this.probing = false; }
	}
	acquire(): boolean {
		if (!this.openedUntil) return true;
		if (this.now() < this.openedUntil || this.probing) return false;
		this.probing = true;
		return true;
	}
	reachable(): void { this.failures = 0; this.openedUntil = 0; this.probing = false; }
	unavailable(): void {
		this.failures++;
		if (this.probing || this.failures >= 3) this.openedUntil = this.now() + 30_000;
		this.probing = false;
	}
	cancelled(): void { this.probing = false; }
}
