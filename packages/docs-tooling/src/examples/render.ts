/**
 * Render one example block as a Mintlify MDX snippet (pure).
 *
 * Output patterns (chosen from the SSR probe, see the WP5 report):
 * - Code panels use built-in `<Tabs>`/`<CodeGroup>`; every panel is in the
 *   server HTML and the no-JS fallback CSS un-hides inactive panels.
 * - Recorded output is a plain `<div className="sol-run">` holding a
 *   `text Output` fence. Raw `<details>`/`<noscript>` are dropped by
 *   Mintlify, so the output is simply VISIBLE in the server HTML. With JS,
 *   run-examples.js marks `<html data-sol-run>`; styles/run.css then hides the
 *   output until the reader presses Run (the button is in the markup but
 *   only shown once the script is live).
 * - A tab without a recorded output gets no Run button (decisions.md).
 * - A recorded output with a `<stem>.run.json` (prompt commands, result
 *   badges) renders as the terminal panel of src/lib/terminal.ts instead:
 *   the full output is in the server HTML, and run-examples.js streams it
 *   back in when the reader presses Run.
 * - Every code fence is preceded by an empty `<div className="sol-pg">`
 *   marker carrying the tab's source path (see playground.ts): one per tab,
 *   in tab order, before a `<CodeGroup>`; inside each `<Tab>` otherwise.
 *   apps/docs/playground.js reads it for the "Open in Playground" control;
 *   styles/playground.css keeps it hidden (it has no content anyway).
 */
import type { Block } from "./blocks.ts";
import type { PlaygroundSource } from "./playground.ts";
import {
  DEFAULT_TERM_LABELS,
  renderTerminal,
  type RunMeta,
} from "../lib/terminal.ts";

export interface RenderTab {
  title: string;
  lang: string;
  code: string;
  /** Mintlify line-highlight ranges, e.g. "24-30". */
  highlight?: string;
  /** Recorded output (already trimmed), or undefined. */
  output?: string;
  outputNote?: string;
  /**
   * `<stem>.run.json` next to the output: render the terminal panel
   * (src/lib/terminal.ts) instead of the plain Run block.
   */
  runMeta?: RunMeta;
  /** Source path for "Open in Playground"; absent for an inline tab. */
  playground?: PlaygroundSource;
}

export interface RenderInput {
  id: string;
  /** Repo-relative blocks.json path, for the header comment. */
  source: string;
  block: Block;
  tabs: RenderTab[];
}

export const DEFAULT_OUTPUT_NOTE = "Output from a local Surfpool network";
export const RUNNER_NOTE: Record<string, string> = {
  "generate-keypair": "Example output: each run generates a new key pair",
};

