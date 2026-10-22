/**
 * Residual-syntax scan (spec §4.4.2, WP12): proves no Fumadocs / Code Hike
 * construct survived `convert`, and that the content keeps out the raw HTML
 * it has never used (`<details>`, `<noscript>`, `<abbr>`).
 *
 * Line scanner over every published page (apps/docs/**\/*.mdx|md outside
 * snippets/) plus every snippet. It tracks code fences, so:
 * - component / frontmatter / link patterns are matched OUTSIDE fences, on
 *   the line with inline code spans removed (prose that mentions `<Cards>`
 *   in backticks is not a hit);
 * - fence patterns (Code Hike meta, annotation comment lines, `terminal`)
 *   are matched on fence openers and INSIDE fences.
 *
 * Every pattern must report 0. `PATTERNS` is the list the report prints.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../lib/paths.ts";
import { listLayoutPages } from "./verify-urls.ts";

export type Where = "prose" | "fence-open" | "fence-body" | "frontmatter";

export interface ResidualPattern {
  id: string;
  where: Where;
  re: RegExp;
  /** Optional per-file exemption (documented in the report). */
  allow?: (file: string, line: string) => boolean;
}

const jsx = (name: string): ResidualPattern => ({
  id: `<${name}`,
  where: "prose",
  re: new RegExp(`<${name}(?=[\\s/>])`),
});

export const PATTERNS: ResidualPattern[] = [
  // Code Hike containers and Fumadocs components (spec §4.4.2).
  ...[
    "CodeTabs",
    "ScrollyCoding",
    "CodePlaceholder",
    "APIMethod",
    "CodeReference",
    "WithMentions",
    "WithNotes",
    "SideBySide",
    "DocsDiagram",
    "Embed",
    "Cards",
    "Files",
    "Folder",
    "Accordions",
    "TerminalPicker",
    "DocsCategory",
    "TypeTable",
    "ImageZoom",
    "Mermaid",
    "Terminal",
    "TerminalOutput",
    // Surfpool RPC components (WP4) and video-guide components (WP7).
    "AccountsRpc",
    "AdminRpc",
    "CheatcodesRpc",
    "NetworkRpc",
    "NodeRpc",
    "TransactionsRpc",
    "WebsocketsRpc",
    "WebSocketsRpc",
    "CourseHero",
    "CourseList",
    "CourseFacts",
    "SectionHeading",
    "NextUp",
    "VideoWithChapters",
    "VideoChapterList",
    "ProjectCardGrid",
    // Raw HTML the content keeps out (setup probe).
    "details",
    "noscript",
    "abbr",
  ].map(jsx),
  { id: "<File (Fumadocs Files)", where: "prose", re: /<File(?=[\s/>])/ },
  { id: "<Callout type=", where: "prose", re: /<Callout\s[^>]*\btype=/ },
  { id: "<Callout title=", where: "prose", re: /<Callout\s[^>]*\btitle=/ },
  {
    id: "<Tabs items=",
    where: "prose",
    re: /<Tabs\s[^>]*\b(items|groupId|persist)=/,
  },
  { id: "<Tab value=", where: "prose", re: /<Tab\s[^>]*\bvalue=/ },
  { id: "icon={<…/>}", where: "prose", re: /icon=\{\s*</ },
  { id: "mention: link", where: "prose", re: /\]\(mention:/ },
  { id: "## !!steps / ## !!", where: "prose", re: /^\s*#{1,6}\s+!!/ },
  { id: "### !name (Code Hike block)", where: "prose", re: /^\s*#{1,6}\s+!\w/ },
  {
    id: "_lang`code`_ inline",
    where: "prose",
    re: /(^|[^\w\\])\\?[_*][a-z]{1,10}`[^`]+`\\?[_*]/,
  },
  {
    id: "_lang`code` inline (closing marker lost)",
    where: "prose",
    re: /(^|[^\w\\`])\\?_(rs|ts|js|tsx|jsx|shell|sh|bash)`[^`]+`/,
  },
  {
    id: "legacy image/asset URL",
    where: "prose",
    re: /(?:src=["{]?["']?|\]\()\/(?:assets|images|img)\//,
  },
  {
    id: "fumadocs/@/ import",
    where: "prose",
    re: /^import .* from ["'](?:fumadocs|@\/|~\/)/,
  },
  { id: "file=packages/", where: "fence-open", re: /\bfile=packages\// },
  {
    id: "!! fence meta",
    where: "fence-open",
    re: /^\s*(`{3,}|~{3,})\S*.*\s!!?(\s|$|\w)/,
  },
  {
    id: "terminal fence",
    where: "fence-open",
    re: /^\s*(`{3,}|~{3,})terminal\b/,
  },
  {
    id: "mermaid fence meta",
    where: "fence-open",
    re: /^\s*(`{3,}|~{3,})mermaid\s+\S/,
  },
  {
    id: "-w fence flag",
    where: "fence-open",
    re: /^\s*(`{3,}|~{3,})\S+.*\s-w(\s|$)/,
  },
  {
    id: "annotation line /^\\s*(\\/\\/|#|--)\\s*!\\w/",
    where: "fence-body",
    re: /^\s*(\/\/|#|--)\s*!\w/,
    // Rust inner attributes (`#![…]`) are code, not annotations.
    allow: (_f, line) => /^\s*#!\[/.test(line),
  },
  {
    id: "frontmatter h1/seoTitle/hideTableOfContents/hidePageNavigation/index/draft/full",
    where: "frontmatter",
    re: /^(h1|seoTitle|hideTableOfContents|hidePageNavigation|index|draft|full):/,
  },
  {
    id: "frontmatter url",
    where: "frontmatter",
    re: /^url:/,
    // WP6's nav-only stub: an external sidebar link (`url`).
    allow: (file) => /(^|\/)docs\/tools\/microscope\.mdx$/.test(file),
  },
];

