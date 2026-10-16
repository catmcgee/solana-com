/**
 * WP7 special collections: bootcamp, video-guides, learn
 * transforms (fixtures + unit checks) and the tags generator.
 *
 * The transforms are imported directly (not via discovery) so these tests do
 * not depend on other work packages' transforms loading.
 */
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { TransformRegistry } from "../src/convert/registry.ts";
import { convertSource } from "../src/convert/run.ts";
import { describeTransformFixtures } from "./fixtures.ts";
import {
  transform as bootcamp,
  lessonForPath,
  MARKER,
} from "../src/convert/transforms/bootcamp.ts";
import {
  transform as videoGuides,
  COMPONENTS,
} from "../src/convert/transforms/video-guides.ts";
import {
  transform as learn,
  LEARN_ORDER,
} from "../src/convert/transforms/learn.ts";
import {
  formatTime,
  youtubeId,
  youtubeStart,
} from "../src/convert/transforms/_collections.ts";
import { developersLearnCourses } from "../data/bootcamp/developers-learn-curriculum.ts";
import { tutorialOrder } from "../data/learn/learn-tutorials.ts";
import { DEFAULT_TABS, generateTags, tagSlug } from "../src/generators/tags.ts";
import { docsRoot, repoRoot } from "../src/lib/paths.ts";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

for (const t of [bootcamp, videoGuides, learn]) describeTransformFixtures(t);

const run = (
  t: typeof bootcamp,
  source: string,
  file: {
    path: string;
    locale: string;
    collection: "docs" | "bootcamp" | "learn" | "cookbook";
  },
) => convertSource(source, file, new TransformRegistry().register(t));

describe("bootcamp curriculum coverage", () => {
  const lessons = developersLearnCourses.flatMap((c) =>
    c.lessons.map((l) => `developers/bootcamp/${c.slug}/${l.slug}.mdx`),
  );

  it("every curriculum lesson has an English page", () => {
    for (const rel of lessons)
      expect(existsSync(path.join(docsRoot, rel)), rel).toBe(true);
  });

  it("every lesson page resolves to a curriculum lesson with a video", () => {
    for (const rel of lessons) {
      const found = lessonForPath(`apps/docs/fr/${rel}`);
      expect(found, rel).toBeTruthy();
      expect(youtubeId(found!.lesson.video.url ?? ""), rel).toBeTruthy();
    }
  });

  it("index pages are not lessons", () => {
    expect(lessonForPath("apps/docs/developers/bootcamp/index.mdx")).toBe(
      undefined,
    );
    expect(
      lessonForPath("apps/docs/de/developers/bootcamp/depin/index.mdx"),
    ).toBe(undefined);
  });

  it("warns (and injects nothing) for a lesson missing from the curriculum", () => {
    const src = "---\ntitle: X\n---\n\nBody.\n";
    const r = run(bootcamp, src, {
      path: "apps/docs/developers/bootcamp/foundations/not-a-lesson.mdx",
      locale: "en",
      collection: "bootcamp",
    });
    expect(r.output).toBe(src);
    expect(r.diagnostics.map((d) => d.level)).toEqual(["warn"]);
  });

  it("leaves a marked lesson alone but warns when its video changed", () => {
    const src = `---\ntitle: Hello\n---\n\n{/* ${MARKER} */}\n\n<Frame>\n  <iframe src="https://www.youtube-nocookie.com/embed/OLDVIDEO" />\n</Frame>\n`;
    const r = run(bootcamp, src, {
      path: "apps/docs/developers/bootcamp/foundations/hello-world.mdx",
      locale: "en",
      collection: "bootcamp",
    });
    expect(r.output).toBe(src);
    expect(r.diagnostics[0]?.message).toMatch(/changed in the curriculum/);
  });
});

