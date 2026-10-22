"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, SparkleIcon } from "./docs-ui-icons";

/**
 * Interactive pieces of the docs content components (docs-components.tsx):
 * tabs, code groups and the code copy button. Server-rendered with every
 * panel in the markup (inactive ones `hidden`), so the content reads without
 * JavaScript (nojs.css shows all panels then).
 */

const STORAGE_PREFIX = "docs-tab:";

/** Tab choice shared by every tab set with the same labels (Kit / web3.js). */
function useSyncedTab(labels: string[]) {
  const key = STORAGE_PREFIX + labels.join("|");
  const [active, setActive] = useState(0);
  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; label: string }>)
        .detail;
      if (detail.key !== key) return;
      const index = labels.indexOf(detail.label);
      if (index >= 0) setActive(index);
    };
    window.addEventListener("docs-tab-sync", onSync);
    return () => window.removeEventListener("docs-tab-sync", onSync);
  }, [key, labels]);
  const choose = (index: number) => {
    setActive(index);
    window.dispatchEvent(
      new CustomEvent("docs-tab-sync", {
        detail: { key, label: labels[index] },
      }),
    );
  };
  return [active, choose] as const;
}

function slug(label: string) {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

/** The reader's operating system, as the OS tab labels name them. */
function detectOs(): string | null {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const p = nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
  if (/win/i.test(p)) return "Windows";
  if (/mac|iphone|ipad|ipod/i.test(p)) return "macOS";
  if (/linux|x11|cros|android/i.test(p)) return "Linux";
  return null;
}

export function TabsClient({
  labels,
  panels,
}: {
  labels: string[];
  panels: ReactNode[];
}) {
  const [active, choose] = useSyncedTab(labels);
  const base = useId();
  const root = useRef<HTMLDivElement>(null);
  // OS tabs (<div className="sol-os-tabs"> around macOS / Linux / Windows
  // tabs): the reader's OS moves first and is selected. Without JavaScript,
  // or on another OS, the content order stays (was apps/docs/os-tabs.js).
  const [osFirst, setOsFirst] = useState(-1);
  useEffect(() => {
    if (!root.current?.closest(".sol-os-tabs")) return;
    const os = detectOs();
    const index = os ? labels.findIndex((l) => l.trim().startsWith(os)) : -1;
    if (index < 0) return;
    setOsFirst(index);
    choose(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="tabs tab-container" ref={root}>
      <ul
        className="not-prose tabs-list"
        role="tablist"
        data-component-part="tabs-list"
      >
        {labels.map((label, i) => (
          <li
            key={i}
            id={slug(label)}
            role="tab"
            aria-selected={i === active}
            aria-controls={`${base}-panel-${i}`}
            className="tabs-tab"
            style={i === osFirst ? { order: -1 } : undefined}
            tabIndex={i === active ? 0 : -1}
            onClick={() => choose(i)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") choose((i + 1) % labels.length);
              if (event.key === "ArrowLeft")
                choose((i - 1 + labels.length) % labels.length);
            }}
          >
            <div
              data-component-part="tab-button"
              data-active={i === active ? "true" : "false"}
              className="tab-button"
            >
              {label}
            </div>
          </li>
        ))}
      </ul>
      <div>
        {panels.map((panel, i) => (
          <div
            key={i}
            id={`${base}-panel-${i}`}
            role="tabpanel"
            data-component-part="tab-content"
            className={
              i === active ? "prose tab-panel" : "prose tab-panel hidden"
            }
          >
            {panel}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CopyCodeButton({ className }: { className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className={`code-block-copy-button ${className ?? ""}`}>
      <button
        ref={ref}
        type="button"
        data-testid="copy-code-button"
        aria-label="Copy the contents from the code block"
        className="code-copy"
        onClick={() => {
          const root =
            ref.current?.closest("[data-code-copy-scope]") ??
            ref.current?.closest(".code-block");
          const panel =
            root?.querySelector('[role="tabpanel"]:not([hidden]) pre') ??
            root?.querySelector("pre");
          const text = panel?.textContent ?? "";
          void navigator.clipboard.writeText(text).then(() => setCopied(true));
        }}
      >
        {copied ? (
          <CheckIcon className="code-copy-icon is-copied" />
        ) : (
          <CopyIcon className="code-copy-icon" />
        )}
      </button>
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}

/** Event the docs Ask AI listens for: ask about a code block. */
export const DOCS_ASK_CODE_EVENT = "docs-ask-ai:code";

/** "Ask Assistant" next to Copy: hands the block's code to Ask AI. */
export function AskCodeButton() {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div className="code-block-ask-button">
      <button
        ref={ref}
        type="button"
        aria-label="Ask Assistant"
        className="code-copy"
        onClick={() => {
          const root =
            ref.current?.closest("[data-code-copy-scope]") ??
            ref.current?.closest(".code-block");
          const pre =
            root?.querySelector('[role="tabpanel"]:not([hidden]) pre') ??
            root?.querySelector("pre");
          window.dispatchEvent(
            new CustomEvent(DOCS_ASK_CODE_EVENT, {
              detail: { code: pre?.textContent ?? "" },
            }),
          );
        }}
      >
        <SparkleIcon className="code-copy-icon" />
      </button>
    </div>
  );
}

/**
 * <CodeGroup>, <RequestExample>, <ResponseExample>: the fences inside as one
 * box with a tab per fence (its title, else its language).
 */
export function CodeGroupClient({
  labels,
  panels,
  variant,
}: {
  labels: string[];
  panels: ReactNode[];
  variant?: "api";
}) {
  const [active, choose] = useSyncedTab(labels);
  const base = useId();
  return (
    <div className="code-group" data-variant={variant} data-code-copy-scope="">
      <div
        className="code-group-tab-bar"
        data-component-part="code-group-tab-bar"
      >
        <div className="code-group-tabs" role="tablist">
          {labels.map((label, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              id={`${base}-tab-${i}`}
              aria-selected={i === active}
              aria-controls={`${base}-panel-${i}`}
              data-active={i === active ? "" : undefined}
              className="code-group-tab"
              onClick={() => choose(i)}
            >
              <div className="code-group-tab-label">{label}</div>
              <div className="code-group-tab-underline" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="code-group-actions">
          <CopyCodeButton />
          <AskCodeButton />
        </div>
      </div>
      <div className="code-group-panels">
        {panels.map((panel, i) => (
          <div
            key={i}
            id={`${base}-panel-${i}`}
            role="tabpanel"
            aria-labelledby={`${base}-tab-${i}`}
            hidden={i !== active}
            className="code-group-panel"
          >
            {panel}
          </div>
        ))}
      </div>
    </div>
  );
}
