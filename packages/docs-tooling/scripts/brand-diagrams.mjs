#!/usr/bin/env node
/**
 * Brand pass over the hand-drawn and converted diagram SVGs (everything in
 * apps/docs/docs-assets/assets/docs except the mermaid renders, which
 * render-mermaid.ts styles itself).
 *
 *   node packages/docs-tooling/scripts/brand-diagrams.mjs [--check]
 *
 * Run it last, after sync-diagram-themes.mjs. It is idempotent.
 *
 * 1. Colour: one Solana set per mode. Light: purple #7c3aed, teal #0f9e94,
 *    green #0a8f5a, zinc neutrals. Dark: purple #b78aff, teal #19d3c5,
 *    green #14f195. Tailwind sky/blue, emerald, amber, orange and the extra
 *    purples are folded into those.
 * 2. Stroke: 1.5px as drawn in the 688px content column (strokes are scaled
 *    by the figure's own down-scaling factor).
 * 3. Type: the most common label size is brought to about 13px as drawn in
 *    the column. Scaled down by at most 0.7x; scaled up (at most 1.15x)
 *    only in the roomy hub and finance figures, so labels never outgrow
 *    their boxes.
 * 4. Flat: drop shadows are removed (the mockup's figures are flat).
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../apps/docs/docs-assets/assets/docs",
);
const COLUMN = 688;
const TARGET_FONT = 13;
const TARGET_STROKE = 1.5;

const LIGHT = {
  // purples -> one purple
  "#9b4dff": "#7c3aed",
  "#7f5cf0": "#7c3aed",
  "#6d5bd0": "#7c3aed",
  "#a21caf": "#7c3aed",
  "#8b5cf6": "#7c3aed",
  "#9945ff": "#7c3aed",
  "#ede9fe": "#f3edff",
  // blue / sky -> teal
  "#3b82f6": "#0f9e94",
  "#2563eb": "#0f9e94",
  "#0284c7": "#0f9e94",
  "#0369a1": "#0f9e94",
  "#0ea5e9": "#0f9e94",
  "#2f6fe0": "#0f9e94",
  "#0f8b78": "#0f9e94",
  "#eff6ff": "#e6f8f6",
  "#f0f9ff": "#e6f8f6",
  // emerald -> green
  "#059669": "#0a8f5a",
  "#047857": "#0a8f5a",
  "#0bb070": "#0a8f5a",
  "#10b981": "#0a8f5a",
  "#0a7a4c": "#0a8f5a",
  "#ecfdf5": "#e3fbef",
  // amber / yellow -> purple, orange -> green
  "#b45309": "#7c3aed",
  "#b88400": "#7c3aed",
  "#9a7700": "#7c3aed",
  "#d97706": "#7c3aed",
  "#fff7dd": "#f3edff",
  "#fff7d6": "#f3edff",
  "#c45a18": "#0a8f5a",
  "#fff0e6": "#e3fbef",
  // slate -> zinc
  "#172033": "#18181b",
  "#5b6678": "#52525b",
  "#667085": "#71717a",
  "#552222": "#18181b",
};
const DARK = {
  "#a777ff": "#b78aff",
  "#b98bff": "#b78aff",
  "#9b84f5": "#b78aff",
  "#a78bfa": "#b78aff",
  "#8b7cf6": "#b78aff",
  "#c4b5fd": "#b78aff",
  "#9945ff": "#b78aff",
  "#60a5fa": "#19d3c5",
  "#38bdf8": "#19d3c5",
  "#7dd3fc": "#19d3c5",
  "#2dd4bf": "#19d3c5",
  "#0f1a2e": "#0b2422",
  "#102b3b": "#0b2422",
  "#34d399": "#14f195",
  "#6ee7b7": "#14f195",
  "#14372d": "#0b261b",
  "#fbbf24": "#b78aff",
  "#facc15": "#b78aff",
  "#342c16": "#1c1430",
  "#fb923c": "#14f195",
  "#352317": "#0b261b",
  "#fca5a5": "#f2f2f3",
  "#a8b3c2": "#a1a1aa",
  "#a8b3c3": "#a1a1aa",
  "#f8fafc": "#f2f2f3",
  "#64748b": "#8b8b94",
};

function list(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f === "mermaid") continue;
      out.push(...list(p));
    } else if (f.endsWith(".svg")) out.push(p);
  }
  return out;
}

function recolor(svg, map) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${keys.join("|")})(?![0-9a-f])`, "gi");
  return svg.replace(re, (m) => map[m.toLowerCase()]);
}

const num = (n) => String(Math.round(n * 100) / 100);

// Skip embedded font data (base64) when scanning or rewriting.
function splitFonts(svg) {
  const parts = [];
  let last = 0;
  const re = /url\(data:[^)]*\)/g;
  for (let m; (m = re.exec(svg));) {
    parts.push({ text: svg.slice(last, m.index), code: false });
    parts.push({ text: m[0], code: true });
    last = m.index + m[0].length;
  }
  parts.push({ text: svg.slice(last), code: false });
  return parts;
}
const mapText = (svg, fn) =>
  splitFonts(svg)
    .map((p) => (p.code ? p.text : fn(p.text)))
    .join("");

const FONT_RES = [
  /(font-size=")([\d.]+)(")/g,
  /(font-size:\s*)([\d.]+)(px)/g,
  /(font:\s*(?:italic\s+)?(?:\d{3}\s+)?)([\d.]+)(px)/g,
];

// Roomy layouts (hub overviews, finance figures) can take larger labels;
// the tightly packed core diagrams are only ever scaled down.
const ROOMY = /[\\/](diagrams|privacy)[\\/]/;

function brand(svg, dark, file = "") {
  const vb = svg.match(/viewBox="([^"]+)"/);
  const w = vb ? Number(vb[1].trim().split(/[\s,]+/)[2]) : 0;
  if (!w || w < 50) return svg; // icons, sprites
  const scale = Math.min(1, COLUMN / w); // how the figure is drawn

  let out = mapText(svg, (t) => {
    t = recolor(t, dark ? DARK : LIGHT);
    // Highlighter-yellow field marks -> purple tint.
    t = t.replace(
      /rgba\(\s*247\s*,\s*195\s*,\s*36\s*,\s*[\d.]+\s*\)/g,
      dark ? "rgba(153,69,255,0.3)" : "rgba(153,69,255,0.14)",
    );
    // Flat figures: no drop shadows.
    t = t.replace(/\sfilter="url\(#[^)]*\)"/g, "");
    // One stroke width, as drawn. Arrow heads and hairlines (<1) keep theirs.
    const sw = num(TARGET_STROKE / scale);
    t = t.replace(/(stroke-width=")([\d.]+)(")/g, (m, a, v, b) =>
      Number(v) >= 1 && Number(v) <= 4.5 ? a + sw + b : m,
    );
    t = t.replace(/(stroke-width:\s*)([\d.]+)(px)?/g, (m, a, v, px) =>
      Number(v) >= 1 && Number(v) <= 4.5 ? a + sw + (px || "") : m,
    );
    return t;
  });

  // Type scale.
  const sizes = {};
  mapText(out, (t) => {
    for (const re of FONT_RES)
      for (const m of t.matchAll(re)) {
        const v = Number(m[2]);
        sizes[v] = (sizes[v] || 0) + 1;
      }
    return t;
  });
  const mode = Number(
    Object.entries(sizes).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ||
      0,
  );
  // Type is scaled once (the clamp would otherwise compound on re-runs).
  if (mode && !/<svg\b[^>]*data-sol-type/.test(out)) {
    const want = TARGET_FONT / scale;
    const up = ROOMY.test(file) ? 1.15 : 1;
    const f = Math.max(0.7, Math.min(up, want / mode));
    if (Math.abs(f - 1) > 0.03)
      out = mapText(out, (t) => {
        for (const re of FONT_RES)
          t = t.replace(re, (m, a, v, b) => a + num(Number(v) * f) + b);
        return t;
      });
    out = out.replace(/<svg\b/, '<svg data-sol-type="1"');
  }
  return out;
}

const check = process.argv.includes("--check");
let changed = 0;
for (const file of list(root)) {
  if (file.includes(`${path.sep}surfpool${path.sep}`)) continue; // screenshots
  const svg = readFileSync(file, "utf8");
  const dark = !file.endsWith("-light.svg");
  // A dark file without a light sibling is a single-mode drawing; treat it
  // as light (it is shown on both backgrounds).
  const hasLight = (() => {
    try {
      statSync(file.replace(/\.svg$/, "-light.svg"));
      return true;
    } catch {
      return false;
    }
  })();
  const out = brand(svg, dark && hasLight, file);
  if (out !== svg) {
    changed++;
    if (check) console.log(`would restyle: ${path.relative(root, file)}`);
    else writeFileSync(file, out);
  }
}
console.log(
  `brand-diagrams${check ? " --check" : ""}: ${changed} file(s) ${check ? "out of date" : "restyled"}`,
);
if (check && changed) process.exit(1);
