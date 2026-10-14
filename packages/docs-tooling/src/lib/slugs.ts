/**
 * Heading slugs, legacy (Fumadocs) and Mintlify (WP12).
 *
 * - Fumadocs gave headings github-slugger ids (`actions.json` ->
 *   `actionsjson`, `Rules - pathPattern` -> `rules---pathpattern`).
 * - Mintlify uses @sindresorhus/slugify with a counter, on
 *   `encodeURIComponent(lowercase, spaces -> "-")`, and renders the id
 *   decoded (`actions-json`, `rules-pathpattern`, Arabic stays Arabic).
 *   Port of @mintlify/common dist/slugify.js (`slugify`,
 *   `cachedSlugifyWithCounter`), checked against `mint dev` output.
 */
import GithubSlugger from "github-slugger";
import librarySlugify from "@sindresorhus/slugify";

export function legacySlugger() {
  const s = new GithubSlugger();
  return (title: string) => s.slug(title);
}

/**
 * Mintlify's per-page heading id function: `slugify(title)` (a fresh
 * counter per call, so no counting there) followed by the TOC extractor's
 * `deduplicateSlug` (`x`, `x-2`, `x-3`, …), as in
 * @mintlify/common remarkExtractTableOfContents.
 */
export function mintlifySlugger() {
  const pair = mintlifySluggerWithRaw();
  return (title: string) => pair(title).id;
}

/**
 * Like `mintlifySlugger`, but also returns `raw`: the deduplicated id before
 * `cleanHeadingId` (decoded). Earlier tooling (and authors copying ids from
 * older Mintlify builds) wrote those, e.g. `#need-help?`.
 */
export function mintlifySluggerWithRaw() {
  const seen = new Map<string, number>();
  const dedupe = (slug: string) => {
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    if (count === 0) return slug;
    let suffix = count + 1;
    let out = `${slug}-${suffix}`;
    while (seen.has(out)) out = `${slug}-${++suffix}`;
    seen.set(out, 1);
    return out;
  };
  return (title: string) => {
    const deduped = dedupe(encodedSlug(title));
    let raw = deduped;
    try {
      raw = decodeURIComponent(deduped);
    } catch {
      // keep
    }
    return { id: cleanHeadingId(deduped), raw };
  };
}

/**
 * Mintlify's render-time id cleanup (@mintlify/common `cleanHeadingId`,
 * applied by Heading, Step and Update): decode, then drop ASCII
 * punctuation `?,;:!'"()[]{}` and emoji. `Appendix A: the brief, in full`
 * renders as `appendix-a-the-brief-in-full`. The TOC deduplicates the slug
 * before this cleanup.
 */
export function cleanHeadingId(id: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(id.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
  } catch {
    return id;
  }
  return decoded
    .replace(/[?,;:!'"()[\]{}]/g, "")
    .replace(
      /\p{Emoji_Modifier}|\p{Emoji_Modifier_Base}|\p{Emoji_Presentation}|\p{Extended_Pictographic}|[\u200D\uFE0E\uFE0F]/gu,
      "",
    );
}

/**
 * Mintlify runs smart punctuation before it extracts headings (`Dialect's`
 * renders as `Dialect’s`, and the id keeps the ’). Quotes only; that is
 * all that changes a slug.
 */
export function smartQuotes(s: string): string {
  return s
    .replace(/(^|[\s([{“‘-])'/g, "$1‘")
    .replace(/'/g, "’")
    .replace(/(^|[\s([{‘-])"/g, "$1“")
    .replace(/"/g, "”");
}

/** Mintlify `slugify(title)`, still percent-encoded (what the TOC dedupes). */
function encodedSlug(title: string): string {
  const encoded = encodeURIComponent(
    smartQuotes(title).toLowerCase().trim().replace(/\s+/g, "-"),
  );
  return /%[0-9A-F]{2}/.test(encoded)
    ? librarySlugify(encoded, {
        decamelize: false,
        preserveCharacters: ["%", "_"],
        lowercase: false,
      })
    : librarySlugify(encoded, { decamelize: false, preserveCharacters: ["_"] });
}

/** Mintlify heading id without deduplication, as rendered. */
export function mintlifySlug(title: string): string {
  return cleanHeadingId(encodedSlug(title));
}
