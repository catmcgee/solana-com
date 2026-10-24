"use client";

import { remarkGfm } from "fumadocs-core/mdx-plugins/remark-gfm";
import { useShiki } from "fumadocs-core/highlight/client";
import { useTranslations } from "next-intl";
import {
  Component,
  Suspense,
  type ComponentProps,
  type ReactNode,
} from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import { cn } from "@/app/components/utils";
import { isDocsHref } from "@/lib/docs/docs-href";
import { currentLocale } from "@/lib/docs/ask/page-context";
import { normalizeDocsHref } from "@/lib/docs/ask/protocol";
import { DocsLink } from "../docs-link";
import { ArrowUpRightIcon } from "../docs-ui-icons";
import { CommandText, CopyButton } from "./visuals/command-row.client";
import { focusRing, mono } from "./ui";

/**
 * An answer's Markdown with every element styled explicitly: the panel sits
 * outside the docs' `.prose`, and on /developers the site's global element
 * styles (huge headings, mint links, list indents) would otherwise apply.
 * Docs links navigate in place, so a docked panel stays open; other sites
 * open in a new tab. Code is highlighted with the docs' Shiki themes once
 * the answer is complete (`streaming` false); shell blocks become command
 * rows whose `$` prompts are never copied.
 */

const linkClass =
  "rounded-sm text-[var(--sol-link)] underline decoration-[var(--sol-link-underline)] decoration-1 underline-offset-[3px] transition-colors duration-150 hover:text-[var(--sol-link-hover)] hover:decoration-current motion-reduce:transition-none";

const headingClass =
  "mb-2 mt-6 font-medium leading-6 tracking-[-0.01em] text-[var(--sol-text)] first:mt-0";

// Off docs pages the site's reboot gives `code` its own font: inherit ours.
const preClass = cn(
  mono,
  "m-0 overflow-x-auto px-4 py-3 text-[12.5px] leading-[1.7] [&_code]:[font-family:inherit]",
  focusRing,
  "focus-visible:-outline-offset-2",
);

/** The docs' code themes (lib/docs/code-options.mjs). */
const SHIKI_OPTIONS = {
  themes: { light: "github-light", dark: "github-dark-dimmed" },
  defaultColor: "light",
  fallbackLanguage: "text",
} as const;

const SHELL_LANGUAGES = new Set([
  "bash",
  "console",
  "sh",
  "shell",
  "terminal",
  "zsh",
]);

/** First words that make an unprompted line a command (Bri's list). */
const COMMAND_START =
  /^(?:anchor|avm|bun|cargo|cd|curl|export|git|mkdir|node|npm|npx|pnpm|rustup|solana|solana-test-validator|source|spl-token|surfpool|tsx|yarn)\b/;

export type ShellLine = {
  kind: "command" | "comment" | "output";
  text: string;
};

/** Splits shell code into commands (prompt removed), comments and output. */
export function parseShellLines(code: string): ShellLine[] {
  return code
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line): ShellLine[] => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("#"))
        return [{ kind: "comment", text: trimmed.replace(/^#\s?/, "") }];
      const prompted = /^\s*[$>%❯➜]\s+(.+)$/.exec(line)?.[1]?.trimEnd();
      if (prompted) return [{ kind: "command", text: prompted }];
      if (COMMAND_START.test(trimmed))
        return [{ kind: "command", text: trimmed }];
      return [{ kind: "output", text: trimmed }];
    });
}

/**
 * Shell blocks (by language, or code that is all commands or uses `$`
 * prompts) render as command rows; anything else stays a code block.
 */
export function isShellBlock(code: string, language: string | null) {
  const lines = parseShellLines(code);
  const commands = lines.filter((line) => line.kind === "command").length;
  if (commands === 0) return false;
  return (
    (language !== null && SHELL_LANGUAGES.has(language)) ||
    commands === lines.length ||
    /^\s*\$\s/m.test(code)
  );
}

/** A Markdown element as react-markdown passes it (hast). */
type HastElement = NonNullable<ExtraProps["node"]>;
type HastContent = HastElement["children"][number];

function textOf(nodes: HastContent[]): string {
  return nodes
    .map((node) =>
      node.type === "text"
        ? node.value
        : node.type === "element"
          ? textOf(node.children)
          : "",
    )
    .join("");
}

