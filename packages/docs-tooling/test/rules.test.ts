import { describe, expect, it } from "vitest";
import {
  classify,
  legacyUrl,
  newPath,
  parseLegacyPath,
  routeSuffix,
  candidateFilesForUrl,
} from "../src/move/rules.ts";
import {
  enumerateLegacyUrls,
  parseCurriculum,
} from "../src/verify/legacy-urls.ts";
import { resolveUrls } from "../src/verify/verify-urls.ts";
import type { RedirectIndex } from "../src/verify/redirects.ts";

const C = "apps/docs/content/";

describe("path rules", () => {
  it.each([
    [`${C}docs/en/index.mdx`, "apps/docs/developers/docs/index.mdx", "/docs"],
    [
      `${C}docs/en/core/accounts/index.mdx`,
      "apps/docs/developers/docs/core/accounts/index.mdx",
      "/docs/core/accounts",
    ],
    [
      `${C}docs/fr/core/fees.mdx`,
      "apps/docs/fr/developers/docs/core/fees.mdx",
      "/fr/docs/core/fees",
    ],
    [
      `${C}cookbook/wallets/create-keypair.mdx`,
      "apps/docs/developers/cookbook/wallets/create-keypair.mdx",
      "/developers/cookbook/wallets/create-keypair",
    ],
    [
      `${C}cookbook/index.mdx`,
      "apps/docs/developers/cookbook/index.mdx",
      "/developers/cookbook",
    ],
    [
      `${C}developers-learn/en/foundations/hello-world.mdx`,
      "apps/docs/developers/bootcamp/foundations/hello-world.mdx",
      "/developers/bootcamp/foundations/hello-world",
    ],
    [
      `${C}developers-learn/ja/index.mdx`,
      "apps/docs/ja/developers/bootcamp/index.mdx",
      "/ja/developers/bootcamp",
    ],
    [
      `${C}learn/en/what-is-solana.mdx`,
      "apps/docs/learn/what-is-solana.mdx",
      "/learn/what-is-solana",
    ],
    [
      `${C}learn/zh/what-is-solana.mdx`,
      "apps/docs/zh/learn/what-is-solana.mdx",
      "/zh/learn/what-is-solana",
    ],
  ])("%s", (src, dest, url) => {
    const e = parseLegacyPath(src)!;
    expect(newPath(e)).toBe(dest);
    expect(legacyUrl(e)).toBe(url);
    // The new layout mirrors the URL (docs moved under /developers/docs,
    // LAYOUT_BASE), so the current URL resolves to the dest file.
    const current = url.replace(/^(\/fr)?\/docs(?=\/|$)/, "$1/developers/docs");
    expect(candidateFilesForUrl(current)).toContain(dest);
  });

  it("maps index files to folder URLs", () => {
    expect(routeSuffix("index.mdx")).toBe("");
    expect(routeSuffix("a/b/index.mdx")).toBe("/a/b");
    expect(routeSuffix("a/b.mdx")).toBe("/a/b");
  });
});

