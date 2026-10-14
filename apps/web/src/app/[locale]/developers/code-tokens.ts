/**
 * Minimal TypeScript tokenizer for the hero code sample. It only has to cover
 * the fixed snippet in HERO_CODE, so it recognises comments, strings, a few
 * keywords, numbers and call names. Shared by the server render and the
 * typing animation so both colour the code the same way.
 */
export type CodeTokenKind = "kw" | "str" | "fn" | "num" | "com" | "plain";
export type CodeToken = { kind: CodeTokenKind; value: string };

const KEYWORDS = new Set(["import", "from", "const", "await", "export"]);
const PATTERN =
  /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*")|\b(\d[\d_]*n?)\b|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;

export function tokenizeCode(source: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let last = 0;
  const push = (kind: CodeTokenKind, value: string) => {
    if (!value) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.kind === kind && kind === "plain") {
      prev.value += value;
    } else {
      tokens.push({ kind, value });
    }
  };

  for (const match of source.matchAll(PATTERN)) {
    const index = match.index ?? 0;
    push("plain", source.slice(last, index));
    const [text, comment, str, num, call, word] = match;
    if (comment) push("com", comment);
    else if (str) push("str", str);
    else if (num) push("num", num);
    else if (call) push(KEYWORDS.has(call) ? "kw" : "fn", call);
    else if (word) push(KEYWORDS.has(word) ? "kw" : "plain", word);
    last = index + text.length;
  }
  push("plain", source.slice(last));
  return tokens;
}

/** Returns the tokens covering only the first `length` characters. */
export function sliceTokens(tokens: CodeToken[], length: number): CodeToken[] {
  const out: CodeToken[] = [];
  let remaining = length;
  for (const token of tokens) {
    if (remaining <= 0) break;
    const value = token.value.slice(0, remaining);
    out.push({ kind: token.kind, value });
    remaining -= value.length;
  }
  return out;
}

export const TOKEN_CLASS: Record<CodeTokenKind, string> = {
  kw: "text-[var(--dl-code-kw)]",
  str: "text-[var(--dl-code-str)]",
  fn: "text-[var(--dl-code-fn)]",
  num: "text-[var(--dl-code-num)]",
  com: "text-[var(--dl-code-comment)] italic",
  plain: "",
};