describe("video-guides", () => {
  it("leaves no legacy component in any English video guide", () => {
    const dir = path.join(docsRoot, "developers/docs/video-guides");
    for (const name of [
      "index",
      "2026-developer-bootcamp",
      "agent-payments",
      "building-depin-projects",
      "confidential-balances",
      "pay-sh-video-tutorials",
      "solana-crash-course",
    ]) {
      const rel = `developers/docs/video-guides/${name}.mdx`;
      const src = readFileSync(path.join(dir, `${name}.mdx`), "utf8");
      const r = run(videoGuides, src, {
        path: `apps/docs/${rel}`,
        locale: "en",
        collection: "docs",
      });
      expect(
        r.diagnostics.filter((d) => d.level === "error"),
        rel,
      ).toEqual([]);
      for (const c of COMPONENTS)
        expect(r.output.includes(`<${c}`), `${rel} <${c}`).toBe(false);
    }
  });

  it("rejects playlist-driven lists (would need a network fetch)", () => {
    const r = run(videoGuides, '<VideoChapterList playlistId="PL123" />\n', {
      path: "apps/docs/developers/docs/video-guides/x.mdx",
      locale: "en",
      collection: "docs",
    });
    expect(r.diagnostics[0]?.level).toBe("error");
  });

  it("parses YouTube URLs and times", () => {
    expect(youtubeId("https://youtu.be/abc?si=x")).toBe("abc");
    expect(youtubeId("https://www.youtube.com/watch?v=abc&t=3")).toBe("abc");
    expect(
      youtubeId("https://www.youtube-nocookie.com/embed/abc?start=1"),
    ).toBe("abc");
    expect(youtubeId("https://example.com/v")).toBe(null);
    expect(youtubeStart("https://youtu.be/a?t=1m30s")).toBe(90);
    expect(youtubeStart("https://youtu.be/a?t=498")).toBe(498);
    expect(formatTime(18112)).toBe("5:01:52");
  });
});

describe("learn", () => {
  it("orders getting-started first, then the legacy chapters", () => {
    expect(LEARN_ORDER[0]).toBe("learn/getting-started");
    expect(LEARN_ORDER.slice(1)).toEqual(
      tutorialOrder.map((s) => `learn/${s}`),
    );
    for (const p of LEARN_ORDER)
      expect(existsSync(path.join(docsRoot, `${p}.mdx`)), p).toBe(true);
  });
});