/** A backtick fence longer than any backtick run inside `body`. */
export function fenceFor(body: string): string {
  let max = 0;
  for (const m of body.matchAll(/`+/g)) max = Math.max(max, m[0].length);
  return "`".repeat(Math.max(3, max + 1));
}

/** Fence meta: `ts Title highlight={1-3}`; titles with spaces use title="...". */
export function fenceMeta(
  lang: string,
  title?: string,
  highlight?: string,
): string {
  const parts = [lang || "text"];
  if (title)
    parts.push(/\s|"/.test(title) ? `title=${JSON.stringify(title)}` : title);
  // Same spelling as the WP2 fences transform (it strips bare `{n}` meta).
  if (highlight) parts.push(`highlight={${highlight}}`);
  return parts.join(" ");
}

export function codeFence(
  lang: string,
  code: string,
  title?: string,
  highlight?: string,
) {
  const f = fenceFor(code);
  return `${f}${fenceMeta(lang, title, highlight)}\n${code}\n${f}`;
}

/** JSX attribute value: a plain string literal when safe, else an expression. */
function jsxAttr(value: string): string {
  return /^[^"{}<>\\\n]*$/.test(value)
    ? `"${value}"`
    : `{${JSON.stringify(value)}}`;
}

/** The hidden "Open in Playground" source marker placed before a fence. */
export function playgroundMarker(pg: PlaygroundSource | undefined): string {
  const attrs = [`className="sol-pg"`];
  if (pg)
    attrs.push(
      `data-pg-src=${jsxAttr(pg.src)}`,
      `data-pg-open=${jsxAttr(pg.open)}`,
      `data-pg-kind=${jsxAttr(pg.kind)}`,
    );
  else attrs.push(`data-pg-kind="inline"`);
  return `<div ${attrs.join(" ")} />`;
}

function runBlock(input: RenderInput, tab: RenderTab): string {
  const runner = input.block.runner;
  const note =
    (runner && RUNNER_NOTE[runner]) ||
    tab.outputNote ||
    input.block.outputNote ||
    DEFAULT_OUTPUT_NOTE;
  if (tab.runMeta && !runner)
    return renderTerminal({
      id: input.id,
      tab: tab.title,
      kind: "block",
      title: tab.runMeta.title ?? note,
      labels: DEFAULT_TERM_LABELS,
      steps: [{ output: tab.output!, meta: tab.runMeta }],
    });
  const attrs = [
    `className="sol-run"`,
    `data-run=${jsxAttr(input.id)}`,
    `data-tab=${jsxAttr(tab.title)}`,
    ...(runner ? [`data-runner=${jsxAttr(runner)}`] : []),
  ].join(" ");
  const live = runner
    ? `\n<pre className="sol-run-live" aria-live="polite"></pre>`
    : "";
  return [
    `<div ${attrs}>`,
    `<div className="sol-run-bar"><button type="button" className="sol-run-btn">Run</button><span className="sol-run-note">${escapeText(note)}</span></div>`,
    `<div className="sol-run-out">`,
    "",
    codeFence("text", tab.output!, "Output"),
    "",
    `</div>${live}`,
    `</div>`,
  ].join("\n");
}

function escapeText(s: string) {
  return s.replace(/[{}<>]/g, (c) => `{${JSON.stringify(c)}}`);
}

export function renderSnippet(input: RenderInput): string {
  const header = `{/* GENERATED by packages/docs-tooling (examples build) from ${input.source} (block "${input.id.split("/").at(-1)}"). Do not edit: change packages/docs-examples and run \`pnpm --filter @workspace/docs-tooling examples:build\`. */}`;
  const withOutput = input.block.runnable
    ? input.tabs.filter((t) => t.output !== undefined)
    : [];
  let body: string;
  if (withOutput.length === 0) {
    // Plain code: no Run button anywhere.
    if (input.tabs.length === 1) {
      const t = input.tabs[0]!;
      body = [
        playgroundMarker(t.playground),
        "",
        codeFence(t.lang, t.code, t.title, t.highlight),
      ].join("\n");
    } else {
      body = [
        // One marker per tab, in tab order (a CodeGroup only takes fences).
        ...input.tabs.map((t) => playgroundMarker(t.playground)),
        "",
        "<CodeGroup>",
        "",
        ...input.tabs.flatMap((t) => [
          codeFence(t.lang, t.code, t.title, t.highlight),
          "",
        ]),
        "</CodeGroup>",
      ].join("\n");
    }
  } else if (input.tabs.length === 1) {
    const t = input.tabs[0]!;
    body = [
      playgroundMarker(t.playground),
      "",
      codeFence(t.lang, t.code, t.title, t.highlight),
      "",
      runBlock(input, t),
    ].join("\n");
  } else {
    // One Tab per flavour so each output stays paired with its code.
    body = [
      "<Tabs>",
      ...input.tabs.flatMap((t) => [
        `<Tab title=${jsxAttr(t.title)}>`,
        // Inactive panels are stacked without JS; this labels each one.
        `<div className="sol-tab-label">${escapeText(t.title)}</div>`,
        playgroundMarker(t.playground),
        "",
        codeFence(t.lang, t.code, undefined, t.highlight),
        ...(input.block.runnable && t.output !== undefined
          ? ["", runBlock(input, t)]
          : []),
        "",
        "</Tab>",
      ]),
      "</Tabs>",
    ].join("\n");
  }
  return `${header}\n\n${body}\n`;
}