describe("classify", () => {
  const files = [
    `${C}docs/en/clients/index.mdx`,
    `${C}docs/en/tools/private-channels/index.mdx`,
    `${C}docs/en/tools/kora/assets/kora.svg`,
    `${C}docs/en/meta.json`,
    `${C}docs/fr/clients/index.mdx`,
    `${C}docs/fr/clients/go.mdx`,
    `${C}docs/fr/tools/private-channels.mdx`,
    `${C}docs/fr/tools/private-channels/index.mdx`,
    `${C}docs/el/clients/index.mdx`,
    `${C}docs/el/meta.json`,
    `${C}docs/fr/brand-new.mdx`,
  ];
  const { rows, unexpectedLocaleOnly } = classify(files);
  const by = (src: string) => rows.find((r) => r.src === src)!;

  it("applies R1/R2/R9/META", () => {
    expect(by(`${C}docs/en/clients/index.mdx`)).toMatchObject({
      rule: "R1",
      status: "moved",
    });
    expect(by(`${C}docs/fr/clients/index.mdx`)).toMatchObject({
      rule: "R2",
      dest: "apps/docs/fr/developers/docs/clients/index.mdx",
    });
    expect(by(`${C}docs/en/tools/kora/assets/kora.svg`)).toMatchObject({
      rule: "R9",
      status: "moved-asset",
    });
    expect(by(`${C}docs/en/meta.json`)).toMatchObject({
      rule: "META",
      status: "moved-meta",
      dest: "apps/docs/developers/docs/meta.json",
    });
  });

  it("marks R8 stale files and URL collisions", () => {
    expect(by(`${C}docs/fr/clients/go.mdx`)).toMatchObject({
      rule: "R8",
      status: "removed-redirect",
    });
    expect(by(`${C}docs/fr/tools/private-channels.mdx`)).toMatchObject({
      rule: "R8",
      status: "removed-collision",
      dest: "apps/docs/fr/developers/docs/tools/private-channels/index.mdx",
    });
  });

  it("removes Greek with a redirect to English", () => {
    expect(by(`${C}docs/el/clients/index.mdx`)).toMatchObject({
      rule: "EL",
      status: "removed-redirect",
      redirect: "/docs/clients",
      url: "/el/docs/clients",
    });
    expect(by(`${C}docs/el/meta.json`)).toMatchObject({
      rule: "EL",
      status: "removed",
    });
  });

  it("reports unexpected locale-only files instead of deleting them", () => {
    expect(unexpectedLocaleOnly).toEqual([`${C}docs/fr/brand-new.mdx`]);
    expect(by(`${C}docs/fr/brand-new.mdx`)).toMatchObject({ status: "moved" });
  });
});

