"use client";

import { useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";

/**
 * "Is this page helpful?" under every docs page, ported from the docs app
 * before the move (apps/docs rate.tsx): thumbs up or down open a feedback
 * box; the reply (feedback-action.ts) streams in below it.
 */
export interface Feedback {
  opinion: "positive" | "negative";
  message: string;
}

type Opinion = Feedback["opinion"];

function Thumb({ down }: { down?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={down ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

export function Rate({
  onRateAction,
}: {
  onRateAction: (
    url: string,
    feedback: Feedback,
  ) => Promise<ReadableStream<string>>;
}) {
  const pathname = usePathname();
  const [opinion, setOpinion] = useState<Opinion | null>(null);
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showResponse, setShowResponse] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || !opinion) return;
    setStreaming(true);
    setResponse("");
    try {
      const reader = (
        await onRateAction(pathname, { opinion, message })
      ).getReader();
      let first = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setResponse((prev) => prev + value);
        if (first) {
          setStreaming(false);
          first = false;
        }
      }
    } catch (error) {
      console.error("Error processing feedback:", error);
      setResponse("Error processing your feedback. Please try again.");
    } finally {
      setStreaming(false);
    }
  }

  const open = opinion !== null || response !== "";

  return (
    <div className="docs-rate" data-open={open ? "" : undefined}>
      <div className="docs-rate-row">
        <p className="docs-rate-label">Is this page helpful?</p>
        {(["positive", "negative"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className="docs-rate-button"
            aria-pressed={opinion === value}
            aria-label={value === "positive" ? "Yes" : "No"}
            disabled={response !== ""}
            onClick={() => setOpinion(opinion === value ? null : value)}
          >
            <Thumb down={value === "negative"} />
          </button>
        ))}
      </div>
      {open ? (
        <div className="docs-rate-body">
          {showResponse ? (
            <div className="docs-rate-response">
              <button
                type="button"
                className="docs-rate-action"
                onClick={() => {
                  setShowResponse(false);
                  setMessage("");
                  setResponse("");
                }}
              >
                Have more feedback?
              </button>
              <div className="prose prose-sm docs-rate-markdown">
                <ReactMarkdown
                  components={{
                    a: (props) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" />
                    ),
                  }}
                >
                  {response}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="docs-rate-form">
              <textarea
                autoFocus
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="docs-rate-input"
                placeholder="Please share your feedback to help improve this content."
                onKeyDown={(event) => {
                  if (!event.shiftKey && event.key === "Enter") submit(event);
                }}
              />
              <div>
                {streaming ? (
                  <button type="button" className="docs-rate-action" disabled>
                    Searching for additional resources you might find
                    helpful...
                  </button>
                ) : response ? (
                  <button
                    type="button"
                    className="docs-rate-action"
                    onClick={() => setShowResponse(true)}
                  >
                    View Response
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="docs-rate-action"
                    disabled={!message.trim()}
                  >
                    Submit
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
