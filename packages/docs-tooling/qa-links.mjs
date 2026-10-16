import fs from "fs";
const B = "https://solana-docs-preview.vercel.app";
const OUT = process.env.HOME + "/.cache/qa-site/";
const data = JSON.parse(fs.readFileSync(OUT + "crawl.json"));
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
async function get(u, method = "GET", to = 20000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), to);
  try {
    return await fetch(u, {
      method,
      redirect: "manual",
      signal: c.signal,
      headers: { "user-agent": "Mozilla/5.0 (QA) Chrome/120" },
    });
  } catch (e) {
    return {
      status: 0,
      err: String(e.cause?.code || e.name),
      headers: new Map(),
    };
  } finally {
    clearTimeout(t);
  }
}
const norm = (l) => (l.startsWith(B) ? l.slice(B.length) || "/" : l);
// internal links
const internal = new Map(); // targetPath(no hash) -> sources
const anchors = []; // [src, path, hash]
const ext = new Map();
const imgsInt = new Map(),
  imgsExt = new Map();
for (const [p, d] of Object.entries(data)) {
  for (let l of d.links) {
    l = norm(l);
    if (l.startsWith("#")) {
      if (l.length > 1) anchors.push([p, p, l.slice(1)]);
      continue;
    }
    if (l.startsWith("/")) {
      const u = new URL(l, B);
      const path = u.pathname;
      if (path.startsWith("/mintlify-assets") || path.startsWith("/_next"))
        continue;
      (internal.get(path) || internal.set(path, []).get(path)).push(p);
      if (u.hash.length > 1)
        anchors.push([p, path, decodeURIComponent(u.hash.slice(1))]);
    } else if (/^https?:/.test(l)) {
      const u = l.split("#")[0];
      (ext.get(u) || ext.set(u, []).get(u)).push(p);
    }
  }
  for (let l of d.imgs) {
    l = norm(l);
    if (l.startsWith("data:")) continue;
    const m = l.startsWith("/") ? imgsInt : imgsExt;
    (m.get(l) || m.set(l, []).get(l)).push(p);
  }
}
console.log(
  "internal",
  internal.size,
  "ext",
  ext.size,
  "imgI",
  imgsInt.size,
  "imgE",
  imgsExt.size,
);
const res = { internalBad: [], extBad: [], imgBad: [], anchorBad: [] };
const final = {};
await pool([...internal.keys()], 8, async (path) => {
  let u = path,
    hops = 0,
    r;
  while (true) {
    r = await get(B + u);
    if ([301, 302, 307, 308].includes(r.status) && hops < 5) {
      u = new URL(r.headers.get("location"), B + u).href.replace(B, "");
      if (!u.startsWith("/")) {
        break;
      }
      hops++;
    } else break;
  }
  final[path] = { status: r.status, hops, final: u };
  if (r.status !== 200 || hops > 2)
    res.internalBad.push({
      path,
      status: r.status,
      hops,
      final: u,
      err: r.err,
      src: internal.get(path).slice(0, 3),
      n: internal.get(path).length,
    });
});
await pool([...imgsInt.keys(), ...imgsExt.keys()], 8, async (u) => {
  const full = u.startsWith("/") ? B + u : u;
  let r = await get(full, "GET");
  if (r.status !== 200 && !(r.status >= 300 && r.status < 400))
    res.imgBad.push({
      u,
      status: r.status,
      err: r.err,
      src: (imgsInt.get(u) || imgsExt.get(u)).slice(0, 3),
    });
  try {
    r.body?.cancel();
  } catch {}
});
await pool([...ext.keys()], 8, async (u) => {
  let r = await get(u, "HEAD", 15000);
  if (r.status === 0 || r.status >= 400) {
    r = await get(u, "GET", 20000);
    try {
      r.body?.cancel();
    } catch {}
  }
  if (r.status === 0 || r.status >= 400)
    res.extBad.push({
      u,
      status: r.status,
      err: r.err,
      src: ext.get(u).slice(0, 3),
      n: ext.get(u).length,
    });
});
// anchors
const idc = {};
async function ids(path) {
  if (idc[path]) return idc[path];
  let p = path;
  if (data[p]) return (idc[path] = new Set(data[p].ids));
  let u = p,
    r;
  for (let i = 0; i < 4; i++) {
    r = await get(B + u);
    if ([301, 302, 307, 308].includes(r.status))
      u = new URL(r.headers.get("location"), B + u).pathname;
    else break;
  }
  const t = r.status === 200 ? await r.text() : "";
  return (idc[path] = new Set(
    [...t.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
  ));
}
const seen = new Set();
for (const [src, path, h] of anchors) {
  const k = src + "|" + path + "|" + h;
  if (seen.has(k)) continue;
  seen.add(k);
  const s = await ids(path.replace(/\/$/, "") || "/");
  if (!s.has(h) && !s.has(h.toLowerCase()))
    res.anchorBad.push({ src, path, h });
}
fs.writeFileSync(OUT + "links.json", JSON.stringify(res, null, 1));
for (const k in res) console.log(k, res[k].length);