describe("legacy URLs", () => {
  const curriculum = parseCurriculum(`
    export const developersLearnCourses: X[] = [
      { id: 1, slug: "foundations", outcomes: ["a"], lessons: [
        { id: 1, slug: "hello-world", resourceLinks: [{ href: "x" }] },
      ] },
    ];
    export const other = [{ slug: "nope" }];
  `);

  it("parses the curriculum by bracket depth", () => {
    expect([...curriculum.courses.keys()]).toEqual(["foundations"]);
    expect([...curriculum.courses.get("foundations")!]).toEqual([
      "hello-world",
    ]);
  });

  const files = [
    `${C}docs/en/a.mdx`,
    `${C}docs/en/b.mdx`,
    `${C}docs/fr/a.mdx`,
    `${C}docs/fr/only-fr.mdx`,
    `${C}docs/en/moved/index.mdx`,
    `${C}docs/fr/moved.mdx`,
    `${C}cookbook/x.mdx`,
    `${C}developers-learn/en/index.mdx`,
    `${C}developers-learn/en/foundations/index.mdx`,
    `${C}developers-learn/en/foundations/hello-world.mdx`,
    `${C}developers-learn/en/foundations/not-in-curriculum.mdx`,
    `${C}learn/en/what-is-solana.mdx`,
  ];
  const { urls, unroutedBootcampFiles } = enumerateLegacyUrls(
    files,
    curriculum,
    ["en", "fr"],
  );
  const list = urls.map((u) => `${u.url} ${u.kind}`);

  it("serves English fallbacks for every locale", () => {
    expect(list).toContain("/fr/docs/a page");
    expect(list).toContain("/fr/docs/b fallback");
    expect(list).toContain("/fr/developers/cookbook/x fallback");
    expect(list).toContain("/fr/learn route");
    expect(list).toContain("/learn/what-is-solana page");
    expect(list).toContain("/developers route");
    expect(list).toContain("/fr/developers route");
  });

  it("marks locale files with no English twin as locale-only", () => {
    expect(list).toContain("/fr/docs/only-fr locale-only");
    // x.mdx vs x/index.mdx is the same URL, so it has an English twin.
    expect(list).toContain("/fr/docs/moved page");
  });

  it("gates bootcamp on the curriculum", () => {
    expect(list).toContain("/developers/bootcamp/foundations/hello-world page");
    expect(unroutedBootcampFiles).toEqual([
      `${C}developers-learn/en/foundations/not-in-curriculum.mdx`,
    ]);
  });

  /** Index for redirect rules given as [from, to]; `*` = rest of the path. */
  const rules = (...pairs: [string, string][]): RedirectIndex => ({
    redirects: pairs.map(([source, destination]) => ({ source, destination })),
    match(url) {
      for (const [from, to] of pairs) {
        if (from.endsWith("*")) {
          const base = from.slice(0, -1);
          if (url.startsWith(base))
            return {
              source: from,
              destination: to,
              resolved: to.replace(/\*$/, url.slice(base.length)),
            };
        } else if (url === from)
          return { source: from, destination: to, resolved: to };
      }
      return null;
    },
  });
  // The 2026-10-16 move: /docs/x -> /developers/docs/x (and locale twins).
  const docsMove: [string, string][] = [
    ["/docs/*", "/developers/docs/*"],
    ["/fr/docs/*", "/fr/developers/docs/*"],
  ];

  it("resolves URLs against the new layout", () => {
    const pages = new Set([
      "apps/docs/developers/docs/a.mdx",
      "apps/docs/developers/docs/b.mdx",
      "apps/docs/fr/developers/docs/a.mdx",
      "apps/docs/developers/cookbook/x.mdx",
    ]);
    const res = resolveUrls(urls, pages, [], { web: rules(...docsMove) });
    const by = Object.fromEntries(res.map((r) => [r.url, r]));
    expect(by["/fr/docs/a"]).toMatchObject({
      cls: "redirect",
      target: "/fr/developers/docs/a",
    });
    // Missing translation: the redirect lands on the English fallback.
    expect(by["/fr/docs/b"]).toMatchObject({
      cls: "redirect",
      target: "/fr/developers/docs/b",
    });
    expect(by["/fr/developers/cookbook/x"]!.cls).toBe("cookbook-rewrite");
    expect(by["/learn/what-is-solana"]!.cls).toBe("unmapped");
    // Without the move redirects the old URLs have nothing to serve them.
    const bare = resolveUrls(urls, pages, []);
    expect(bare.find((r) => r.url === "/fr/docs/a")!.cls).toBe("unmapped");
  });

  it("follows redirect chains and fails long or dead ones", () => {
    const pages = new Set(["apps/docs/developers/docs/a.mdx"]);
    const two = resolveUrls(urls, pages, [], {
      web: rules(["/docs/b", "/docs/a"], ...docsMove),
    });
    expect(two.find((r) => r.url === "/docs/b")).toMatchObject({
      cls: "redirect",
      target: "/developers/docs/a (2 hops)",
    });
    const three = resolveUrls(urls, pages, [], {
      web: rules(["/docs/b", "/docs/c"], ["/docs/c", "/docs/a"], ...docsMove),
    });
    expect(three.find((r) => r.url === "/docs/b")!.cls).toBe("redirect-chain");
    const dead = resolveUrls(urls, pages, [], { web: rules(...docsMove) });
    expect(dead.find((r) => r.url === "/docs/b")).toMatchObject({
      cls: "redirect-dead",
      target: "/developers/docs/b",
    });
  });

  it("classes redirected paths before files", () => {
    const pages = new Set([
      "apps/docs/docs/a.mdx",
      "apps/docs/docs/b.mdx",
      "apps/docs/fr/docs/a.mdx",
      "apps/docs/fr/docs/only-fr.mdx",
    ]);
    const index = (from: string, to: string): RedirectIndex => ({
      redirects: [{ source: from, destination: to }],
      match: (url) =>
        url === from ? { source: from, destination: to, resolved: to } : null,
    });
    const res = resolveUrls(urls, pages, [], {
      web: index("/docs/b", "/docs/a"),
      pending: index("/fr/docs/only-fr", "/fr/docs/a"),
    });
    const cls = Object.fromEntries(res.map((r) => [r.url, r.cls]));
    expect(cls["/docs/b"]).toBe("redirect");
    expect(cls["/fr/docs/only-fr"]).toBe("redirect-pending");
    expect(cls["/fr/docs/a"]).toBe("exact");
  });
});