describe("gen:tags", () => {
  const root = mkdtempSync(path.join(tmpdir(), "docs-tags-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const write = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  write(
    "developers/docs/tags/index.mdx",
    "---\ntitle: Documentation tags\n# keep me\n---\n\nold body\n",
  );
  write("fr/developers/docs/tags/index.mdx", "---\ntitle: Tags\n---\n");
  write(
    "developers/docs/index.mdx",
    "---\ntitle: Start\ndescription: Begin {here}.\n---\n",
  );
  write(
    "fr/developers/docs/index.mdx",
    "---\ntitle: Commencer\ndescription: Ici.\n---\n",
  );
  write("developers/docs/payments/index.mdx", "---\ntitle: Payments\n---\n");
  write(
    "developers/docs/a.mdx",
    "---\ntitle: Page A\ndescription: About A.\ndocumentationTags: [Stablecoins, ' stablecoins ']\n---\n",
  );
  write(
    "developers/docs/b.mdx",
    "---\ntitle: Page B\ndocumentationTags:\n  - Agents\n  - Stablecoins\n---\n",
  );

  it("generates tag sections and tab cards, keeping frontmatter bytes", () => {
    const r = generateTags({ docsRoot: root });
    expect(r.ok).toBe(true);
    expect(r.written).toEqual([
      "developers/docs/tags/index.mdx",
      "fr/developers/docs/tags/index.mdx",
    ]);
    const en = readFileSync(
      path.join(root, "developers/docs/tags/index.mdx"),
      "utf8",
    );
    expect(
      en.startsWith(
        "---\ntitle: Documentation tags\n# keep me\n---\n\n{/* GENERATED",
      ),
    ).toBe(true);
    expect(en).not.toContain("old body");
    expect(en.indexOf("## Agents")).toBeLessThan(en.indexOf("## Stablecoins"));
    expect(en).toContain(
      '<Card title="Page A" href="/developers/docs/a">\n    About A.\n  </Card>',
    );
    expect(en.match(/Page A/g)?.length).toBe(1); // duplicate tag folded
    expect(en).toContain("## Browse by section");
    expect(en).toContain(
      '<Card title="Start here" href="/developers/docs" icon="house">\n    Begin \\{here\\}.',
    );
    // Missing tab roots (e.g. not-yet-written hubs) are skipped.
    expect(en).not.toContain("/developers/docs/assets");
    const fr = readFileSync(
      path.join(root, "fr/developers/docs/tags/index.mdx"),
      "utf8",
    );
    expect(fr).toContain(
      '<Card title="Commencer" href="/fr/developers/docs" icon="house">',
    );
    // Untranslated page -> English fallback.
    expect(fr).toContain('href="/developers/docs/payments"');
    expect(fr).not.toContain("## Browse by section");
  });

  it("is idempotent and --check reports drift", () => {
    expect(generateTags({ docsRoot: root, check: true }).ok).toBe(true);
    write(
      "developers/docs/c.mdx",
      "---\ntitle: C\ndocumentationTags: [New]\n---\n",
    );
    const r = generateTags({ docsRoot: root, check: true });
    expect(r.ok).toBe(false);
    expect(r.written).toEqual(["developers/docs/tags/index.mdx"]);
  });

  it("reads tabs from navigation/<lang>.json when present", () => {
    write(
      "navigation/en.json",
      JSON.stringify({
        tabs: [
          {
            tab: "@label:tabs.start",
            icon: "house",
            groups: [
              {
                group: "x",
                pages: [
                  { group: "g", root: "developers/docs/index", pages: [] },
                ],
              },
            ],
          },
          {
            tab: "Hidden",
            hidden: true,
            groups: [{ group: "h", pages: ["developers/docs/a"] }],
          },
          { tab: "Video", href: "https://example.com" },
        ],
      }),
    );
    write(
      "navigation/labels/en.json",
      JSON.stringify({ tabs: { start: "Begin here" } }),
    );
    generateTags({ docsRoot: root, lang: "en" });
    const en = readFileSync(
      path.join(root, "developers/docs/tags/index.mdx"),
      "utf8",
    );
    expect(en).toContain(
      '<Card title="Begin here" href="/developers/docs" icon="house">',
    );
    expect(en).not.toContain('title="Payments"');
  });

  it("slugs match the legacy tag URLs", () => {
    expect(tagSlug("Stablecoins & Payments")).toBe("stablecoins-payments");
    expect(tagSlug("Déjà vu")).toBe("deja-vu");
  });

  it("output is stable under the repo formatter (oxfmt runs on commit)", () => {
    const bin = path.join(repoRoot, "node_modules/.bin/oxfmt");
    if (!existsSync(bin)) return;
    const dir = mkdtempSync(path.join(tmpdir(), "docs-tags-fmt-"));
    try {
      copyFileSync(
        path.join(repoRoot, ".oxfmtrc.json"),
        path.join(dir, ".oxfmtrc.json"),
      );
      write(
        "developers/docs/long.mdx",
        "---\ntitle: A very long page title that pushes the opening Card tag past eighty columns\ndescription: Words words words words words words words words words words words words words words words.\ndocumentationTags: [Long]\n---\n",
      );
      write(
        "developers/docs/quoted.mdx",
        "---\ntitle: 'The \"quoted\" title of a long page that needs an expression attribute'\ndocumentationTags: [Long]\n---\n",
      );
      generateTags({ docsRoot: root, lang: "en" });
      const want = readFileSync(
        path.join(root, "developers/docs/tags/index.mdx"),
        "utf8",
      );
      const file = path.join(dir, "page.mdx");
      writeFileSync(file, want);
      execFileSync(bin, [file], { cwd: dir, stdio: "ignore" });
      expect(readFileSync(file, "utf8")).toBe(want);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to the spec §2.2 tab roots", () => {
    expect(DEFAULT_TABS.map((t) => t.page)).toContain(
      "developers/docs/video-guides/index",
    );
    expect(DEFAULT_TABS.length).toBe(8);
  });
});
