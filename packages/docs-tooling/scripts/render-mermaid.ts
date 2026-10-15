/**
 * Pre-render every ```mermaid fence in apps/docs to a themed SVG pair.
 *
 *   pnpm --filter @workspace/docs-tooling exec tsx scripts/render-mermaid.ts [--check] [--force]
 *   python3 packages/docs-tooling/scripts/embed-diagram-fonts.py
 *
 * Writes apps/docs/docs-assets/assets/docs/mermaid/<hash>-light.svg and
 * <hash>.svg (dark), where <hash> = mermaidHash(source) — the names the
 * mermaid convert transform links from the figure after each fence. Files
 * that exist are kept (sources are content-addressed); --force redraws all;
 * SVGs no fence uses any more are deleted. --check exits 1 when a figure is
 * missing or orphaned. Run embed-diagram-fonts.py afterwards so the labels
 * use ABC Diatype inside <img>.
 *
 * Style: the docs palette (styles/theme.css tokens, mockup .flow): neutral
 * fills, 1.5px Solana-purple outlines, zinc lines, green notes; light and
 * dark. Labels are SVG text (htmlLabels off), so the files work as <img>.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { mdxCodec } from "../src/convert/codec.ts";
import { mermaidHash } from "../src/convert/transforms/mermaid.ts";
import { listContentPages } from "../src/generators/_lib.ts";
import { repoRoot } from "../src/lib/paths.ts";
import type { AstNode } from "../src/types.ts";

const docsRoot = path.join(repoRoot, "apps", "docs");
const outDir = path.join(docsRoot, "docs-assets", "assets", "docs", "mermaid");
const fonts = path.join(docsRoot, "docs-assets", "brand", "fonts");
// mermaid is not a dependency of this package (it ships with the docs
// toolchain in the pnpm store); use the newest copy there, or MERMAID_JS.
function findMermaid(): string {
  if (process.env.MERMAID_JS) return process.env.MERMAID_JS;
  const store = path.join(repoRoot, "node_modules", ".pnpm");
  const dirs = readdirSync(store)
    .filter((d) => /^mermaid@\d/.test(d))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const d of dirs) {
    const f = path.join(
      store,
      d,
      "node_modules",
      "mermaid",
      "dist",
      "mermaid.min.js",
    );
    if (existsSync(f)) return f;
  }
  throw new Error("mermaid.min.js not found; set MERMAID_JS");
}
const mermaidJs = findMermaid();

const FONT = "Diatype, Inter, ui-sans-serif, system-ui, sans-serif";
const common = {
  fontFamily: FONT,
  // One label size for every diagram. The figure is shown at its natural
  // size (see sizeSvg), so 13px here is 13px on the page.
  fontSize: "13px",
};
const THEMES = {
  light: {
    ...common,
    background: "#ffffff",
    primaryColor: "#ffffff",
    primaryTextColor: "#18181b",
    primaryBorderColor: "#9945ff",
    secondaryColor: "#f3edff",
    secondaryBorderColor: "#9945ff",
    secondaryTextColor: "#18181b",
    tertiaryColor: "#fafafa",
    tertiaryBorderColor: "#d4d4d8",
    tertiaryTextColor: "#18181b",
    mainBkg: "#ffffff",
    nodeBorder: "#9945ff",
    nodeTextColor: "#18181b",
    textColor: "#18181b",
    titleColor: "#18181b",
    lineColor: "#71717a",
    clusterBkg: "#fafafa",
    clusterBorder: "#e4e4e7",
    edgeLabelBackground: "#ffffff",
    actorBkg: "#f3edff",
    actorBorder: "#9945ff",
    actorTextColor: "#18181b",
    actorLineColor: "#d4d4d8",
    signalColor: "#52525b",
    signalTextColor: "#18181b",
    labelBoxBkgColor: "#f3edff",
    labelBoxBorderColor: "#9945ff",
    labelTextColor: "#18181b",
    loopTextColor: "#52525b",
    noteBkgColor: "#f2fdf7",
    noteBorderColor: "#9de8c4",
    noteTextColor: "#0a5c3a",
    activationBkgColor: "#f3edff",
    activationBorderColor: "#9945ff",
    sequenceNumberColor: "#ffffff",
    altBackground: "#fafafa",
    pie1: "#9945ff",
    pie2: "#14f195",
    pie3: "#19d3c5",
    pie4: "#3b82f6",
    pie5: "#c4a1ff",
    pieStrokeColor: "#ffffff",
    pieOuterStrokeColor: "#e4e4e7",
  },
  dark: {
    ...common,
    darkMode: true,
    background: "#0a0a0b",
    primaryColor: "#111113",
    primaryTextColor: "#f2f2f3",
    primaryBorderColor: "#9945ff",
    secondaryColor: "#1c1430",
    secondaryBorderColor: "#9945ff",
    secondaryTextColor: "#f2f2f3",
    tertiaryColor: "#18181b",
    tertiaryBorderColor: "#3f3f46",
    tertiaryTextColor: "#f2f2f3",
    mainBkg: "#111113",
    nodeBorder: "#9945ff",
    nodeTextColor: "#f2f2f3",
    textColor: "#f2f2f3",
    titleColor: "#f2f2f3",
    lineColor: "#8b8b94",
    clusterBkg: "#111113",
    clusterBorder: "#2e2e33",
    edgeLabelBackground: "#0a0a0b",
    actorBkg: "#1c1430",
    actorBorder: "#9945ff",
    actorTextColor: "#f2f2f3",
    actorLineColor: "#3f3f46",
    signalColor: "#a1a1aa",
    signalTextColor: "#f2f2f3",
    labelBoxBkgColor: "#1c1430",
    labelBoxBorderColor: "#9945ff",
    labelTextColor: "#f2f2f3",
    loopTextColor: "#a1a1aa",
    noteBkgColor: "#0b261b",
    noteBorderColor: "#1f6b4b",
    noteTextColor: "#c9f9e2",
    activationBkgColor: "#1c1430",
    activationBorderColor: "#9945ff",
    sequenceNumberColor: "#0a0a0b",
    altBackground: "#111113",
    pie1: "#9945ff",
    pie2: "#14f195",
    pie3: "#19d3c5",
    pie4: "#60a5fa",
    pie5: "#c4a1ff",
    pieStrokeColor: "#0a0a0b",
    pieOuterStrokeColor: "#2e2e33",
  },
} as const;

// Shared stroke and corner rules (mockup .flow: 1.5px outlines, 10px corners).
const THEME_CSS = `
  .node rect, .node polygon, .node circle, .node path, rect.actor, .cluster rect { stroke-width: 1.5px; }
  .node rect, .cluster rect, rect.actor, rect.note, .labelBox { rx: 8px; ry: 8px; }
  .edgePath .path, .flowchart-link, .messageLine0, .messageLine1, .loopLine, .actor-line { stroke-width: 1.5px; }
  .edgeLabel, .edgeLabel rect { opacity: 1; }
  .actor-line { stroke-dasharray: 3 4; }
  text, .nodeLabel, .label { font-family: ${FONT}; }
`;

function config(mode: keyof typeof THEMES) {
  return {
    startOnLoad: false,
    theme: "base",
    securityLevel: "strict",
    htmlLabels: false,
    deterministicIds: true,
    themeVariables: THEMES[mode],
    themeCSS: THEME_CSS,
    flowchart: {
      htmlLabels: false,
      useMaxWidth: false,
      curve: "basis",
      padding: 14,
      nodeSpacing: 44,
      rankSpacing: 48,
    },
    sequence: {
      mirrorActors: false,
      actorMargin: 36,
      boxMargin: 8,
      noteMargin: 12,
      messageMargin: 38,
      // Long messages wrap inside the actor spacing instead of stretching
      // the diagram to 2,000px (which scaled labels down to 4px).
      wrap: true,
      width: 136,
      actorFontSize: 13,
      messageFontSize: 13,
      noteFontSize: 12,
      useMaxWidth: false,
    },
    state: { padding: 12, useMaxWidth: false },
  };
}

/**
 * Give the SVG its natural pixel size (from the viewBox) instead of
 * width="100%": styles/diagrams.css shows it at that size, so every label is
 * the same 13px whatever the diagram's width, and wide diagrams scroll
 * sideways rather than shrinking.
 */