/** Code and language of a fenced block (`<pre><code class="language-x">`). */
function fencedCode(pre: HastElement | undefined) {
  const code = pre?.children.find(
    (child): child is HastElement =>
      child.type === "element" && child.tagName === "code",
  );
  const classes = code?.properties.className;
  const language =
    (Array.isArray(classes) ? classes : [])
      .map(String)
      .find((name) => name.startsWith("language-"))
      ?.slice("language-".length)
      .toLowerCase() ?? null;
  return {
    code: textOf(code?.children ?? pre?.children ?? []).replace(/\n$/, ""),
    language,
  };
}

/** Falls back to plain code if Shiki fails to load a grammar. */
class HighlightBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ShikiPre({ className, children, ...rest }: ComponentProps<"pre">) {
  return (
    <pre {...rest} className={cn(className, preClass, "!bg-transparent")}>
      {children}
    </pre>
  );
}

function Highlighted({ code, language }: { code: string; language: string }) {
  return useShiki(code, {
    lang: language,
    ...SHIKI_OPTIONS,
    components: { pre: ShikiPre },
  });
}

function PlainCode({ code }: { code: string }) {
  return (
    <pre className={cn(preClass, "text-[var(--sol-text)]")}>
      <code>{code}</code>
    </pre>
  );
}

function CodeFrame({
  language,
  copyText,
  copyLabel,
  children,
}: {
  language: string | null;
  copyText: string;
  copyLabel: string;
  children: ReactNode;
}) {
  // Code stays left to right on right-to-left pages, as in the docs.
  return (
    <div
      dir="ltr"
      className="my-4 overflow-hidden rounded-xl border border-[var(--sol-line)] bg-[var(--ask-code-bg)] first:mt-0 last:mb-0"
    >
      <div className="flex h-9 items-center justify-between border-b border-[var(--sol-line)] bg-[var(--ask-code-head)] pe-1.5 ps-3">
        <span
          className={cn(
            mono,
            "text-[11px] lowercase leading-4 text-[var(--sol-dim)]",
          )}
        >
          {language}
        </span>
        <CopyButton text={copyText} label={copyLabel} />
      </div>
      {children}
    </div>
  );
}

export function AskCodeBlock({
  code,
  language,
  highlight,
}: {
  code: string;
  language: string | null;
  /** Highlight with Shiki (finished answers only: each delta would re-highlight). */
  highlight: boolean;
}) {
  const t = useTranslations("docsAsk");
  if (isShellBlock(code, language)) {
    const lines = parseShellLines(code);
    const commands = lines.filter((line) => line.kind === "command");
    return (
      <CodeFrame
        language={language ?? "shell"}
        copyText={commands.map((line) => line.text).join("\n")}
        copyLabel={t("copyCode")}
      >
        <ul className="m-0 list-none py-2 pe-1.5 ps-4">
          {lines.map((line, index) => (
            <li
              key={index}
              className={cn(
                mono,
                "flex items-start gap-2 text-[12.5px] leading-5",
              )}
            >
              {line.kind === "command" ? (
                <>
                  <span
                    aria-hidden="true"
                    className="select-none py-[3px] text-[var(--sol-dim)]"
                  >
                    $
                  </span>
                  <code
                    className={cn(
                      mono,
                      "min-w-0 flex-1 whitespace-pre-wrap py-[3px] text-[var(--sol-text)] [overflow-wrap:anywhere]",
                    )}
                  >
                    <CommandText command={line.text} />
                  </code>
                  {commands.length > 1 ? (
                    <CopyButton text={line.text} label={t("copyCommand")} />
                  ) : null}
                </>
              ) : (
                <span
                  className={cn(
                    "min-w-0 flex-1 whitespace-pre-wrap py-[3px] text-[var(--sol-dim)] [overflow-wrap:anywhere]",
                    line.kind === "comment" && "italic",
                  )}
                >
                  {line.kind === "comment" ? `# ${line.text}` : line.text}
                </span>
              )}
            </li>
          ))}
        </ul>
      </CodeFrame>
    );
  }
  const plain = <PlainCode code={code} />;
  return (
    <CodeFrame language={language} copyText={code} copyLabel={t("copyCode")}>
      {highlight ? (
        <div className="dark:[&_.shiki]:!text-[var(--shiki-dark)] dark:[&_.shiki_span]:!text-[var(--shiki-dark)]">
          <HighlightBoundary fallback={plain}>
            <Suspense fallback={plain}>
              <Highlighted code={code} language={language ?? "text"} />
            </Suspense>
          </HighlightBoundary>
        </div>
      ) : (
        plain
      )}
    </CodeFrame>
  );
}

