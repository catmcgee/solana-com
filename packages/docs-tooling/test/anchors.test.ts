/**
 * anchors + site-links (WP12): slug ports and the locale positional mapping
 * on a real corpus page.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TransformRegistry } from "../src/convert/registry.ts";
import { convertSource } from "../src/convert/run.ts";
import { transform as anchors } from "../src/convert/transforms/anchors.ts";
import {
  mintlifyServes,
  trimAutolink,
  pageUrl,
} from "../src/convert/transforms/site-links.ts";
import { legacySlugger, mintlifySlugger } from "../src/lib/slugs.ts";
import { repoRoot } from "../src/lib/paths.ts";

describe("slugs", () => {
  it("ports Mintlify ids as rendered by mint dev", () => {
    const m = mintlifySlugger();
    // Expected values read from `mint dev` HTML (docs/tools/actions, ar game-sdks).
    expect(m("actions.json")).toBe("actions-json");
    expect(m("Rules - pathPattern")).toBe("rules-pathpattern");
    expect(m("Dialect's Actions Registry")).toBe("dialect’s-actions-registry");
    expect(m("POST Response - Transaction")).toBe("post-response-transaction");
    expect(m("مجموعة تطوير يونيتي")).toBe("مجموعة-تطوير-يونيتي");
    expect(m("Turbo.Computer - محرك ألعاب Rust")).toBe(
      "turbo-computer-محرك-ألعاب-rust",
    );
    expect(m("Get Started")).toBe("get-started");
    expect(m("Get Started")).toBe("get-started-2");
    // cleanHeadingId: ASCII punctuation is dropped at render time (mint dev,
    // docs/research "Appendix A: the brief, in full").
    expect(m("Appendix A: the brief, in full")).toBe(
      "appendix-a-the-brief-in-full",
    );
    expect(m("What is x402? (beta)")).toBe("what-is-x402-beta");
    expect(m("如何使用：示例")).toBe("如何使用：示例");
  });
  it("keeps github-slugger for legacy ids", () => {
    const l = legacySlugger();
    expect(l("actions.json")).toBe("actionsjson");
    expect(l("Rules - pathPattern")).toBe("rules---pathpattern");
  });
});

describe("site-links helpers", () => {
  it("knows what Mintlify serves", () => {
    for (const p of [
      "/developers/docs",
      "/developers/docs/core#x",
      "/fr/developers/docs/a",
      "/learn/what-is-solana",
      "/developers/cookbook/x",
      "/zh/developers/bootcamp",
      "/docs-assets/a.png",
    ])
      expect(mintlifyServes(p), p).toBe(true);
    for (const p of [
      "/",
      "/learn",
      "/fr/learn",
      "/developers",
      "/developers/templates",
      "/skills",
      "/docsx",
    ])
      expect(mintlifyServes(p), p).toBe(false);
  });
  it("cuts autolink junk and computes page URLs", () => {
    expect(trimAutolink("http://localhost:3000，连接")).toBe(
      "http://localhost:3000",
    );
    expect(trimAutolink("http://localhost:8080)。使用")).toBe(
      "http://localhost:8080",
    );
    expect(trimAutolink("https://en.wikipedia.org/wiki/A_(b)")).toBe(
      "https://en.wikipedia.org/wiki/A_(b)",
    );
    expect(
      pageUrl("apps/docs/de/developers/docs/tools/attestations/overview.mdx"),
    ).toBe("/de/developers/docs/tools/attestations/overview");
    expect(pageUrl("apps/docs/developers/docs/core/index.mdx")).toBe(
      "/developers/docs/core",
    );
  });
});

describe("anchors on the real corpus", () => {
  it("maps an English fragment on a translated page by heading position", () => {
    const rel = "apps/docs/ar/developers/docs/clients/community/game-sdks.mdx";
    const src = readFileSync(path.join(repoRoot, rel), "utf8");
    const reg = new TransformRegistry().register(anchors);
    const out = convertSource(
      src,
      { path: rel, locale: "ar", collection: "docs" },
      reg,
    ).output;
    expect(out).not.toContain("](#unity-sdk)");
    expect(out).toContain("](#مجموعة-تطوير-يونيتي)");
    expect(
      convertSource(out, { path: rel, locale: "ar", collection: "docs" }, reg)
        .output,
    ).toBe(out);
  });
});
