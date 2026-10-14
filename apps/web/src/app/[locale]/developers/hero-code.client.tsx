"use client";

import { useEffect, useMemo, useState } from "react";
import { sliceTokens, TOKEN_CLASS, tokenizeCode } from "./code-tokens";

const CHARS_PER_TICK = 4;
const TICK_MS = 18;
const NEWLINE_PAUSE_MS = 90;

function Tokens({ source, length }: { source: string; length?: number }) {
  const tokens = useMemo(() => tokenizeCode(source), [source]);
  const visible = length === undefined ? tokens : sliceTokens(tokens, length);
  return (
    <>
      {visible.map((token, index) =>
        token.kind === "plain" ? (
          token.value
        ) : (
          <span key={index} className={TOKEN_CLASS[token.kind]}>
            {token.value}
          </span>
        ),
      )}
    </>
  );
}

/**
 * Hero code sample. The server render (and therefore the no-JS page) contains
 * the full, highlighted code. With JS and without prefers-reduced-motion, the
 * code is typed in once, over about four seconds, in an overlay; the full
 * copy keeps its place in the grid so nothing shifts, and is shown again when
 * typing finishes.
 */
export function HeroCode({ source }: { source: string }) {
  const [typed, setTyped] = useState<number | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let length = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      length = Math.min(source.length, length + CHARS_PER_TICK);
      setTyped(length);
      if (length >= source.length) {
        timer = setTimeout(() => setTyped(null), 250);
        return;
      }
      const chunk = source.slice(length - CHARS_PER_TICK, length);
      timer = setTimeout(
        step,
        chunk.includes("\n") ? NEWLINE_PAUSE_MS : TICK_MS,
      );
    };
    setTyped(0);
    timer = setTimeout(step, 200);
    return () => clearTimeout(timer);
  }, [source]);

  const typing = typed !== null;
  const pre =
    "m-0 overflow-x-auto whitespace-pre bg-transparent p-0 font-brand-mono text-[12.5px] leading-[1.7] text-[var(--dl-text)] [grid-area:1/1] md:text-[13px]";

  return (
    <div className="grid px-4 pb-4 pt-4 md:px-5">
      <pre className={`${pre} ${typing ? "invisible" : ""}`}>
        <code>
          <Tokens source={source} />
        </code>
      </pre>
      {typing && (
        <pre aria-hidden className={pre}>
          <code>
            <Tokens source={source} length={typed} />
            <span className="ms-px inline-block h-[1.05em] w-[7px] translate-y-[2px] bg-[var(--dl-text)] motion-safe:animate-[dl-caret_1s_steps(1)_infinite]" />
          </code>
        </pre>
      )}
    </div>
  );
}
