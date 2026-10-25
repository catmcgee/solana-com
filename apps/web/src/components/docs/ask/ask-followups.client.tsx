"use client";

import { useId } from "react";
import { cn } from "@/app/components/utils";
import {
  askStore,
  type AskSuggestedFollowups as Suggestions,
  type CodeFollowups,
} from "@/lib/docs/ask/store";
import { entranceClass, useEntrance } from "./ask-actions.client";
import { focusRing } from "./ui";

/** What a pill shows and the question it asks. */
type Pill = { key: string; label: string; message: string };

/**
 * A prompt and its pills on one row, like the docs' "You've used this in"
 * pills; nothing is invented here. A pill asks its message as the next
 * question and leaves an attached page in the composer.
 */
function FollowupRow({
  prompt,
  pills,
  enter,
  className,
}: {
  prompt: string | null;
  pills: Pill[];
  /** Fade in (once, as the answer finishes). */
  enter: boolean;
  className?: string;
}) {
  const promptId = useId();
  return (
    <div
      role="group"
      aria-labelledby={prompt ? promptId : undefined}
      className={cn(
        "flex flex-wrap items-center gap-2",
        enter && entranceClass,
        className,
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
      {pills.map((pill) => (
        <button
          key={pill.key}
          type="button"
          onClick={() => askStore.send(pill.message, { pageContext: null })}
          className={cn(
            "rounded-full border border-[var(--sol-line)] px-2.5 py-0.5 text-start text-[13px] leading-5 text-[var(--sol-text)] transition-colors duration-150 hover:border-[var(--sol-purple-line)] hover:bg-[var(--sol-purple-soft)] hover:text-[var(--sol-purple-text)] motion-reduce:transition-none",
            focusRing,
          )}
        >
          {pill.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The agent's code follow-ups: "Do you want to see a code example for
 * that?" with a pill per language.
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
  // Shown only under the latest finished answer; fades in with its sources.
  const enter = useEntrance(followups, animate);
  return (
    <FollowupRow
      prompt={prompt}
      pills={followups.buttons.map((button) => ({
        key: `${button.type}:${button.label}`,
        label: button.label,
        message: button.message,
      }))}
      enter={enter}
      className="mt-5 [animation-delay:120ms]"
    />
  );
}

/**
 * The agent's next questions ("Want to keep going? Try one of these:",
 * a next lesson): the same row, under the code follow-ups.
 */
export function AskSuggestedFollowups({
  suggestions,
  afterCode,
  animate = true,
}: {
  suggestions: Suggestions;
  /** Code follow-ups sit right above: a tighter gap, a later fade. */
  afterCode: boolean;
  animate?: boolean;
}) {
  const enter = useEntrance(suggestions, animate);
  if (suggestions.items.length === 0) return null;
  return (
    <FollowupRow
      prompt={suggestions.prompt}
      pills={suggestions.items.map((item, index) => ({
        key: `${index}:${item.message}`,
        label: item.label,
        message: item.message,
      }))}
      enter={enter}
      className={
        afterCode
          ? "mt-3 [animation-delay:160ms]"
          : "mt-5 [animation-delay:120ms]"
      }
    />
  );
}
