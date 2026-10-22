#!/usr/bin/env node
/**
 * WP11 theme check: a Playwright visual and assertion pass over the docs
 * theme (apps/docs/styles/theme.css, rendered by apps/web).
 *
 * Moved here from migration/wp11-theme-check.mjs at integration (WP12).
 * Run it after theme changes and against the deployed site.
 *
 * Usage:
 *   pnpm --filter @workspace/docs-tooling theme-check --base http://localhost:3000 [--paths /developers/docs,/ar/developers/docs] [--out dir]
 *   BASE=https://<preview>.vercel.app pnpm --filter @workspace/docs-tooling theme-check
 *
 * For each path x {light, dark} x {JS on, JS off} x {desktop, mobile} it:
 *   - saves a screenshot to --out (default ./theme-shots)
 *   - asserts that the top bar, tab row and page share one colour per mode
 *     (white / #0a0a0b), with no GitHub button in the top bar
 *   - with JS, asserts the floating "Ask AI" pill (ask-ai.js) is bottom-right
 *   - on path pages, asserts the sidebar path box (numbered, ★ on step 2)
 *   - asserts every mermaid fence has its pre-rendered figure (.sol-mermaid)
 *   - asserts that the 4th tab is "Markets" with a divider pseudo-element
 *   - asserts that an external (http) tab sits at the far end of the tab row
 *   - on desktop (1440px), asserts the one-row header: #navbar is 4rem tall,
 *     the tabs and the search share that row, the active-tab underline sits
 *     on the bar's bottom edge, and the sidebar and TOC start below the bar
 *   - asserts that body links are purple and pass 4.5:1 contrast against the page
 *   - asserts that ABC Diatype and ABC Favorit Mono are the computed families
 *   - for /ar/ paths, asserts that #content-area is rtl and code blocks are ltr
 *   - with JS off, asserts that no code block is clipped (expandable blocks
 *     are un-collapsed by styles/nojs.css) and no inert "See all" button shows
 * It exits 1 if any assertion fails. Without JS the theme class is not
 * set from the stored choice, so the theme is checked only with JS.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  ({ chromium } = require("playwright"));
}

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, all) =>
        a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc,
      [],
    ),
);
const BASE = (args.base || process.env.BASE || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const PATHS = (
  args.paths ||
  process.env.PATHS ||
  "/developers/docs,/developers/docs/payments,/developers/docs/payments/checkout/browser,/developers/docs/payments/agentic-payments/x402,/ar/developers/docs"
).split(",");
const OUT = args.out || "theme-shots";
mkdirSync(OUT, { recursive: true });

const PAGE = { light: "rgb(255, 255, 255)", dark: "rgb(10, 10, 11)" };

function lum([r, g, b]) {
  const c = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

const failures = [];
const fail = (ctx, msg) => failures.push(`${ctx}: ${msg}`);

const browser = await chromium.launch();
for (const path of PATHS) {
  for (const scheme of ["light", "dark"]) {
    for (const js of [true, false]) {
      for (const [vpName, viewport] of [
        ["desktop", { width: 1440, height: 1000 }],
        ["mobile", { width: 390, height: 844 }],
      ]) {
        const ctxName = `${path} ${scheme} js=${js} ${vpName}`;
        const context = await browser.newContext({
          colorScheme: scheme,
          javaScriptEnabled: js,
          viewport,
        });
        const page = await context.newPage();
        const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
        if (!res || res.status() >= 400) {
          fail(ctxName, `HTTP ${res?.status()}`);
          await context.close();
          continue;
        }
        await page.waitForTimeout(500);
        const file = join(
          OUT,
          `${path.replace(/\W+/g, "_")}-${scheme}-${js ? "js" : "nojs"}-${vpName}.png`,
        );
        await page.screenshot({ path: file });

        const r = await page.evaluate(async () => {
          await document.fonts.ready;
          const q = (s) => document.querySelector(s);
          const cs = (e) => (e ? getComputedStyle(e) : null);
          const html = document.documentElement;
          const bar = q("#navbar #navbar-transition");
          const tabs = [...document.querySelectorAll("#navbar .nav-tabs-item")];
          const fourth = tabs[3];
          const ext = tabs.find((t) =>
            /^https?:/.test(t.getAttribute("href") || ""),
          );
          const row = q("#navbar .nav-tabs");
          // Body links only: cards, steppers and path cards (.not-prose)
          // draw their own link styles.
          const link =
            q("#content-area .prose a.link:not(.not-prose a):not(.card)") ||
            q("#content-area .prose a[href]:not(.not-prose a):not(.card)");
          const pageBg = cs(document.body).backgroundColor;
          const pill = q("#sol-ask-ai .sol-ask-pill");
          const pillBox = pill?.getBoundingClientRect();
          // Desktop sidebar or, on phones, the drawer (when open).
          const box = [
            ...document.querySelectorAll("#sidebar-content li, #mobile-nav li"),
          ].find(
            (li) =>
              li.getClientRects().length > 0 &&
              li.querySelector(":scope > button .nav-tag-pill"),
          );
          const star = box?.querySelector(":scope > ul > li:nth-child(2) > a");
          const code = q("#content-area pre");
          return {
            dark: html.classList.contains("dark"),
            barImage: cs(bar)?.backgroundImage || "",
            barBg: cs(bar)?.backgroundColor || "",
            github: !!q('#navbar a[href^="https://github.com/"]'),

            pill: pillBox
              ? {
                  right: Math.round(innerWidth - pillBox.right),
                  bottom: Math.round(innerHeight - pillBox.bottom),
                }
              : null,
            pathBox: box
              ? {
                  border: cs(box).borderTopWidth,
                  star: star ? getComputedStyle(star, "::after").content : "",
                }
              : null,
            mermaidFences: document.querySelectorAll(
              '[data-component-name="mermaid-container"]',
            ).length,
            mermaidFigures:
              document.querySelectorAll(".sol-mermaid img").length,
            // Each .sol-mermaid figure holds a light and a dark drawing;
            // exactly one of them may be visible.
            mermaidVisible: [...document.querySelectorAll(".sol-mermaid")].map(
              (f) =>
                [...f.querySelectorAll("img")].filter(
                  (i) => getComputedStyle(i).display !== "none",
                ).length,
            ),
            tabCount: tabs.length,
            fourthText: fourth?.textContent?.trim() || "",
            fourthAfter: fourth
              ? getComputedStyle(fourth, "::after").content
              : "",
            tabsVisible: !!row && row.getBoundingClientRect().width > 0,
            // Distance from the row's end edge (left in RTL).
            extRight:
              ext && row
                ? Math.round(
                    getComputedStyle(row).direction === "rtl"
                      ? ext.getBoundingClientRect().left -
                          row.getBoundingClientRect().left
                      : row.getBoundingClientRect().right -
                          ext.getBoundingClientRect().right,
                  )
                : null,
            // One-row header (theme.css 5b, >= 1280px).
            header: (() => {
              const nav = q("#navbar")?.getBoundingClientRect();
              const search = q("#search-bar-entry")?.getBoundingClientRect();
              const active = q("#navbar .nav-tabs-item > div.bg-primary");
              const side = q("#sidebar")?.getBoundingClientRect();
              const toc = q("#table-of-contents")?.getBoundingClientRect();
              if (!nav || !row || !search) return null;
              const tabsBox = row.getBoundingClientRect();
              const mid = (b) => b.top + b.height / 2;
              return {
                height: Math.round(nav.height),
                sameRow: Math.abs(mid(tabsBox) - mid(search)) < 8,
                underlineGap: active
                  ? Math.round(
                      nav.bottom - active.getBoundingClientRect().bottom,
                    )
                  : null,
                sidebarTop: side?.width
                  ? Math.round(side.top - nav.bottom)
                  : null,
                tocTop: toc?.width ? Math.round(toc.top - nav.bottom) : null,
              };
            })(),
            linkColor: cs(link)?.color || "",
            pageBg,
            bodyFont: cs(q("#content-area p"))?.fontFamily || "",
            codeFont: cs(code?.querySelector("code") || code)?.fontFamily || "",
            contentDir: cs(q("#content-area"))?.direction || "",
            codeDir: cs(code)?.direction || "",
            // Code blocks whose code runs past the bottom of their box
            // (`expandable` collapses to 190px) and visible "See all" buttons.
            clippedCode: [
              ...document.querySelectorAll(
                '[data-component-part="code-block-root"]',
              ),
            ].filter((el) => {
              const pre = el.querySelector("pre");
              if (!pre || !el.offsetParent) return false;
              return (
                pre.getBoundingClientRect().bottom >
                el.getBoundingClientRect().bottom + 2
              );
            }).length,
            seeAllButtons: [
              ...document.querySelectorAll(
                '[data-component-part="code-block-footer-button"]',
              ),
            ].filter((b) => b.offsetParent).length,
          };
        });

        // Without JS every line of every code block must be readable
        // (nojs.css un-collapses `expandable` blocks).
        if (!js && r.clippedCode)
          fail(ctxName, `${r.clippedCode} code block(s) clipped without JS`);
        if (!js && r.seeAllButtons)
          fail(ctxName, `${r.seeAllButtons} inert "See all" button(s)`);
        if (js && (scheme === "dark") !== r.dark)
          fail(ctxName, `theme class mismatch (dark=${r.dark})`);
        const want = PAGE[r.dark ? "dark" : "light"];
        if (r.barBg !== want)
          fail(ctxName, `top bar ${r.barBg}, expected the page colour ${want}`);
        if (r.pageBg !== want && r.pageBg !== "rgba(0, 0, 0, 0)")
          fail(ctxName, `page ${r.pageBg}, expected ${want}`);
        if (r.github) fail(ctxName, "GitHub button in the top bar");
        if (js && (!r.pill || r.pill.right > 32 || r.pill.bottom > 32))
          fail(
            ctxName,
            `Ask AI pill missing or misplaced: ${JSON.stringify(r.pill)}`,
          );
        if (
          r.pathBox &&
          (r.pathBox.border !== "1px" || /\u2605|★/.test(r.pathBox.star))
        )
          fail(ctxName, `sidebar path box off: ${JSON.stringify(r.pathBox)}`);
        if (r.mermaidFences && r.mermaidFigures < r.mermaidFences)
          fail(ctxName, "mermaid fence without its pre-rendered figure");
        if (r.mermaidVisible.some((n) => n !== 1))
          fail(
            ctxName,
            `mermaid figures must show exactly one drawing: ${JSON.stringify(r.mermaidVisible)}`,
          );
        if (r.tabsVisible) {
          if (
            r.tabCount >= 4 &&
            !/markets|市场|マーケット|mercados|marchés|märkte/i.test(
              r.fourthText,
            ) &&
            path.startsWith("/docs")
          )
            fail(
              ctxName,
              `4th tab is "${r.fourthText}", divider selector is off`,
            );
          if (r.tabCount >= 4 && (!r.fourthAfter || r.fourthAfter === "none"))
            fail(ctxName, "tab divider missing");
          if (r.extRight !== null && r.extRight > 4)
            fail(ctxName, `external tab not at row end (${r.extRight}px)`);
        }
        if (vpName === "desktop" && r.tabsVisible) {
          const h = r.header;
          if (!h) fail(ctxName, "header elements missing");
          else {
            if (h.height !== 64)
              fail(ctxName, `header ${h.height}px tall, expected one 64px row`);
            if (!h.sameRow) fail(ctxName, "tabs and search not on one row");
            if (h.underlineGap === null || Math.abs(h.underlineGap) > 2)
              fail(ctxName, `active tab underline off (${h.underlineGap}px)`);
            if (h.sidebarTop !== null && (h.sidebarTop < 0 || h.sidebarTop > 2))
              fail(ctxName, `sidebar starts ${h.sidebarTop}px from the header`);
            if (h.tocTop !== null && h.tocTop < 0)
              fail(ctxName, `TOC starts under the header (${h.tocTop}px)`);
          }
        }
        if (r.linkColor) {
          const c = contrast(
            rgb(r.linkColor),
            rgb(
              r.pageBg === "rgba(0, 0, 0, 0)"
                ? r.dark
                  ? "rgb(0,0,0)"
                  : "rgb(255,255,255)"
                : r.pageBg,
            ),
          );
          if (c < 4.5)
            fail(
              ctxName,
              `link contrast ${c.toFixed(2)} (${r.linkColor} on ${r.pageBg})`,
            );
          const [lr, lg, lb] = rgb(r.linkColor);
          if (!(lb > lg && lr > lg))
            fail(ctxName, `link not purple: ${r.linkColor}`);
        }
        if (!r.bodyFont.includes("ABC Diatype"))
          fail(ctxName, `body font ${r.bodyFont}`);
        if (r.codeFont && !r.codeFont.includes("ABC Favorit Mono"))
          fail(ctxName, `code font ${r.codeFont}`);
        if (/^\/ar(\/|$)/.test(path)) {
          if (r.contentDir !== "rtl")
            fail(ctxName, `ar content direction ${r.contentDir}`);
          if (r.codeDir && r.codeDir !== "ltr")
            fail(ctxName, `ar code direction ${r.codeDir}`);
        }
        console.log(`checked ${ctxName} -> ${file}`);
        await context.close();
      }
    }
  }
}
await browser.close();

if (failures.length) {
  console.error(
    `\n${failures.length} theme check failure(s):\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log("\ntheme check passed");