export function sizeSvg(svg: string): string {
  svg = svg.replace(/^(<svg\b[^>]*?)\swidth="\d+" height="\d+"/, "$1");
  const vb = svg.match(/viewBox="([^"]+)"/);
  if (!vb) return svg;
  const [, , w, h] = vb[1]!
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!w || !h) return svg;
  // Up to about 870px the figure is fitted to the 688px column (labels stay
  // at 10.3px or more); wider ones are drawn at 12px and scroll sideways.
  const k = w <= 870 ? Math.min(1, 688 / w) : 12 / 13;
  return svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\swidth="[^"]*"/, "")
      .replace(/\sheight="[^"]*"/, "")
      .replace(/\sstyle="max-width:[^"]*"/, "")
      .replace(
        /^<svg/,
        `<svg width="${Math.ceil(w * k)}" height="${Math.ceil(h * k)}"`,
      ),
  );
}

/** Every mermaid source in the docs, by hash, with one file that uses it. */
export function collectSources(): Map<
  string,
  { source: string; file: string }
> {
  const out = new Map<string, { source: string; file: string }>();
  for (const abs of listContentPages(docsRoot)) {
    const text = readFileSync(abs, "utf8");
    if (!text.includes("```mermaid")) continue;
    const { tree } = mdxCodec.parse(text, { path: abs });
    const walk = (n: AstNode) => {
      if (n.type === "code" && (n as { lang?: string }).lang === "mermaid") {
        const source = String(n.value ?? "");
        const h = mermaidHash(source);
        if (!out.has(h))
          out.set(h, { source, file: path.relative(docsRoot, abs) });
      }
      for (const k of n.children ?? []) walk(k);
    };
    walk(tree);
  }
  return out;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");
  const force = args.has("--force");
  const sources = collectSources();
  mkdirSync(outDir, { recursive: true });
  const want = new Set<string>();
  for (const h of sources.keys()) want.add(`${h}-light.svg`).add(`${h}.svg`);
  const have = new Set(readdirSync(outDir).filter((f) => f.endsWith(".svg")));
  const missing = [...sources.keys()].filter(
    (h) => force || !have.has(`${h}-light.svg`) || !have.has(`${h}.svg`),
  );
  const orphans = [...have].filter((f) => !want.has(f));
  if (check) {
    for (const h of missing)
      console.log(
        `missing: mermaid/${h}{-light,}.svg (${sources.get(h)!.file})`,
      );
    for (const f of orphans) console.log(`orphan: mermaid/${f}`);
    console.log(
      `render-mermaid --check: ${sources.size} diagrams, ${missing.length} missing, ${orphans.length} orphaned`,
    );
    process.exit(missing.length || orphans.length ? 1 : 0);
  }
  for (const f of orphans) rmSync(path.join(outDir, f));
  if (missing.length) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const face = (w: string, f: string) =>
      `@font-face{font-family:"Diatype";font-weight:${w};src:url("file://${path.join(fonts, f)}") format("woff2")}`;
    await page.setContent(
      `<!doctype html><html><head><style>${face("400", "ABCDiatype-Regular.woff2")}${face("500 700", "ABCDiatype-Medium.woff2")}body{font-family:${FONT}}</style></head><body><div id="probe">Diatype <b>Diatype</b></div></body></html>`,
    );
    await page.addScriptTag({ path: mermaidJs });
    await page.evaluate(() => document.fonts.ready);
    let failed = 0;
    for (const h of missing) {
      const { source, file } = sources.get(h)!;
      for (const mode of ["light", "dark"] as const) {
        let res: { svg?: string; error?: string } = await page.evaluate(
          async ({ id, src, cfg }) => {
            const m = (
              window as unknown as {
                mermaid: {
                  initialize(c: unknown): void;
                  render(id: string, s: string): Promise<{ svg: string }>;
                };
              }
            ).mermaid;
            try {
              m.initialize(cfg);
              return { svg: (await m.render(id, src)).svg };
            } catch (e) {
              document
                .querySelectorAll(`#d${id}, #${id}`)
                .forEach((n) => n.remove());
              return { error: String((e as Error)?.message ?? e) };
            }
          },
          { id: `m${h}`, src: source, cfg: config(mode) },
        );
        // Mermaid's wrap mode fails on a few sources (notes with <br>);
        // draw those unwrapped.
        if ("error" in res) {
          const cfg = config(mode);
          res = await page.evaluate(
            async ({ id, src, cfg }) => {
              const m = (
                window as unknown as {
                  mermaid: {
                    initialize(c: unknown): void;
                    render(id: string, s: string): Promise<{ svg: string }>;
                  };
                }
              ).mermaid;
              try {
                m.initialize(cfg);
                return { svg: (await m.render(id, src)).svg };
              } catch (e) {
                document
                  .querySelectorAll(`#d${id}, #${id}`)
                  .forEach((n) => n.remove());
                return { error: String((e as Error)?.message ?? e) };
              }
            },
            {
              id: `m${h}`,
              src: source,
              cfg: { ...cfg, sequence: { ...cfg.sequence, wrap: false } },
            },
          );
        }
        if ("error" in res) {
          failed++;
          console.log(
            `error: ${file} (${h}, ${mode}): ${res.error!.split("\n")[0]}`,
          );
          break;
        }
        const name = mode === "light" ? `${h}-light.svg` : `${h}.svg`;
        writeFileSync(
          path.join(outDir, name),
          `${sizeSvg(res.svg!.replace(/<br>/g, "<br/>"))}\n`,
        );
      }
    }
    await browser.close();
    console.log(
      `render-mermaid: ${missing.length - failed} rendered, ${failed} failed, ${orphans.length} orphan(s) removed`,
    );
    if (failed) process.exitCode = 1;
  } else {
    console.log(
      `render-mermaid: ${sources.size} diagrams up to date, ${orphans.length} orphan(s) removed`,
    );
  }
}

if (existsSync(docsRoot)) await main();
