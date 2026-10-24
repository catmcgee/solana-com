import { describe, expect, it, vi } from "vitest";
import {
  consumeAskStream,
  parseSseBlock,
  readSse,
  type AskStreamHandlers,
} from "@/lib/docs/ask/sse";

/** A body that delivers `chunks` as separate reads. */
function streamOf(
  chunks: Array<string | Uint8Array>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          typeof chunk === "string" ? encoder.encode(chunk) : chunk,
        );
      }
      controller.close();
    },
  });
}

function handlers() {
  return {
    onStatus: vi.fn(),
    onDelta: vi.fn(),
    onUiStatus: vi.fn(),
    onGenerativeUi: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  } satisfies AskStreamHandlers;
}

const ui = {
  version: "solana-docs-ui/v1",
  kind: "answer",
  components: [{ type: "answer_intro", title: "Hi" }],
};

describe("parseSseBlock", () => {
  it("joins multi-line data and ignores comments", () => {
    expect(parseSseBlock(": ping\nevent: delta\ndata: a\ndata:  b")).toEqual({
      event: "delta",
      data: "a\n b",
    });
    expect(parseSseBlock("event: done")).toBeNull();
    expect(parseSseBlock("data: x")).toEqual({ event: "message", data: "x" });
  });
});

describe("readSse", () => {
  it("splits CRLF events and flushes a final event with no blank line", async () => {
    const events: string[] = [];
    await readSse(
      streamOf([
        "event: a\r\ndata: 1\r\n\r\nevent: b\r\n",
        "data: 2\r\n\r\nevent: c\ndata: 3",
      ]),
      ({ event, data }) => {
        events.push(`${event}=${data}`);
      },
    );
    expect(events).toEqual(["a=1", "b=2", "c=3"]);
  });

  it("decodes characters split across reads", async () => {
    const bytes = new TextEncoder().encode(
      'event: delta\ndata: {"text":"⟶ ✨"}\n\n',
    );
    const events: string[] = [];
    await readSse(
      streamOf([bytes.slice(0, 26), bytes.slice(26, 29), bytes.slice(29)]),
      ({ data }) => {
        events.push(data);
      },
    );
    expect(events).toEqual(['{"text":"⟶ ✨"}']);
  });

  it("stops reading when the handler returns false", async () => {
    const events: string[] = [];
    await readSse(streamOf(["data: 1\n\ndata: 2\n\n"]), ({ data }) => {
      events.push(data);
      return false;
    });
    expect(events).toEqual(["1"]);
  });
});

describe("consumeAskStream", () => {
  it("dispatches status, deltas, an early visual and done", async () => {
    const h = handlers();
    const outcome = await consumeAskStream(
      streamOf([
        'event: status\ndata: {"stage":"searching_docs"}\n\n',
        'event: delta\ndata: {"text":"Hello "}\n\n',
        `event: ui_done\ndata: ${JSON.stringify({ generative_ui: ui })}\n\n`,
        'event: ui_status\ndata: {"stage":"building_visual"}\n\n',
        'event: delta\ndata: {"text":"world"}\n\n',
        'event: done\ndata: {"run_id":12,"conversation_id":3,"citations":[{"title":"PDA","url":"/docs/core/pda"}]}',
      ]),
      h,
      "ja",
    );
    expect(outcome).toBe("done");
    expect(h.onStatus).toHaveBeenCalledWith("searching_docs");
    expect(h.onUiStatus).toHaveBeenCalledWith("building_visual");
    expect(h.onGenerativeUi).toHaveBeenCalledWith(ui);
    expect(h.onDelta.mock.calls.map(([text]) => text).join("")).toBe(
      "Hello world",
    );
    expect(h.onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "12",
        conversationId: "3",
        citations: [{ title: "PDA", url: "/ja/developers/docs/core/pda" }],
      }),
    );
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("reports incomplete when the stream ends without done", async () => {
    const h = handlers();
    const outcome = await consumeAskStream(
      streamOf(['event: delta\ndata: {"text":"Partial"}\n\n']),
      h,
    );
    expect(outcome).toBe("incomplete");
    expect(h.onDone).not.toHaveBeenCalled();
    expect(h.onError).toHaveBeenCalledWith("incomplete");
  });

  it("reports a stream error once and ignores what follows", async () => {
    const h = handlers();
    const outcome = await consumeAskStream(
      streamOf([
        'event: error\ndata: {"error":"rate_limited","message":"Slow down"}\n\n',
        'event: done\ndata: {"run_id":"r"}\n\n',
      ]),
      h,
    );
    expect(outcome).toBe("error");
    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onError).toHaveBeenCalledWith("rateLimited", "Slow down");
    expect(h.onDone).not.toHaveBeenCalled();
  });

  it("uses the done response as the text when nothing streamed", async () => {
    const h = handlers();
    await consumeAskStream(
      streamOf(['event: done\ndata: {"response":"Complete answer."}\n\n']),
      h,
    );
    expect(h.onDelta).toHaveBeenCalledWith("Complete answer.");
    expect(h.onDone).toHaveBeenCalledWith(
      expect.objectContaining({ response: "Complete answer." }),
    );
  });

  it("accepts plain-text delta data and skips invalid visuals", async () => {
    const h = handlers();
    await consumeAskStream(
      streamOf([
        "event: delta\ndata: plain text\n\n",
        'event: ui_done\ndata: {"generative_ui":{"version":"v0"}}\n\n',
        "event: done\ndata: {}\n\n",
      ]),
      h,
    );
    expect(h.onDelta).toHaveBeenCalledWith("plain text");
    expect(h.onGenerativeUi).not.toHaveBeenCalled();
  });
});
