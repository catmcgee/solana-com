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
import {
  buildLocaleNav,
  internalPath,
  runBuild,
} from "../src/nav/build-locale-nav.ts";
import { labelSites, slug } from "../src/nav/labels.ts";
import { loadInventory, urlOf } from "../src/nav/pages.ts";
import { runSwap } from "../src/nav/swap-translations.ts";
import type { NavFile } from "../src/nav/types.ts";
import { navPageRefs, verifyNav } from "../src/nav/verify-nav.ts";

let root: string;
let docs: string;

function put(rel: string, content = "---\ntitle: T\n---\n") {
  const f = path.join(docs, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, content);
}

/*
 * Fixture: docs/guide (a separator group, a nested folder with an index and
 * an expanded group), docs/other, a cookbook page, and a partial ja copy.
 */
beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "nav-test-"));
  docs = path.join(root, "apps/docs");
  put("developers/docs/index.mdx");
  put(
    "developers/docs/guide/index.mdx",
    "---\ntitle: Guide\nindex: true\n---\n",
  );
  put("developers/docs/guide/a.mdx");
  put("developers/docs/guide/b.mdx");
  put("developers/docs/guide/orphan.mdx");
  put("developers/docs/guide/sub/index.mdx");
  put("developers/docs/guide/sub/c.mdx");
  put("developers/docs/guide/ts/d.mdx");
  put("developers/docs/other.mdx");
  put("developers/cookbook/index.mdx");
  // ja: a partial page set and a stale extra page.
  put("ja/developers/docs/index.mdx");
  put("ja/developers/docs/guide/index.mdx");
  put("ja/developers/docs/guide/a.mdx");
  put("ja/developers/docs/guide/sub/c.mdx");
  put("ja/developers/docs/stale.mdx");
  writeFileSync(
    path.join(docs, "docs.json"),
    JSON.stringify({ name: "x", navigation: {} }),
  );
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const NAV: NavFile = {
  tabs: [
    {
      tab: "Start",
      groups: [
        {
          group: "Start",
          pages: ["developers/docs/index", "developers/docs/other"],
        },
        {
          group: "Guide",
          root: "developers/docs/guide/index",
          directory: "card",
          pages: [
            "developers/docs/guide/a",
            {
              group: "Section",
              pages: [
                {
                  group: "Sub",
                  root: "developers/docs/guide/sub/index",
                  expanded: true,
                  pages: ["developers/docs/guide/sub/c"],
                },
                "developers/docs/guide/ts/d",
              ],
            },
            "developers/docs/guide/b",
            "developers/docs/guide/orphan",
          ],
        },
        { group: "Cookbook", pages: ["developers/cookbook/index"] },
      ],
    },
    {
      tab: "Videos",
      href: "https://solana.com/developers/docs/other",
      align: "end",
    },
  ],
};

const JA_LABELS = {
  "start.cookbook": "クックブック",
  "start.guide": "ガイド",
  "start.guide.section.sub": "サブ",
};

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

  it("walks pages listed straight in a tab (no group header)", () => {
    const nav: NavFile = {
      tabs: [
        {
          tab: "Start here",
          pages: [
            "developers/docs/index",
            {
              group: "Quickstart",
              root: "developers/docs/quickstart",
              pages: ["developers/docs/quickstart/a"],
            },
          ],
        },
      ],
    };
    expect(labelSites(nav).map((s) => s.key)).toEqual([
      "start-here",
      "start-here.quickstart",
    ]);
    expect(navPageRefs(nav)).toEqual([
      "developers/docs/index",
      "developers/docs/quickstart",
      "developers/docs/quickstart/a",
    ]);
  });
});

