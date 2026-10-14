import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compileLegacyNav } from "../src/nav/compile-legacy-nav.ts";
import {
  buildLocaleNav,
  internalPath,
  runBuild,
} from "../src/nav/build-locale-nav.ts";
import { clearMetaCache } from "../src/nav/legacy-meta.ts";
import { labelSites, slug } from "../src/nav/labels.ts";
import { loadInventory, urlOf } from "../src/nav/pages.ts";
import { runSwap } from "../src/nav/swap-translations.ts";
import type { NavFile, TemplateTab } from "../src/nav/types.ts";
import { navPageRefs, verifyNav } from "../src/nav/verify-nav.ts";

let root: string;
let docs: string;

function put(rel: string, content = "---\ntitle: T\n---\n") {
  const f = path.join(docs, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, content);
}
const meta = (rel: string, m: object) => put(rel, JSON.stringify(m));

/*
 * Fixture: docs/guide (meta with separator, nested path, link, a missing
 * entry and an orphan), docs/guide/sub (folder with index + defaultOpen),
 * docs/other (placed explicitly), a cookbook page, and a partial ja copy.
 */
beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "nav-test-"));
  docs = path.join(root, "apps/docs");
  put("docs/index.mdx");
  put("docs/guide/index.mdx", "---\ntitle: Guide\nindex: true\n---\n");
  put("docs/guide/a.mdx");
  put("docs/guide/b.mdx");
  put("docs/guide/orphan.mdx");
  put("docs/guide/sub/index.mdx");
  put("docs/guide/sub/c.mdx");
  put("docs/guide/ts/d.mdx");
  put("docs/other.mdx");
  put("developers/cookbook/index.mdx");
  meta("docs/guide/meta.json", {
    title: "Guide",
    pages: [
      "a",
      "---Section---",
      "sub",
      "ts/d",
      "missing",
      "---",
      "[GitHub](https://github.com)",
      "b",
    ],
  });
  meta("docs/guide/sub/meta.json", {
    title: "Sub",
    pages: ["c"],
    defaultOpen: true,
  });
  // ja: translated folder titles, a partial page set, a stale extra page.
  put("ja/docs/index.mdx");
  put("ja/docs/guide/index.mdx");
  put("ja/docs/guide/a.mdx");
  put("ja/docs/guide/sub/c.mdx");
  put("ja/docs/stale.mdx");
  meta("ja/docs/guide/meta.json", { title: "ガイド", pages: [] });
  meta("ja/docs/guide/sub/meta.json", { title: "サブ", pages: [] });
  for (const [loc, v] of [
    ["en", "Cookbook"],
    ["ja", "クックブック"],
  ] as const) {
    const f = path.join(root, "packages/i18n/messages/web", loc, "common.json");
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify({ developers: { nav: { cookbook: v } } }));
  }
  writeFileSync(
    path.join(docs, "docs.json"),
    JSON.stringify({ name: "x", navigation: {} }),
  );
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  clearMetaCache();
});

const TEMPLATE: TemplateTab[] = [
  {
    tab: "Start",
    groups: [
      { group: "Start", pages: ["docs/index", "docs/other"] },
      {
        group: "Guide",
        root: "docs/guide/index",
        pages: [{ expand: "docs/guide" }],
      },
      { group: "Cookbook", pages: ["developers/cookbook/index"] },
    ],
  },
  { tab: "Videos", href: "https://solana.com/docs/other", align: "end" },
];

function compile() {
  return compileLegacyNav({
    template: TEMPLATE,
    docsRoot: docs,
    repoRoot: root,
    locales: ["ja"],
    newPages: new Set(),
  });
}

describe("compile-legacy-nav", () => {
  it("expands meta.json with separators, nested paths, orphans and roots", () => {
    const { nav, report } = compile();
    const guide = nav.tabs[0]!.groups![1]!;
    expect(guide).toEqual({
      group: "Guide",
      root: "docs/guide/index",
      directory: "card",
      pages: [
        "docs/guide/a",
        {
          group: "Section",
          pages: [
            {
              group: "Sub",
              root: "docs/guide/sub/index",
              expanded: true,
              pages: ["docs/guide/sub/c"],
            },
            "docs/guide/ts/d",
          ],
        },
        "docs/guide/b",
        "docs/guide/orphan",
      ],
    });
    expect(report.orphans.map((o) => o.page)).toEqual(["docs/guide/orphan"]);
    expect(report.missing).toEqual([
      { folder: "docs/guide", entry: "missing" },
    ]);
    expect(report.droppedLinks).toHaveLength(1);
    expect(report.unplaced).toEqual([]);
    expect(report.duplicates).toEqual([]);
  });

  it("never duplicates a page the template places explicitly", () => {
    const t: TemplateTab[] = [
      {
        tab: "A",
        groups: [
          { group: "A", pages: ["docs/guide/b", { expand: "docs/guide" }] },
        ],
      },
    ];
    const r = compileLegacyNav({
      template: t,
      docsRoot: docs,
      repoRoot: root,
      locales: [],
      newPages: new Set(),
    });
    const refs = navPageRefs(r.nav);
    expect(refs.filter((p) => p === "docs/guide/b")).toHaveLength(1);
    expect(r.report.placedElsewhere.map((p) => p.page)).toContain(
      "docs/guide/b",
    );
  });

  it("seeds locale labels from legacy meta titles and UI strings", () => {
    const { nav, seeds } = compile();
    const keys = Object.fromEntries(labelSites(nav).map((s) => [s.en, s.key]));
    const ja = seeds.get("ja")!;
    expect(ja[keys.Guide!]).toBe("ガイド");
    expect(ja[keys.Sub!]).toBe("サブ");
    expect(ja[keys.Cookbook!]).toBe("クックブック");
    expect(ja[keys.Section!]).toBeUndefined(); // separators are untranslated
  });
});

