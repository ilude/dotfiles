import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CONNECTION_EXPIRED = /^Codex error: Responses websocket connection limit reached \(\d+ minutes\)\. Create a new websocket connection to continue\.$/;

export default function codexWebSocketRecovery(pi: ExtensionAPI): void {
  let markedForRetry = false;

  pi.on("message_end", ({ message }) => {
    if (markedForRetry || message.role !== "assistant" || message.provider !== "openai-codex" ||
        message.api !== "openai-codex-responses" || message.stopReason !== "error" ||
        !message.errorMessage || !CONNECTION_EXPIRED.test(message.errorMessage)) return;

    // Pi 1.5.2 classifies retryable failures by message text. The stock provider
    // has closed this socket. Name that transport failure so Pi's native retry
    // drops the failed response from context and reports recovery to RPC hosts.
    markedForRetry = true;
    return { message: { ...message, errorMessage: `Codex WebSocket closed: ${message.errorMessage}` } };
  });

  // Retries emit another agent_start. Reset at settlement, not between attempts.
  const reset = () => { markedForRetry = false; };
  pi.on("agent_settled", reset);
  pi.on("session_start", reset);
}
