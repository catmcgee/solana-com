import type { UIMessage } from "ai";

/**
 * The Ask AI panel's requests to /api/docs-chat, with failures turned into
 * messages a reader can act on. The AI SDK shows a failed response's body
 * as the error, which for a 5xx is often an HTML page, and it shows nothing
 * at all for a 200 that is not an answer stream.
 */
export function askAiErrorMessage(status: number): string {
  if (status === 429)
    return "Ask AI is getting a lot of questions right now. Wait a moment and try again.";
  if (status === 503)
    return "Ask AI isn't available right now. Try again later.";
  if (status === 504 || status === 408)
    return "Ask AI took too long to answer. Try again, or ask a shorter question.";
  if (status >= 500) return "Ask AI couldn't answer just now. Try again.";
  return "Ask AI couldn't read that question. Try rephrasing it.";
}

export const ASK_AI_OFFLINE =
  "Couldn't reach Ask AI. Check your connection and try again.";

export const ASK_AI_EMPTY =
  "No answer came back for this question. Try again, or rephrase it.";

/** `fetch` for the chat transport: non-answers become readable errors. */
export async function askAiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new Error(ASK_AI_OFFLINE);
  }
  if (!response.ok)
    return new Response(askAiErrorMessage(response.status), {
      status: response.status,
    });
  if (!response.headers.get("content-type")?.includes("text/event-stream"))
    return new Response(askAiErrorMessage(502), { status: 502 });
  return response;
}

/** An assistant message that finished without any text to show. */
export function isEmptyAnswer(message: UIMessage): boolean {
  return (
    message.role === "assistant" &&
    !message.parts.some((part) => part.type === "text" && part.text.trim())
  );
}