describe("labels", () => {
  it("derives stable, unique keys", () => {
    expect(slug("Pay-per-call & agents")).toBe("pay-per-call-and-agents");
    const nav: NavFile = {
      tabs: [
        {
          tab: "T",
          groups: [
            { group: "X", pages: [] },
            { group: "X", pages: [] },
          ],
        },
      ],
    };
    expect(labelSites(nav).map((s) => s.key)).toEqual(["t", "t.x", "t.x~2"]);
  });
});

describe("build-locale-nav", () => {
  it("keeps the full IA and falls back to English pages", () => {
    const { nav, seeds } = compile();
    const inv = loadInventory(docs);
    const b = buildLocaleNav(nav, "ja", inv, seeds.get("ja")!);
    const refs = navPageRefs(b.nav);
    expect(refs).toHaveLength(navPageRefs(nav).length);
    expect(refs).toContain("ja/docs/guide/a");
    expect(refs).toContain("docs/guide/b");
    expect(b.pages.find((p) => p.page === "docs/guide/b")?.reason).toBe(
      "missing-translation",
    );
    expect(
      b.pages.find((p) => p.page === "developers/cookbook/index")?.reason,
    ).toBe("english-only");
    expect(b.nav.tabs[0]!.groups![1]!.group).toBe("ガイド");
    expect(b.labels.map((l) => l.en)).toContain("Section");
    // External tab href stays English until the page is translated.
    expect(b.nav.tabs[1]!.href).toBe("https://solana.com/docs/other");
  });

  it("maps internal hrefs and URLs", () => {
    expect(internalPath("https://solana.com/docs/x")).toBe("/docs/x");
    expect(internalPath("/docs/x")).toBe("/docs/x");
    expect(internalPath("https://example.com/docs/x")).toBeUndefined();
    expect(urlOf("docs/core/index")).toBe("/docs/core");
    expect(urlOf("docs/index")).toBe("/docs");
  });
});

describe("verify-nav, build and swap on a fixture project", () => {
  it("passes with exact coverage, then catches drift, then swaps", () => {
    const { nav, seeds } = compile();
    mkdirSync(path.join(docs, "navigation/labels"), { recursive: true });
    writeFileSync(path.join(docs, "navigation/en.json"), JSON.stringify(nav));
    writeFileSync(
      path.join(docs, "navigation/labels/ja.json"),
      JSON.stringify(seeds.get("ja")),
    );
    rmSync(path.join(docs, "ja/docs/stale.mdx"));
    runBuild({ docsRoot: docs, locales: ["ja"] });
    const docsJson = JSON.parse(
      readFileSync(path.join(docs, "docs.json"), "utf8"),
    );
    expect(docsJson.navigation.languages[1]).toEqual({
      language: "jp",
      $ref: "./navigation/ja.json",
    });
    expect(docsJson.name).toBe("x");

    let v = verifyNav({ docsRoot: docs, locales: ["ja"], newPages: [] });
    expect(v.errors).toEqual([]);

    // A locale page that is in no nav entry fails.
    put("ja/docs/stale.mdx");
    v = verifyNav({ docsRoot: docs, locales: ["ja"], newPages: [] });
    expect(v.errors).toContain('ja: page "ja/docs/stale" is in no nav entry');
    rmSync(path.join(docs, "ja/docs/stale.mdx"));

    // A new translation makes the generated nav stale until swapped.
    put("ja/docs/guide/b.mdx");
    v = verifyNav({ docsRoot: docs, locales: ["ja"], newPages: [] });
    expect(
      v.errors.some((e) => e.includes('"docs/guide/b" points at English')),
    ).toBe(true);
    const s = runSwap({ docsRoot: docs, locales: ["ja"] });
    expect(s.swapped).toEqual([
      { loc: "ja", page: "docs/guide/b", target: "ja/docs/guide/b" },
    ]);
    const ja = JSON.parse(
      readFileSync(path.join(docs, "navigation/ja.json"), "utf8"),
    );
    expect(navPageRefs(ja)).toContain("ja/docs/guide/b");
  });

  it("flags duplicates and missing files in en.json", () => {
    const nav: NavFile = {
      tabs: [
        {
          tab: "T",
          groups: [
            { group: "G", pages: ["docs/index", "docs/index", "docs/nope"] },
          ],
        },
      ],
    };
    writeFileSync(path.join(docs, "navigation/en.json"), JSON.stringify(nav));
    const v = verifyNav({ docsRoot: docs, locales: [], newPages: [] });
    expect(v.errors).toContain('en: "docs/index" appears 2 times');
    expect(v.errors).toContain('en: nav entry "docs/nope" has no file');
    expect(
      v.errors.some((e) => e.includes('"docs/other" is in no nav entry')),
    ).toBe(true);
  });
});

describe("committed navigation (apps/docs)", () => {
  it("has exact coverage and fresh generated files", () => {
    const v = verifyNav();
    expect(v.errors).toEqual([]);
  });
});
