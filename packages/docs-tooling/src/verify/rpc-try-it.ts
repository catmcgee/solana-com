/**
 * RPC "Try it" contract (`verify`, 2026-10-16).
 *
 * `apps/docs/rpc-try-it.js` adds a live "Try it" panel to every RPC method
 * page. It needs no generated marker: it reads the request from the page's
 * own `<RequestExample>` (the `bash cURL` fence on `docs/rpc/http/*`, the
 * `json WebSocket` fence on `docs/rpc/websocket/*Subscribe`), which the
 * api-method convert transform produced from the old `!!request curl` block.
 * A page whose example stops parsing as a JSON-RPC request for its own method
 * would silently lose the panel, so this check runs the script's own
 * extraction (`window.solRpcTryIt._test`, loaded in a VM) on the first fence
 * of every RPC method page in every locale. English pages fail the check;
 * translated pages are reported only (Lingo owns them; on 2026-10-16 the 17
 * translated getBlocksWithLimit pages still carry the old, invalid JSON
 * example that English has since fixed, so they get no panel).
 *
 * Unsubscribe pages are out of scope by design (they need a live
 * subscription id), as on the old site.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { DEFAULT_LOCALE, TARGET_LOCALES } from "../lib/locales.ts";
import { docsRoot, repoRoot, toPosix } from "../lib/paths.ts";

export const RPC_TRY_IT_SCRIPT = path.join(docsRoot, "rpc-try-it.js");

export interface TryItRequest {
  method: string;
  body: string;
}

export interface TryItPage {
  kind: "http" | "ws";
  slug: string;
  path: string;
}

export interface TryItApi {
  pageInfo(pathname: string): TryItPage | null;
  curlBody(text: string): string | null;
  requestFromText(
    kind: TryItPage["kind"],
    slug: string,
    text: string,
  ): TryItRequest | null;
  prettyJson(text: string): string;
}

/** Runs rpc-try-it.js in a VM with a minimal DOM and returns its `_test`. */
export function loadTryItScript(file = RPC_TRY_IT_SCRIPT): TryItApi {
  const window: Record<string, unknown> = {};
  const context = {
    window,
    document: {
      readyState: "complete",
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    location: { pathname: "/", hostname: "localhost", origin: "" },
    JSON,
    Math,
  };
  vm.runInNewContext(readFileSync(file, "utf8"), context, { filename: file });
  const api = (window.solRpcTryIt as { _test?: TryItApi } | undefined)?._test;
  if (!api) throw new Error(`${file} does not expose solRpcTryIt._test`);
  return api;
}

/** Text of the first fenced code block inside `<RequestExample>`, dedented. */
export function firstRequestFence(src: string): string | null {
  const block = /<RequestExample>([\s\S]*?)<\/RequestExample>/.exec(src)?.[1];
  if (!block) return null;
  const m = /^([ \t]*)(`{3,})[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*$/m.exec(block);
  if (!m) return null;
  const indent = m[1]!.length;
  return m[3]!
    .split("\n")
    .map((l) => l.slice(Math.min(indent, /^[ \t]*/.exec(l)![0].length)))
    .join("\n");
}

export interface TryItScan {
  /** "<locale> http|ws" -> pages that get the panel. */
  counts: Map<string, number>;
  /** Repo-relative files that get the panel. */
  pages: string[];
  /** English pages without a sendable example (fail `verify`). */
  failures: string[];
  /**
   * Translated pages without one (reported, not failing: translations come
   * from Lingo and follow the English page on the next sync).
   */
  localeWarnings: string[];
}

export function scanRpcTryIt(
  api: TryItApi = loadTryItScript(),
  locales: readonly string[] = [DEFAULT_LOCALE, ...TARGET_LOCALES],
): TryItScan {
  const counts = new Map<string, number>();
  const pages: string[] = [];
  const failures: string[] = [];
  const localeWarnings: string[] = [];
  for (const locale of locales) {
    const prefix = locale === DEFAULT_LOCALE ? "" : `${locale}/`;
    for (const folder of ["http", "websocket"]) {
      const dir = path.join(docsRoot, prefix, "docs", "rpc", folder);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir).sort()) {
        if (!name.endsWith(".mdx") || name === "index.mdx") continue;
        const slug = name.replace(/\.mdx$/, "");
        const file = path.join(dir, name);
        const rel = toPosix(path.relative(repoRoot, file));
        const info = api.pageInfo(`/${prefix}docs/rpc/${folder}/${slug}`);
        if (!info) continue; // unsubscribe pages: no panel by design
        const fence = firstRequestFence(readFileSync(file, "utf8"));
        const req = fence && api.requestFromText(info.kind, info.slug, fence);
        if (!req) {
          (locale === DEFAULT_LOCALE ? failures : localeWarnings).push(
            `${rel}: the first <RequestExample> fence is not a ${
              info.kind === "http" ? "cURL command with a " : ""
            }JSON-RPC request for "${slug}", so rpc-try-it.js shows no Try it panel`,
          );
          continue;
        }
        pages.push(rel);
        const key = `${locale} ${info.kind}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return { counts, pages, failures, localeWarnings };
}