/**
 * Components the docs content may use without an import (the docs MDX
 * components, apps/web components/docs/docs-components.tsx). Any other
 * capitalized JSX tag must be imported in the same file (snippets);
 * otherwise it is a leftover Fumadocs/Code Hike component.
 */
export const DOCS_COMPONENTS = new Set([
  "Accordion",
  "AccordionGroup",
  "Badge",
  "Callout",
  "Card",
  "CardGroup",
  "Check",
  "CodeGroup",
  "Color",
  "Color.Item",
  "Color.Row",
  "Columns",
  "Danger",
  "Expandable",
  "Frame",
  "Icon",
  "Info",
  "Latex",
  "Note",
  "Panel",
  "ParamField",
  "Prompt",
  "RequestExample",
  "ResponseExample",
  "ResponseField",
  "Step",
  "Steps",
  "Tab",
  "Tabs",
  "Tile",
  "Tip",
  "Tooltip",
  "Tree",
  "Tree.File",
  "Tree.Folder",
  "TxWalkthrough",
  "Update",
  "View",
  "Warning",
]);
export const UNKNOWN_COMPONENT =
  "unknown JSX component (not a docs component, not imported)";

export interface ResidualHit {
  pattern: string;
  file: string;
  line: number;
  text: string;
}

export interface ResidualResult {
  files: number;
  total: number;
  counts: Map<string, number>;
  hits: ResidualHit[];
  exempt: ResidualHit[];
}

export function listSnippets(): string[] {
  const out: string[] = [];
  const root = path.join(repoRoot, "apps/docs/snippets");
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.mdx?$/.test(name))
        out.push(path.relative(repoRoot, p).split(path.sep).join("/"));
    }
  };
  walk(root);
  return out;
}

const stripInlineCode = (line: string) => line.replace(/(`+)[^`]*?\1/g, "``");

