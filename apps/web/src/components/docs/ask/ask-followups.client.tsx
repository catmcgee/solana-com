"use client";

import { useId } from "react";
import { cn } from "@/app/components/utils";
import { askStore, type CodeFollowups } from "@/lib/docs/ask/store";
import { entranceClass, useEntrance } from "./ask-actions.client";
import { focusRing } from "./ui";

/**
 * The agent's own follow-ups ("Want to see this in code?" with a button per
 * language), on one row like the docs' "You've used this in" pills; nothing
 * is invented here. A pill asks its message as the next question and leaves
 * an attached page in the composer.
 */
export function AskFollowups({
  followups,
  prompt,
  animate = true,
}: {
  followups: CodeFollowups;
  /** The prompt line, taken off the end of the answer text. */
  prompt: string | null;
  /** Fade in once (false: an answer restored as it was, on reload). */
  animate?: boolean;
}) {
  const promptId = useId();
  // Shown only under the latest finished answer; fades in with its sources.
  const enter = useEntrance(followups, animate);
  return (
    <div
      role="group"
      aria-labelledby={prompt ? promptId : undefined}
      className={cn(
        "mt-5 flex flex-wrap items-center gap-2",
        enter && cn(entranceClass, "[animation-delay:120ms]"),
      )}
    >
      {prompt ? (
        <p
          id={promptId}
          className="m-0 me-0.5 text-[13px] leading-5 text-[var(--sol-muted)]"
        >
          {prompt}
        </p>
      ) : null}
      {followups.buttons.map((button) => (
        <button
          key={`${button.type}:${button.label}`}
          type="button"
          onClick={() => askStore.send(button.message, { pageContext: null })}
          className={cn(
            "rounded-full border border-[var(--sol-line)] px-2.5 py-0.5 text-[13px] leading-5 text-[var(--sol-text)] transition-colors duration-150 hover:border-[var(--sol-purple-line)] hover:bg-[var(--sol-purple-soft)] hover:text-[var(--sol-purple-text)] motion-reduce:transition-none",
            focusRing,
          )}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