describe("build-locale-nav", () => {
  it("keeps the full IA and falls back to English pages", () => {
    const inv = loadInventory(docs);
    const b = buildLocaleNav(NAV, "ja", inv, JA_LABELS);
    const refs = navPageRefs(b.nav);
    expect(refs).toHaveLength(navPageRefs(NAV).length);
    expect(refs).toContain("ja/developers/docs/guide/a");
    expect(refs).toContain("developers/docs/guide/b");
    expect(
      b.pages.find((p) => p.page === "developers/docs/guide/b")?.reason,
    ).toBe("missing-translation");
    expect(
      b.pages.find((p) => p.page === "developers/cookbook/index")?.reason,
    ).toBe("english-only");
    expect(b.nav.tabs[0]!.groups![1]!.group).toBe("ガイド");
    expect(b.labels.map((l) => l.en)).toContain("Section");
    // External tab href stays English until the page is translated.
    expect(b.nav.tabs[1]!.href).toBe(
      "https://solana.com/developers/docs/other",
    );
  });

  it("maps internal hrefs and URLs", () => {
    expect(internalPath("https://solana.com/docs/x")).toBe("/docs/x");
    expect(internalPath("/developers/docs/x")).toBe("/developers/docs/x");
    expect(internalPath("https://example.com/docs/x")).toBeUndefined();
    expect(urlOf("developers/docs/core/index")).toBe("/developers/docs/core");
    expect(urlOf("developers/docs/index")).toBe("/developers/docs");
  });
});

describe("verify-nav, build and swap on a fixture project", () => {
  it("passes with exact coverage, then catches drift, then swaps", () => {
    mkdirSync(path.join(docs, "navigation/labels"), { recursive: true });
    writeFileSync(path.join(docs, "navigation/en.json"), JSON.stringify(NAV));
    writeFileSync(
      path.join(docs, "navigation/labels/ja.json"),
      JSON.stringify(JA_LABELS),
    );
    rmSync(path.join(docs, "ja/developers/docs/stale.mdx"));
    runBuild({ docsRoot: docs, locales: ["ja"] });
    const docsJson = JSON.parse(
      readFileSync(path.join(docs, "docs.json"), "utf8"),
    );
    expect(docsJson.navigation.languages[1]).toEqual({
      language: "jp",
      $ref: "./navigation/ja.json",
    });
    expect(docsJson.name).toBe("x");

    let v = verifyNav({ docsRoot: docs, locales: ["ja"] });
    expect(v.errors).toEqual([]);

    // A locale page that is in no nav entry fails.
    put("ja/developers/docs/stale.mdx");
    v = verifyNav({ docsRoot: docs, locales: ["ja"] });
    expect(v.errors).toContain(
      'ja: page "ja/developers/docs/stale" is in no nav entry',
    );
    rmSync(path.join(docs, "ja/developers/docs/stale.mdx"));

    // A new translation makes the generated nav stale until swapped.
    put("ja/developers/docs/guide/b.mdx");
    v = verifyNav({ docsRoot: docs, locales: ["ja"] });
    expect(
      v.errors.some((e) =>
        e.includes('"developers/docs/guide/b" points at English'),
      ),
    ).toBe(true);
    const s = runSwap({ docsRoot: docs, locales: ["ja"] });
    expect(s.swapped).toEqual([
      {
        loc: "ja",
        page: "developers/docs/guide/b",
        target: "ja/developers/docs/guide/b",
      },
    ]);
    const ja = JSON.parse(
      readFileSync(path.join(docs, "navigation/ja.json"), "utf8"),
    );
    expect(navPageRefs(ja)).toContain("ja/developers/docs/guide/b");
  });

  it("flags duplicates and missing files in en.json", () => {
    const nav: NavFile = {
      tabs: [
        {
          tab: "T",
          groups: [
            {
              group: "G",
              pages: [
                "developers/docs/index",
                "developers/docs/index",
                "developers/docs/nope",
              ],
            },
          ],
        },
      ],
    };
    writeFileSync(path.join(docs, "navigation/en.json"), JSON.stringify(nav));
    const v = verifyNav({ docsRoot: docs, locales: [] });
    expect(v.errors).toContain('en: "developers/docs/index" appears 2 times');
    expect(v.errors).toContain(
      'en: nav entry "developers/docs/nope" has no file',
    );
    expect(
      v.errors.some((e) =>
        e.includes('"developers/docs/other" is in no nav entry'),
      ),
    ).toBe(true);
  });
});

describe("committed navigation (apps/docs)", () => {
  it("has exact coverage and fresh generated files", () => {
    const v = verifyNav();
    expect(v.errors).toEqual([]);
  });
});
