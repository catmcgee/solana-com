import "server-only";

/**
 * Docs links the model made up, taken out of the final answer: the docs
 * agent's DocsCitationValidator::sanitizeAnswerUrls, for solana.com paths
 * in the docs trees (/developers/docs, /developers/cookbook, /learn, and
 * the old /docs) that resolve to no page. A link keeps its text (unless
 * the text is itself a URL); a bare path goes. An old /docs/… path whose
 * /developers/docs/… page exists is moved there. Code is left as written.
 * Other paths and domains are kept: the site's other /developers pages are
 * separate apps, the excerpts link other domains, and this backend has no
 * allowlist to check them against.
 */

/** Site pages that are not docs pages. */
const HUB_PATHS = new Set(["/docs", "/learn"]);

const DOCS_PATH = /^\/(?:docs|learn|developers\/(?:docs|cookbook))(?:\/|$)/;

const MARKDOWN_LINK = /\[([^\]]*)\]\(\s*([^)\s]+)(\s+"[^"]*")?\s*\)/g;

const BARE_DOCS_URL =
  /https?:\/\/(?:www\.)?solana\.com\/[^\s)\]"'<>`]*|(?<![\w/])\/(?:docs|developers|learn)(?:\/[^\s)\]"'<>`]*)?/g;

/** Code fences and inline code: never changed. */
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;

type Verdict = { keep: true } | { keep: false } | { moveTo: string };

/**
 * What to do with a link target. `exists` says whether a site path (no
 * origin, anchor or query) is a docs page.
 */
function verdictFor(
  target: string,
  exists: (path: string) => boolean,
): Verdict {
  const local = target
    .trim()
    .replace(/^https?:\/\/(?:www\.)?solana\.com(?=\/|$)/i, "");
  if (!local.startsWith("/") || !DOCS_PATH.test(local)) return { keep: true };
  const path = local.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  if (HUB_PATHS.has(path) || exists(path)) return { keep: true };
  if (path.startsWith("/docs/") && exists(`/developers${path}`)) {
    return { moveTo: `/developers${local}` };
  }
  return { keep: false };
}

export function sanitizeDocsLinks(
  answer: string,
  exists: (path: string) => boolean,
): { answer: string; removed: number; moved: number } {
  let removed = 0;
  let moved = 0;
  const prose = (segment: string) =>
    segment
      .replace(
        MARKDOWN_LINK,
        (full, text: string, target: string, title = "") => {
          const verdict = verdictFor(target, exists);
          if ("moveTo" in verdict) {
            moved += 1;
            return `[${text}](${verdict.moveTo}${title})`;
          }
          if (verdict.keep) return full;
          removed += 1;
          // A dead URL as plain text is still a dead URL to the reader.
          return /^\s*(?:https?:\/\/|\/)/.test(text) ? "" : text;
        },
      )
      .replace(BARE_DOCS_URL, (match) => {
        // Sentence punctuation is not part of the URL.
        const url = match.replace(/[.,;:!?]+$/, "");
        const tail = match.slice(url.length);
        const verdict = verdictFor(url, exists);
        if ("moveTo" in verdict) {
          moved += 1;
          return `${verdict.moveTo}${tail}`;
        }
        if (verdict.keep) return match;
        removed += 1;
        return tail;
      });
  const sanitized = answer
    .split(CODE)
    .map((part, index) => (index % 2 === 1 ? part : prose(part)))
    .join("");
  if (removed === 0) return { answer: sanitized, removed, moved };
  // A removed bare URL can leave a space before punctuation, or two.
  return {
    answer: sanitized
      .replace(/(?<=\S)[ \t]+([.,;:!?)])/g, "$1")
      .replace(/(?<=\S)[ \t]{2,}/g, " "),
    removed,
    moved,
  };
}

/**
 * The docs pages an answer links (Markdown links to the docs trees, outside
 * code blocks), as site paths without origin, locale, anchor or trailing
 * slash, in order and once each. Inline code stays: a link's text is often
 * code ("[`getMultipleAccounts`](…)").
 */
export function docsLinkPaths(answer: string): string[] {
  const paths = new Set<string>();
  const prose = answer.replace(/```[\s\S]*?(?:```|$)/g, " ");
  for (const match of prose.matchAll(MARKDOWN_LINK)) {
    const local = match[2]!
      .trim()
      .replace(/^https?:\/\/(?:www\.)?solana\.com(?=\/|$)/i, "")
      .replace(/^\/[a-z]{2}(?=\/)/, "");
    if (!local.startsWith("/") || !DOCS_PATH.test(local)) continue;
    const path = local.split(/[?#]/)[0]!.replace(/\/+$/, "");
    if (path && !HUB_PATHS.has(path)) paths.add(path);
  }
  return [...paths];
}

/** "Sources:", "**Learn more:**", "See also" at the start of a block. */
const SOURCE_LABEL =
  /^\s*(?:\*\*|__)?(?:sources?|learn more|see also|references|further reading|read more)\b(?:\*\*|__)?\s*:?\s*(?:\*\*|__)?\s*:?/i;

/**
 * Drops a closing "Sources:" / "Learn more:" list of links: the panel lists
 * the pages an answer links as its Sources right under it, and the model
 * adds one anyway. Only a list of nothing but links to `cited` pages (site
 * paths, see docsLinkPaths) goes, so no link is lost.
 */
export function withoutSourceList(answer: string, cited: string[]): string {
  const blocks = answer.trim().split(/\n[ \t]*\n/);
  const citedPaths = new Set(cited);
  const linksOnly = (text: string) =>
    !text
      .replace(MARKDOWN_LINK, "")
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
      .replace(/\band\b|[\s,;.&·|•—–-]/g, "");
  const allCited = (text: string) => {
    const paths = docsLinkPaths(text);
    const links = [...text.matchAll(MARKDOWN_LINK)].length;
    return (
      links > 0 &&
      paths.length > 0 &&
      paths.every((path) => citedPaths.has(path)) &&
      links === docsLinkCount(text)
    );
  };
  // The label with its links in one block, or alone above a list block.
  const last = blocks.at(-1) ?? "";
  const label = blocks.at(-2) ?? "";
  if (SOURCE_LABEL.test(last)) {
    const links = last.replace(SOURCE_LABEL, "");
    if (linksOnly(links) && allCited(links)) {
      return blocks.slice(0, -1).join("\n\n");
    }
  } else if (
    blocks.length > 2 &&
    SOURCE_LABEL.test(label) &&
    !label.replace(SOURCE_LABEL, "").trim() &&
    linksOnly(last) &&
    allCited(last)
  ) {
    return blocks.slice(0, -2).join("\n\n");
  }
  return answer.trim();
}

/** How many Markdown links in `text` point into the docs trees. */
function docsLinkCount(text: string): number {
  return [...text.matchAll(MARKDOWN_LINK)].filter(([, , target]) => {
    const local = target!
      .trim()
      .replace(/^https?:\/\/(?:www\.)?solana\.com(?=\/|$)/i, "")
      .replace(/^\/[a-z]{2}(?=\/)/, "");
    return local.startsWith("/") && DOCS_PATH.test(local);
  }).length;
}
