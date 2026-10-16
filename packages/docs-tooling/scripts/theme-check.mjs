#!/usr/bin/env node
/**
 * WP11 theme check: a Playwright visual and assertion pass over the Mintlify
 * docs theme (Luma, apps/docs/styles/theme.css + docs.json branding).
 *
 * Moved here from migration/wp11-theme-check.mjs at integration (WP12).
 * Run it after every Mintlify version bump and against the deployed site.
 *
 * Usage:
 *   pnpm --filter @workspace/docs-tooling theme-check --base http://localhost:3003 [--paths /docs,/ar/docs] [--out dir]
 *   BASE=https://<sub>.mintlify.site pnpm --filter @workspace/docs-tooling theme-check
 *
 * For each path x {light, dark} x {JS on, JS off} x {desktop 1440, narrow
 * 1100, mobile 390} it:
 *   - saves a screenshot to --out (default ./theme-shots)
 *   - asserts that the header and page share one colour per mode
 *     (white / #0a0a0b), with no GitHub button in the header
 *   - with JS, asserts the floating "Ask AI" pill (ask-ai.js) is bottom-right
 *     and Mintlify's floating "Ask a question" bar is hidden
 *   - on path pages, asserts the sidebar path box (numbered, no star)
 *   - asserts every mermaid fence has its pre-rendered figure (.sol-mermaid)
 *   - asserts that the 4th tab is "Markets" with a divider pseudo-element
 *   - on desktop and narrow, asserts Luma's one-row header: #navbar is 48px
 *     tall, the tabs and the search share that row, no tab has an icon, the
 *     logo is not squeezed, and the sidebar starts below the bar
 *   - on desktop with JS, asserts the header does not depend on our CSS: the
 *     logo, every tab, the search and the theme button sit at the same boxes
 *     (within 0.5px) after the custom <style> blocks are removed, so the
 *     first paint (before those blocks arrive) already shows the final header
 *   - asserts that body links are purple and pass 4.5:1 contrast against the page
 *   - asserts that ABC Diatype and ABC Favorit Mono are the computed families
 *   - for /ar/ paths, asserts that #content-area is rtl and code blocks are ltr
 *   - with JS off, asserts that no code block is clipped (expandable blocks
 *     are un-collapsed by styles/nojs.css) and no inert "See all" button shows
 * It exits 1 if any assertion fails. Without JS, Mintlify always ships
 * class="dark", so the "light, JS off" run is expected to render dark. The
 * script checks that, rather than treating it as a failure.
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
  "/docs,/docs/payments,/docs/payments/checkout/browser,/docs/payments/agentic-payments/x402,/ar/docs"
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
        ["narrow", { width: 1100, height: 900 }],
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
          // Luma paints the header colour on an inset layer inside #navbar.
          const bar =
            q("#navbar > .bg-background-light") || q("#navbar > div.z-0");
          const items = [
            ...document.querySelectorAll(
              '#navbar nav[aria-label="Main"] > ul > li',
            ),
          ];
          const tabs = items.map((li) => li.querySelector("a"));
          const fourth = items[3];
          const row = q('#navbar nav[aria-label="Main"]');
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
            // Mintlify's floating "Ask a question" bar must not show: the
            // "Ask AI" pill (ask-ai.js) replaces it. Luma's assistant button
            // in the header stays (hiding it would move the header).
            assistantBar: [
              ...document.querySelectorAll(".chat-assistant-floating-input"),
            ].some((e) => e.getClientRects().length > 0),
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
            tabIcons: tabs.filter((a) => a?.querySelector("svg")).length,
            // Luma's one-row header (theme.css section 4).
            header: (() => {
              const nav = q("#navbar")?.getBoundingClientRect();
              const search = q("#search-bar-entry")?.getBoundingClientRect();
              const logo = q("#navbar img.nav-logo:not(.hidden)");
              const visibleLogo =
                [...document.querySelectorAll("#navbar img.nav-logo")].find(
                  (i) => i.getClientRects().length && i.width > 0,
                ) || logo;
              const side = q("#sidebar-content")?.getBoundingClientRect();
              if (!nav || !row || !search) return null;
              const tabsBox = row.getBoundingClientRect();
              const mid = (b) => b.top + b.height / 2;
              const lb = visibleLogo?.getBoundingClientRect();
              return {
                height: Math.round(nav.height),
                sameRow: Math.abs(mid(tabsBox) - mid(search)) < 8,
                // Rendered width vs the width its height asks for.
                logoSqueeze:
                  visibleLogo && visibleLogo.naturalHeight
                    ? Math.round(
                        (lb.height * visibleLogo.naturalWidth) /
                          visibleLogo.naturalHeight -
                          lb.width,
                      )
                    : null,
                sidebarTop: side?.width
                  ? Math.round(side.top - nav.bottom)
                  : null,
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

        if (!js && !r.dark)
          fail(ctxName, "expected Mintlify's no-JS dark class");
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
        if (r.assistantBar)
          fail(ctxName, "Mintlify assistant entry or bottom bar visible");
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
          if (r.tabIcons)
            fail(
              ctxName,
              `${r.tabIcons} tab(s) with an icon (navigation icon)`,
            );
        }
        if (vpName !== "mobile" && r.tabsVisible) {
          const h = r.header;
          if (!h) fail(ctxName, "header elements missing");
          else {
            if (h.height !== 48)
              fail(ctxName, `header ${h.height}px tall, expected one 48px row`);
            if (!h.sameRow) fail(ctxName, "tabs and search not on one row");
            if (h.logoSqueeze === null || h.logoSqueeze > 1)
              fail(ctxName, `logo squeezed by ${h.logoSqueeze}px`);
            if (h.sidebarTop !== null && (h.sidebarTop < 0 || h.sidebarTop > 2))
              fail(ctxName, `sidebar starts ${h.sidebarTop}px from the header`);
          }
        }
        // The header must not depend on our CSS where Luma's row fits: the
        // same boxes with the custom <style> blocks removed.
        if (vpName === "desktop" && js && r.tabsVisible) {
          const boxes = () =>
            page.evaluate(() =>
              [
                "#navbar",
                "#navbar img.nav-logo",
                "#localization-select-trigger",
                ...[
                  ...document.querySelectorAll(
                    '#navbar nav[aria-label="Main"] > ul > li > a',
                  ),
                ].map(
                  (_, i) =>
                    `#navbar nav[aria-label="Main"] > ul > li:nth-child(${i + 1}) > a`,
                ),
                "#search-bar-entry",
                "#assistant-entry",
                "#theme-preference-menu-trigger",
              ].map((sel) => {
                const e = [...document.querySelectorAll(sel)].find(
                  (x) => x.getClientRects().length,
                );
                const b = e?.getBoundingClientRect();
                return b ? [sel, b.x, b.y, b.width, b.height] : [sel];
              }),
            );
          const withCss = await boxes();
          await page.evaluate(() =>
            document
              .querySelectorAll("style[data-custom-css-index]")
              .forEach((s) => s.remove()),
          );
          await page.waitForTimeout(100);
          const native = await boxes();
          for (const [i, a] of withCss.entries()) {
            const b = native[i];
            if (a.length !== b.length) {
              fail(ctxName, `${a[0]} differs without our CSS (present/absent)`);
              continue;
            }
            const d = Math.max(
              ...a.slice(1).map((v, k) => Math.abs(v - b[k + 1])),
            );
            if (d > 0.5)
              fail(ctxName, `${a[0]} moves ${d.toFixed(1)}px without our CSS`);
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