function AskLink({ href, children }: ComponentProps<"a">) {
  if (!href) return <>{children}</>;
  const target = normalizeDocsHref(href, currentLocale());
  if (isDocsHref(target)) {
    return (
      <DocsLink href={target} data-ask-internal="" className={linkClass}>
        {children}
      </DocsLink>
    );
  }
  if (/^https?:\/\//i.test(target)) {
    return (
      <a href={target} target="_blank" rel="noreferrer" className={linkClass}>
        {children}
        <ArrowUpRightIcon className="ms-0.5 inline size-3 align-[-1px] rtl:-scale-x-100" />
      </a>
    );
  }
  return (
    <a href={target} className={linkClass}>
      {children}
    </a>
  );
}

function components(highlight: boolean): Components {
  return {
    p: ({ children }) => (
      <p className="my-3 first:mt-0 last:mb-0">{children}</p>
    ),
    h1: ({ children }) => (
      <h3 className={cn(headingClass, "text-[15px]")}>{children}</h3>
    ),
    h2: ({ children }) => (
      <h3 className={cn(headingClass, "text-[15px]")}>{children}</h3>
    ),
    h3: ({ children }) => (
      <h4 className={cn(headingClass, "text-[14px]")}>{children}</h4>
    ),
    h4: ({ children }) => (
      <h4 className={cn(headingClass, "text-[14px]")}>{children}</h4>
    ),
    h5: ({ children }) => (
      <h4 className={cn(headingClass, "text-[14px]")}>{children}</h4>
    ),
    h6: ({ children }) => (
      <h4 className={cn(headingClass, "text-[14px]")}>{children}</h4>
    ),
    ul: ({ children }) => (
      <ul className="my-3 list-disc space-y-1 ps-5 marker:text-[var(--sol-dim)] first:mt-0 last:mb-0">
        {children}
      </ul>
    ),
    ol: ({ children, start }) => (
      <ol
        start={start}
        className="my-3 list-decimal space-y-1 ps-5 marker:text-[var(--sol-dim)] first:mt-0 last:mb-0"
      >
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="ps-1 [&>ol]:my-1 [&>p]:my-1 [&>ul]:my-1">{children}</li>
    ),
    a: AskLink,
    strong: ({ children }) => (
      <strong className="font-semibold text-[var(--sol-text)]">
        {children}
      </strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    code: ({ children }) => (
      <code
        dir="ltr"
        className={cn(
          mono,
          // One box, so `--program-2022` doesn't split at its hyphens;
          // only code wider than the line wraps inside it.
          "inline-block max-w-full rounded-[5px] border border-[var(--sol-line)] bg-[var(--sol-soft)] px-[5px] py-px text-[0.86em] leading-[1.45] text-[var(--sol-text)] [overflow-wrap:anywhere]",
        )}
      >
        {children}
      </code>
    ),
    pre: ({ node }) => {
      const { code, language } = fencedCode(node);
      return (
        <AskCodeBlock code={code} language={language} highlight={highlight} />
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="my-3 border-s-2 border-[var(--sol-line-strong)] ps-3 text-[var(--sol-muted)]">
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr className="my-5 h-0 border-0 border-t border-[var(--sol-line)]" />
    ),
    table: ({ children }) => (
      <div className="my-4 w-full overflow-x-auto rounded-xl border border-[var(--sol-line)] first:mt-0 last:mb-0">
        <table className="w-full border-collapse text-start">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="bg-[var(--sol-surface-2)] px-3 py-2 text-start text-[12.5px] font-medium leading-5 text-[var(--sol-muted)]">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-t border-[var(--sol-line)] px-3 py-2 align-top text-[13px] leading-5">
        {children}
      </td>
    ),
    // Answers link to docs pages rather than embed images.
    img: ({ alt }) => (alt ? <span>{alt}</span> : null),
  };
}

const COMPONENTS = { plain: components(false), highlighted: components(true) };
const REMARK_PLUGINS = [remarkGfm];

export function AskMarkdown({
  text,
  streaming = false,
}: {
  text: string;
  /** While true, code stays plain (highlighting waits for the full answer). */
  streaming?: boolean;
}) {
  return (
    <Markdown
      remarkPlugins={REMARK_PLUGINS}
      components={streaming ? COMPONENTS.plain : COMPONENTS.highlighted}
    >
      {text}
    </Markdown>
  );
}
