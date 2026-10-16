import fs from "fs";
const B = "https://solana-docs-preview.vercel.app";
const OUT = process.env.HOME + "/.cache/qa-site/";
const pages = fs
  .readFileSync(OUT + "pages.txt", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((p) => "/" + p.replace(/\/index$/, ""));
pages.push(
  "/developers",
  "/developers/bootcamp",
  "/developers/cookbook",
  "/developers/docs",
);
const uniq = [...new Set(pages)];
async function pool(items, n, fn) {
  const res = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        res[k] = await fn(items[k], k);
      }
    }),
  );
  return res;
}
const dec = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
async function get(u, opt = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 30000);
  try {
    return await fetch(u, { redirect: "manual", signal: c.signal, ...opt });
  } catch (e) {
    return { status: 0, err: String(e), headers: new Map() };
  } finally {
    clearTimeout(t);
  }
}
const data = {};
await pool(uniq, 8, async (p) => {
  let r = await get(B + p);
  let hops = 0;
  let url = p;
  while ([301, 302, 307, 308].includes(r.status) && hops < 4) {
    const loc = r.headers.get("location");
    url = new URL(loc, B + url).pathname;
    r = await get(B + url);
    hops++;
  }
  const html = r.status == 200 ? await r.text() : "";
  const title = (html.match(/<title>([^<]*)/) || [])[1] || "";
  const links = [...html.matchAll(/<a\s[^>]*?href="([^"]*)"/g)].map((m) =>
    dec(m[1]),
  );
  const imgs = [...html.matchAll(/<img\s[^>]*?src="([^"]*)"/g)].map((m) =>
    dec(m[1]),
  );
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  data[p] = {
    status: r.status,
    hops,
    final: url,
    title,
    links: [...new Set(links)],
    imgs: [...new Set(imgs)],
    ids: [...new Set(ids)],
    len: html.length,
  };
});
fs.writeFileSync(OUT + "crawl.json", JSON.stringify(data));
const bad = Object.entries(data).filter(
  ([p, d]) => d.status !== 200 || !d.title || /not found|404/i.test(d.title),
);
console.log(uniq.length, "pages; bad:", bad.length);
bad.forEach(([p, d]) => console.log(p, d.status, d.hops, d.title));
