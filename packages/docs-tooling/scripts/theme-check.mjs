#!/usr/bin/env node
/**
 * WP11 theme check: a Playwright visual and assertion pass over the Mintlify
 * docs theme (apps/docs/styles/theme.css + docs.json branding).
 *
 * Moved here from migration/wp11-theme-check.mjs at integration (WP12).
 * Run it after every Mintlify version bump and against the deployed site.
 *
 * Usage:
 *   pnpm --filter @workspace/docs-tooling theme-check --base http://localhost:3003 [--paths /docs,/ar/docs] [--out dir]
 *   BASE=https://<sub>.mintlify.site pnpm --filter @workspace/docs-tooling theme-check
 *
 * For each path x {light, dark} x {JS on, JS off} x {desktop, mobile} it:
 *   - saves a screenshot to --out (default ./theme-shots)
 *   - asserts that the top bar is dark (#0a0a0b) in both modes
 *   - asserts that the 4th tab is "Markets" with a divider pseudo-element
 *   - asserts that an external (http) tab sits at the far end of the tab row
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
  "/docs,/docs/payments,/ar/docs"
).split(",");
const OUT = args.out || "theme-shots";
mkdirSync(OUT, { recursive: true });

const INK = "rgb(10, 10, 11)";

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
          const link =
            q("#content-area .prose a.link") ||
            q("#content-area .prose a[href]");
          const pageBg = cs(document.body).backgroundColor;
          const code = q("#content-area pre");
          return {
            dark: html.classList.contains("dark"),
            barImage: cs(bar)?.backgroundImage || "",
            tabCount: tabs.length,
            fourthText: fourth?.textContent?.trim() || "",
            fourthAfter: fourth
              ? getComputedStyle(fourth, "::after").content
              : "",
            tabsVisible: !!row && row.getBoundingClientRect().width > 0,
            extRight:
              ext && row
                ? Math.round(
                    row.getBoundingClientRect().right -
                      ext.getBoundingClientRect().right,
                  )
                : null,
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
        if (!r.barImage.includes(INK))
          fail(ctxName, `top bar not ink: ${r.barImage.slice(0, 80)}`);
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
