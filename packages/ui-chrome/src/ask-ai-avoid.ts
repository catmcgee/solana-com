"use client";

import { useCallback, useRef } from "react";

/**
 * Fixed bars at the bottom of the window (the cookie banner, the podcast
 * player) that the floating Ask AI pill in apps/web
 * (components/docs/ask-ai.client.tsx) move up to stay clear of. A bar
 * carries `data-ask-ai-avoid` and this ref, which announces it when it
 * appears, changes size or goes, so Ask AI measures only then.
 */
export const ASK_AI_AVOID_EVENT = "ask-ai:avoid";

export function useAskAiAvoid() {
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback((el: HTMLElement | null) => {
    const notify = () => window.dispatchEvent(new Event(ASK_AI_AVOID_EVENT));
    observer.current?.disconnect();
    observer.current = null;
    if (!el) {
      notify();
      return;
    }
    // Reports the bar's size once now, then on every change.
    observer.current = new ResizeObserver(notify);
    observer.current.observe(el);
  }, []);
}
