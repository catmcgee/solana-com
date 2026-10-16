import { chromium } from "playwright";
const B = "https://solana-docs-preview.vercel.app";
const O = process.env.HOME + "/.cache/qa-site/shots/";
const P = {
  developers: "/developers",
  start: "/developers/docs",
  payments: "/developers/docs/payments",
  assets: "/developers/docs/assets",
  markets: "/developers/docs/defi",
  core: "/developers/docs/core",
  resources: "/developers/docs/tools",
  api: "/developers/docs/rpc",
  videos: "/developers/docs/video-guides",
  learn: "/learn/what-is-solana",
  tutorial: "/developers/docs/payments/checkout/browser",
  getbalance: "/developers/docs/rpc/http/getbalance",
  bootcamp: "/developers/bootcamp",
  video2026: "/developers/docs/video-guides/2026-developer-bootcamp",
  cookbook: "/developers/cookbook",
  ja: "/ja/developers/docs/core/accounts",
  quickstart: "/developers/docs/quickstart/check-balance",
};
const V = [
  ["1440-light", 1440, 900, "light"],
  ["1440-dark", 1440, 900, "dark"],
  ["390-light", 390, 844, "light"],
];
const br = await chromium.launch();
const out = [];
for (const [vn, w, h, cs] of V) {
  const ctx = await br.newContext({
    viewport: { width: w, height: h },
    colorScheme: cs,
  });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("isDarkMode", t === "dark" ? "true" : "false");
      localStorage.setItem("theme", t);
    } catch {}
  }, cs);
  const pg = await ctx.newPage();
  const errs = [];
  for (const [k, u] of Object.entries(P)) {
    const r = await pg
      .goto(B + u, { waitUntil: "load", timeout: 45000 })
      .catch((e) => null);
    await pg.waitForTimeout(2500);
    const info = await pg.evaluate(() => ({
      dark: document.documentElement.classList.contains("dark"),
      cls: document.documentElement.className.slice(0, 80),
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      title: document.title,
    }));
    await pg.screenshot({ path: `${O}${k}-${vn}.png`, fullPage: false });
    await pg
      .screenshot({ path: `${O}${k}-${vn}-full.png`, fullPage: true })
      .catch(() => {});
    out.push({ k, vn, status: r?.status(), ...info });
  }
  await ctx.close();
}
await br.close();
for (const o of out) console.log(JSON.stringify(o));
