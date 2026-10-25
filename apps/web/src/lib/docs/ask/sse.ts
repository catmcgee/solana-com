/**
 * Server-sent events from POST /chat. Rewritten from Bri's parser, which
 * split only on "\n\n", dropped a final event without a trailing blank
 * line, and treated a stream that ended without `done` as a finished (and
 * cached) answer. Here:
 * - events split on LF or CRLF blank lines; multi-line `data:` is joined;
 * - the decoder and leftover buffer are flushed at the end of the stream;
 * - a stream that ends without `done` or `error` reports `incomplete`.
 * The agent's `answer_status` stages feed the status row like `status`;
 * `trace` checkpoints are ignored.
 */
import {
  askErrorKindForEvent,
  isRecord,
  toAskGenerativeUi,
  toDonePayload,
  type AskDonePayload,
  type AskErrorKind,
  type AskGenerativeUi,
} from "./protocol";

export type SseEvent = { event: string; data: string };

const EVENT_SEPARATOR = /\r?\n\r?\n/;

/** One event block (`event:` / `data:` lines; `:` comments ignored). */
export function parseSseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value.trim() || "message";
    else if (field === "data") data.push(value);
  }
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

/**
 * Reads `body` to the end, calling `onEvent` for each event. Returning
 * false from `onEvent` stops reading and cancels the stream.
 */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => boolean | void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const blocks = buffer.split(EVENT_SEPARATOR);
    buffer = done ? "" : (blocks.pop() ?? "");
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event && onEvent(event) === false) {
        await reader.cancel().catch(() => undefined);
        return;
      }
    }
    if (done) return;
  }
}

export type AskStreamHandlers = {
  /** Raw stage from `status` or `answer_status`, e.g. "reading_doc". */
  onStatus?: (stage: string) => void;
  onDelta: (text: string) => void;
  /** Raw stage from `ui_status`, e.g. "building_visual". */
  onUiStatus?: (stage: string) => void;
  /** A visual, sent early (`ui_done`) while the text may still stream. */
  onGenerativeUi?: (ui: AskGenerativeUi) => void;
  /**
   * `ui_done` without a visual: none could be made, or the agent withdrew
   * the one it sent (`discarded`, e.g. beside its "not enough cited
   * documentation" answer). Any visual shown must go.
   */
  onGenerativeUiWithdrawn?: () => void;
  onDone: (payload: AskDonePayload) => void;
  onError: (kind: AskErrorKind, detail?: string) => void;
};

/** How a chat stream ended. */
export type AskStreamOutcome = "done" | "error" | "incomplete";

function parseData(data: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(data);
    return isRecord(parsed) ? parsed : { text: data, message: data };
  } catch {
    // Tolerate plain-text data payloads.
    return { text: data, message: data };
  }
}

/**
 * Dispatches a chat stream's events to `handlers` and reports how it ended.
 * Calls exactly one of onDone / onError, unless reading throws (the caller
 * maps that error).
 */
export async function consumeAskStream(
  body: ReadableStream<Uint8Array>,
  handlers: AskStreamHandlers,
  locale?: string | null,
): Promise<AskStreamOutcome> {
  let outcome: AskStreamOutcome = "incomplete";
  let sawDelta = false;

  await readSse(body, ({ event, data }) => {
    const payload = parseData(data);
    switch (event) {
      case "status":
      case "answer_status":
        handlers.onStatus?.(String(payload.stage ?? payload.status ?? ""));
        return;
      case "ui_status":
        handlers.onUiStatus?.(
          String(payload.stage ?? payload.status ?? "building_visual"),
        );
        return;
      case "delta":
        if (typeof payload.text === "string" && payload.text) {
          sawDelta = true;
          handlers.onDelta(payload.text);
        }
        return;
      case "ui_done": {
        const raw =
          "generative_ui" in payload
            ? payload.generative_ui
            : payload.generativeUi;
        const ui = toAskGenerativeUi(raw);
        if (ui) handlers.onGenerativeUi?.(ui);
        // A malformed visual is skipped; only an explicit "none" withdraws.
        else if (raw === null || payload.discarded === true) {
          handlers.onGenerativeUiWithdrawn?.();
        }
        return;
      }
      case "done": {
        const done = toDonePayload(payload, locale);
        if (!sawDelta && done.response) handlers.onDelta(done.response);
        outcome = "done";
        handlers.onDone(done);
        return false;
      }
      case "error": {
        outcome = "error";
        const detail =
          typeof payload.message === "string" ? payload.message : undefined;
        handlers.onError(askErrorKindForEvent(payload), detail);
        return false;
      }
    }
  });

  if (outcome === "incomplete") handlers.onError("incomplete");
  return outcome;
}
