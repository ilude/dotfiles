// Pi RPC is LF-delimited JSON, not readline's CR/CRLF-delimited text.
export class JsonLines {
  private buffered = Buffer.alloc(0);
  private length = 0;
  private readonly receive: (value: unknown) => void;
  private readonly limit: number;
  constructor(receive: (value: unknown) => void, limit = 1024 * 1024) { this.receive = receive; this.limit = limit; }
  private diagnostic() {
    // Event type only: never echo message text, tool arguments, credentials or reasoning.
    const prefix = this.buffered.subarray(0, Math.min(this.length, 256)).toString("utf8");
    return /"type"\s*:\s*"([a-zA-Z0-9_-]{1,64})"/.exec(prefix)?.[1] ?? "unknown";
  }
  push(chunk: Buffer): void {
    let start = 0;
    for (;;) {
      const end = chunk.indexOf(10, start);
      const part = chunk.subarray(start, end < 0 ? chunk.length : end);
      const size = this.length + part.length;
      if (size > this.limit) {
        // Capture a bounded envelope prefix even when the first chunk exceeds the bound.
        if (!this.length) { this.buffered = Buffer.from(part.subarray(0, 256)); this.length = this.buffered.length; }
        throw new Error(`JSONL frame exceeds byte limit (type=${this.diagnostic()}, receivedAtLeast=${size}, limit=${this.limit})`);
      }
      if (size > this.buffered.length) {
        const grown = Buffer.allocUnsafe(Math.min(this.limit, Math.max(size, this.buffered.length * 2, 4096)));
        this.buffered.copy(grown, 0, 0, this.length);
        this.buffered = grown;
      }
      part.copy(this.buffered, this.length);
      this.length = size;
      if (end < 0) return;
      if (!this.length) throw new Error("Empty JSONL frame");
      const frame = this.buffered.subarray(0, this.length).toString("utf8");
      this.length = 0;
      let value: unknown;
      try { value = JSON.parse(frame); } catch { throw new Error("Malformed JSONL frame"); }
      this.receive(value);
      // Do not retain a large aggregate buffer for the rest of a retained conversation.
      if (this.buffered.length > 64 * 1024) this.buffered = Buffer.alloc(0);
      start = end + 1;
      if (start === chunk.length) return;
    }
  }
  end(): void {
    if (this.length) throw new Error(`Incomplete JSONL frame (type=${this.diagnostic()}, received=${this.length})`);
  }
}
