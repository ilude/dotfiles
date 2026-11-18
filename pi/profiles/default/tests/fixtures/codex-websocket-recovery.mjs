// Feed the stock Codex provider deterministic frames; no model service is contacted.
const expiry = {
  type: "error",
  code: "websocket_connection_limit_reached",
  message: "Responses websocket connection limit reached (60 minutes). Create a new websocket connection to continue.",
};
const readCall = {
  type: "function_call", id: "fc_fixture", call_id: "call_fixture", name: "read",
  arguments: '{"path":"fixture.txt"}',
};
const partial = { type: "message", id: "msg_partial", role: "assistant", content: [] };
const created = id => ({ type: "response.created", response: { id } });
const item = (stage, value) => ({ type: `response.output_item.${stage}`, output_index: 0, item: value });
const completed = (id, output) => ({ type: "response.completed", response: { id, status: "completed", output } });

export default function () {
  let request = 0;
  let socket = 0;
  let expiredSocket;
  const scenario = process.env.CODEX_RECOVERY_FIXTURE;
  globalThis.fetch = async () => { throw new Error("Fixture does not allow HTTP requests"); };
  globalThis.WebSocket = class extends EventTarget {
    id = ++socket;
    readyState = 0;
    constructor() {
      super();
      queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); });
    }
    send(data) {
      const body = JSON.parse(data);
      let frames;
      switch (++request) {
        case 1:
          frames = [created("resp_tool"), item("added", readCall), item("done", readCall), completed("resp_tool", [readCall])];
          break;
        case 2:
          expiredSocket = this;
          frames = [created("resp_interrupted"), item("added", partial),
            { type: "response.output_text.delta", output_index: 0, delta: "incomplete response" },
            scenario === "unrelated" ? { type: "error", code: "invalid_request", message: "Fixture input rejected" } : expiry];
          break;
        default:
          if (scenario === "repeated") {
            frames = [created("resp_interrupted_again"), expiry];
            break;
          }
          const hasToolResult = body.input?.some(entry => entry.type === "function_call_output" &&
            entry.call_id === readCall.call_id && JSON.stringify(entry.output).includes("completed tool result"));
          const freshContext = !body.previous_response_id && !JSON.stringify(body.input).includes("incomplete response");
          const recovered = this !== expiredSocket && expiredSocket.readyState === 3 && hasToolResult && freshContext;
          const reply = { type: "message", id: "msg_final", role: "assistant",
            content: [{ type: "output_text", text: recovered ? "recovered with tool result" : "invalid retry context" }] };
          frames = [created("resp_final"), item("done", reply), completed("resp_final", [reply])];
      }
      for (const frame of frames) {
        queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) })));
      }
    }
    close() { this.readyState = 3; }
  };
}
