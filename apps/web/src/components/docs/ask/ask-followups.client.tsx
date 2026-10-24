"use client";

import { cn } from "@/app/components/utils";
import { askStore, type CodeFollowups } from "@/lib/docs/ask/store";
import { focusRing } from "./ui";

/**
 * The agent's own follow-ups ("Want to see this in code?" with a button per
 * language); nothing is invented here. A chip asks its message as the next
 * question and leaves an attached page in the composer.
 */
export function AskFollowups({
  followups,
  prompt,
}: {
  followups: CodeFollowups;
  /** The prompt line, taken off the end of the answer text. */
  prompt: string | null;
}) {
  return (
    <div className="mt-5">
      {prompt ? (
        <p className="m-0 text-[13px] leading-5 text-[var(--sol-muted)]">
          {prompt}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {followups.buttons.map((button) => (
          <button
            key={`${button.type}:${button.label}`}
            type="button"
            onClick={() => askStore.send(button.message, { pageContext: null })}
            className={cn(
              "rounded-full border border-[var(--sol-line)] px-3 py-1 text-[13px] leading-5 text-[var(--sol-muted)] transition-colors duration-150 hover:border-[var(--sol-purple-line)] hover:bg-[var(--sol-purple-soft)] hover:text-[var(--sol-purple-text)] motion-reduce:transition-none",
              focusRing,
            )}
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}
