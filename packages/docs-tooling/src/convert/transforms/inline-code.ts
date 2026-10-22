/**
 * Code Hike inline-language code `` _rs`pub mod constants`_ `` -> plain
 * `` `pub mod constants` `` (spec §3.2 "Inline syntax").
 *
 * Code Hike rendered `_<lang>`code`_` as highlighted inline code. The docs
 * would show it as italic text "rs" followed by code, so the language prefix
 * and the markers are removed. The markdown parse of this syntax takes
 * several shapes, all handled:
 *
 * - emphasis(text "rs", inlineCode): the emphasis becomes the inline code.
 * - The markers do not form emphasis (CJK or Arabic neighbours, escaped
 *   `\_rs`, a translator's `*rs`x`*`): text "…_rs" + inlineCode + text
 *   "_…"; the prefix and the closing marker are cut from the neighbouring
 *   text.
 * - Adjacent constructs whose markers pair up across them
 *   (`*rs`a`*と*rs`b`*` parses as code, emphasis("と"), "rs", code): such an
 *   emphasis is unwrapped back to its markers when both of its markers
 *   belong to a neighbouring `lang`code`` construct, then the text rule
 *   applies.
 *
 * Only lower-case language tags of 1-12 characters directly before the
 * code are touched, and only when the opening marker does not follow an
 * ASCII letter, digit or underscore (`snake_ts`code`` stays). Code blocks
 * and inline code values are never changed.
 */
import type { AstNode, Transform } from "../../types.ts";
import { text } from "./_wp2.ts";

const LANG = /^[a-z][a-z0-9]{0,11}$/;
/** Languages whose unclosed `_lang`code`` form is still Code Hike syntax. */
const UNCLOSED_LANGS = new Set([
  "rs",
  "ts",
  "js",
  "tsx",
  "jsx",
  "shell",
  "sh",
  "bash",
]);
const TEXT_PREFIX = /(^|[^A-Za-z0-9_*\\])([_*])([a-z][a-z0-9]{0,11})$/;

type Text = AstNode & { type: "text"; value: string };
const isText = (n: AstNode | undefined): n is Text => n?.type === "text";
const isCode = (n: AstNode | undefined) => n?.type === "inlineCode";

/** Does child `i - 1` end a `[_*]lang` prefix, or (bareOk) is it a bare
 *  `lang` first child whose marker is the container's own? */
function langBefore(kids: AstNode[], i: number, bareOk: boolean): boolean {
  const prev = kids[i - 1];
  if (!isText(prev)) return false;
  if (TEXT_PREFIX.test(prev.value)) return true;
  return bareOk && i - 1 === 0 && LANG.test(prev.value);
}

/** Should emphasis child `i` be unwrapped back to its markers? */
function unwrappable(kids: AstNode[], i: number): boolean {
  const ek = kids[i]!.children ?? [];
  if (ek.length === 0) return false;
  // Opening marker starts its own `lang`code`` or closes the previous one.
  const openOwn = isText(ek[0]) && LANG.test(ek[0].value) && isCode(ek[1]);
  const openPrev = isCode(kids[i - 1]) && langBefore(kids, i - 1, true);
  // Closing marker ends its own construct or opens the next sibling's.
  const closeOwn =
    isCode(ek[ek.length - 1]) && langBefore(ek, ek.length - 1, true);
  const next = kids[i + 1];
  const closeNext =
    isText(next) && LANG.test(next.value) && isCode(kids[i + 2]);
  return (openOwn || openPrev) && (closeOwn || closeNext);
}

function fixContainer(n: AstNode): void {
  let kids = [...n.children!];
  let changed = false;

  // 1. emphasis(text lang, inlineCode) -> inlineCode
  kids = kids.map((c) => {
    if (c.type !== "emphasis" || c.children?.length !== 2) return c;
    const [lang, code] = c.children as [AstNode, AstNode];
    if (isText(lang) && LANG.test(lang.value) && isCode(code)) {
      changed = true;
      return { type: "inlineCode", value: code.value };
    }
    return c;
  });

  // 2. Unwrap emphasis whose markers belong to neighbouring constructs,
  //    one at a time, merging text after each so the next check sees the
  //    restored markers.
  const mergeText = (list: AstNode[]) => {
    const merged: AstNode[] = [];
    for (const c of list) {
      const last = merged[merged.length - 1];
      if (isText(c) && isText(last))
        merged[merged.length - 1] = text(last.value + c.value);
      else merged.push(c);
    }
    return merged;
  };
  for (;;) {
    const i = kids.findIndex(
      (c, k) => c.type === "emphasis" && unwrappable(kids, k),
    );
    if (i === -1) break;
    const e = kids[i]!;
    kids.splice(i, 1, text("*"), ...(e.children ?? []), text("*"));
    kids = mergeText(kids);
    changed = true;
  }

  // 3. text "…[_*]lang" + inlineCode + text "[_*]…"
  //    Translations sometimes lost the closing marker (`_shell`x`` or
  //    `\_rs`x`` followed by a word suffix): for a known code language the
  //    unclosed form is accepted too and only the prefix is cut.
  for (let i = 1; i < kids.length; i++) {
    const prev = kids[i - 1];
    const next = kids[i + 1];
    if (!isCode(kids[i]) || !isText(prev)) continue;
    const m = TEXT_PREFIX.exec(prev.value);
    if (!m) continue;
    const closed = isText(next) && /^[_*]/.test(next.value);
    if (!closed && !(m[2] === "_" && UNCLOSED_LANGS.has(m[3]!))) continue;
    kids[i - 1] = text(
      prev.value.slice(0, prev.value.length - m[3]!.length - 1),
    );
    if (closed) kids[i + 1] = text(next!.value.slice(1));
    changed = true;
  }

  if (changed) n.children = kids.filter((k) => !(isText(k) && k.value === ""));
}

function visit(n: AstNode): void {
  if (n.type === "code" || n.type === "inlineCode" || !n.children) return;
  for (const c of n.children) visit(c);
  if (n.children.some((c) => isCode(c) || c.type === "emphasis"))
    fixContainer(n);
}

export const transform: Transform = {
  name: "inline-code",
  order: 150,
  owner: "WP2",
  appliesTo: (source) => /[_*][a-z][a-z0-9]{0,11}`/.test(source),
  run(tree) {
    visit(tree);
  },
};
