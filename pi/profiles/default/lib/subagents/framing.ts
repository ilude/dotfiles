// Pi RPC is LF-delimited JSON, not readline's CR/CRLF-delimited text.
export class JsonLines {
  private buffered = Buffer.alloc(0);
  private readonly receive: (value: unknown) => void;
  private readonly limit: number;
  constructor(receive: (value: unknown) => void, limit = 1024 * 1024) { this.receive = receive; this.limit = limit; }
  push(chunk: Buffer): void {
    let start = 0;
    for (;;) {
      const end = chunk.indexOf(10, start);
      const part = chunk.subarray(start, end < 0 ? chunk.length : end);
      if (this.buffered.length + part.length > this.limit) throw new Error("JSONL frame exceeds byte limit");
      this.buffered = Buffer.concat([this.buffered, part]);
      if (end < 0) return;
      const frame = this.buffered;
      this.buffered = Buffer.alloc(0);
      if (!frame.length) throw new Error("Empty JSONL frame");
      this.receive(JSON.parse(frame.toString("utf8")));
      start = end + 1;
      if (start === chunk.length) return;
    }
  }
  end(): void {
    if (this.buffered.length) throw new Error("Incomplete JSONL frame");
  }
}
