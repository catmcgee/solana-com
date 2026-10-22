/**
 * gen:llms (WP9, spec §5.4). From generated/pages.json it writes:
 * - apps/docs/llms.txt: the body of /llms.txt (apps/web app/llms.txt; the
 *   agent header in ./header.md plus the English index, every link as `.md`);
 * - packages/docs-tooling/generated/llms-sections/<section>.txt: the scoped
 *   indexes that apps/web serves at /developers/docs/<section>/llms.txt.
 * /llms-full.txt is built by apps/web from the pages. The per-locale
 * apps/web/public/llms-<locale>.txt files are curated and translated by
 * Lingo (llmtxt-generator.py), so they are left alone.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LOCALE } from "../lib/locales.ts";
import { docsRoot, toolingRoot } from "../lib/paths.ts";
import type { ManifestPage } from "../manifest/pages.ts";
import { INDEX_SECTIONS, SECTION_NOTES } from "./sections.ts";

export const SITE_ORIGIN = "https://solana.com";
export const LLMS_SECTIONS_DIR = path.join(
  toolingRoot,
  "generated",
  "llms-sections",
);
export const LLMS_TXT_FILE = path.join(docsRoot, "llms.txt");

const here = path.dirname(fileURLToPath(import.meta.url));

export function readHeader() {
  return readFileSync(path.join(here, "header.md"), "utf8").trimEnd();
}

function under(url: string, prefix: string) {
  return url === prefix || url.startsWith(`${prefix}/`);
}

function formatPage(page: ManifestPage) {
  const line = `- [${page.title || page.url}](${SITE_ORIGIN}${page.url}.md)`;
  return page.description ? `${line}: ${page.description}` : line;
}

function englishIndexable(pages: ManifestPage[]) {
  return pages
    .filter((p) => p.lang === DEFAULT_LOCALE && !p.noindex)
    .slice()
    .sort((a, b) => a.url.localeCompare(b.url));
}

export function renderLlmsTxt(pages: ManifestPage[], header = readHeader()) {
  const en = englishIndexable(pages);
  const lines = [header, ""];
  for (const { heading, prefix } of INDEX_SECTIONS) {
    const inSection = en.filter((p) =>
      prefix === "/learn" ? p.url.startsWith("/learn/") : under(p.url, prefix),
    );
    if (inSection.length === 0) continue;
    lines.push(`## ${heading}`, "");
    for (const page of inSection) lines.push(formatPage(page));
    lines.push("");
  }
  return lines.join("\n");
}

/** First-level sections of /developers/docs that have at least one page. */
export function docsSections(pages: ManifestPage[]) {
  const set = new Set<string>();
  for (const p of englishIndexable(pages)) {
    const m = /^\/developers\/docs\/([^/]+)/.exec(p.url);
    if (m) set.add(m[1]!);
  }
  return [...set].sort();
}

export function renderSectionLlmsTxt(
  pages: ManifestPage[],
  section: string,
): string | null {
  const prefix = `/developers/docs/${section}`;
  const inSection = englishIndexable(pages).filter((p) => under(p.url, prefix));
  if (inSection.length === 0) return null;
  const title = inSection.find((p) => p.url === prefix)?.title ?? section;
  const note = SECTION_NOTES[section];
  const lines = [
    `# Solana Documentation: ${title}`,
    "",
    ...(note ? [`> ${note}`, ""] : []),
    "> Every page is available as raw Markdown by appending `.md` to its URL",
    "> (the links here already include it). The site-wide index is at",
    "> https://solana.com/llms.txt.",
    "",
    ...inSection.map(formatPage),
    "",
  ];
  return lines.join("\n");
}

export interface LlmsOutput {
  llmsTxt: string;
  sections: Map<string, string>;
}

export function renderAll(pages: ManifestPage[]): LlmsOutput {
  const sections = new Map<string, string>();
  for (const s of docsSections(pages)) {
    const body = renderSectionLlmsTxt(pages, s);
    if (body) sections.set(s, body);
  }
  return { llmsTxt: renderLlmsTxt(pages), sections };
}

/** Writes (or, with check, compares) the outputs. Returns stale paths. */
export function writeLlms(out: LlmsOutput, check: boolean): string[] {
  const stale: string[] = [];
  const want = new Map<string, string>([[LLMS_TXT_FILE, out.llmsTxt]]);
  for (const [s, body] of out.sections)
    want.set(path.join(LLMS_SECTIONS_DIR, `${s}.txt`), body);

  const existing = existsSync(LLMS_SECTIONS_DIR)
    ? readdirSync(LLMS_SECTIONS_DIR)
        .filter((f) => f.endsWith(".txt"))
        .map((f) => path.join(LLMS_SECTIONS_DIR, f))
    : [];
  for (const file of existing) {
    if (!want.has(file)) {
      stale.push(file);
      if (!check) rmSync(file);
    }
  }
  for (const [file, body] of want) {
    const current = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (current === body) continue;
    stale.push(file);
    if (!check) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, body);
    }
  }
  return stale;
}