export function scanSource(file: string, src: string, patterns = PATTERNS) {
  const hits: ResidualHit[] = [];
  const exempt: ResidualHit[] = [];
  const lines = src.split("\n");
  let i = 0;
  const report = (p: ResidualPattern, n: number, text: string) => {
    const h = {
      pattern: p.id,
      file,
      line: n + 1,
      text: text.trim().slice(0, 160),
    };
    (p.allow?.(file, text) ? exempt : hits).push(h);
  };
  if (lines[0] === "---") {
    for (i = 1; i < lines.length && lines[i] !== "---"; i++) {
      for (const p of patterns)
        if (p.where === "frontmatter" && p.re.test(lines[i]!))
          report(p, i, lines[i]!);
    }
    i++;
  }
  const imported = new Set<string>();
  for (const m of src.matchAll(/^import\s+([A-Za-z_$][\w$]*)/gm))
    imported.add(m[1]!);
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}/gm))
    for (const n of m[1]!.split(",")) {
      const local = n
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (local) imported.add(local);
    }
  for (const m of src.matchAll(/^export\s+const\s+([A-Z][\w$]*)/gm))
    imported.add(m[1]!);
  const unknown: ResidualPattern = {
    id: UNKNOWN_COMPONENT,
    where: "prose",
    re: /$^/,
  };
  let fence: { char: string; len: number } | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (
        m &&
        m[1]![0] === fence.char &&
        m[1]!.length >= fence.len &&
        line.trim() === m[1]
      ) {
        fence = null;
        continue;
      }
      for (const p of patterns)
        if (p.where === "fence-body" && p.re.test(line)) report(p, i, line);
      continue;
    }
    if (m) {
      fence = { char: m[1]![0]!, len: m[1]!.length };
      for (const p of patterns)
        if (p.where === "fence-open" && p.re.test(line)) report(p, i, line);
      continue;
    }
    const prose = stripInlineCode(line);
    for (const m of prose.matchAll(/<([A-Z][\w]*(?:\.[A-Z]\w*)?)(?=[\s/>])/g)) {
      const name = m[1]!;
      // Inside a quoted attribute value (e.g. type="Array<RpcKeyedAccount>").
      if ((prose.slice(0, m.index).match(/"/g)?.length ?? 0) % 2 === 1)
        continue;
      if (!DOCS_COMPONENTS.has(name) && !imported.has(name.split(".")[0]!))
        report(unknown, i, line);
    }
    for (const p of patterns) {
      if (p.where !== "prose") continue;
      // The inline-code pattern needs the backticks.
      const target = p.id.startsWith("_lang") ? line : prose;
      if (p.re.test(target)) report(p, i, line);
    }
  }
  return { hits, exempt };
}

export function scanResidual(
  files = [...listLayoutPages(), ...listSnippets()].sort(),
): ResidualResult {
  const counts = new Map<string, number>([
    ...PATTERNS.map((p) => [p.id, 0] as [string, number]),
    [UNKNOWN_COMPONENT, 0],
  ]);
  const hits: ResidualHit[] = [];
  const exempt: ResidualHit[] = [];
  for (const f of files) {
    const r = scanSource(f, readFileSync(path.join(repoRoot, f), "utf8"));
    for (const h of r.hits)
      counts.set(h.pattern, (counts.get(h.pattern) ?? 0) + 1);
    hits.push(...r.hits);
    exempt.push(...r.exempt);
  }
  return { files: files.length, total: hits.length, counts, hits, exempt };
}

export function printResidual(r: ResidualResult, json = false) {
  if (json) {
    console.log(
      JSON.stringify(
        {
          files: r.files,
          total: r.total,
          counts: Object.fromEntries(r.counts),
          hits: r.hits,
          exempt: r.exempt,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`residual syntax scan: ${r.files} files, ${r.total} hits`);
  for (const [id, n] of r.counts)
    console.log(`  ${String(n).padStart(5)}  ${id}`);
  for (const h of r.hits.slice(0, 100))
    console.log(`  HIT ${h.pattern} ${h.file}:${h.line}: ${h.text}`);
  if (r.exempt.length) {
    console.log(`  exempt (documented): ${r.exempt.length}`);
    for (const h of r.exempt.slice(0, 20))
      console.log(`    ${h.pattern} ${h.file}:${h.line}: ${h.text}`);
  }
}
