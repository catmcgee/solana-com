#!/usr/bin/env python3
"""
Crawl every page in packages/docs-tooling/generated/pages.json against a
running docs server (apps/web `next dev` / `next start`, or a Vercel preview) and check
that each answers HTTP 200 and that its HTML carries the page title (H1 /
<title>). WP12 integration check.

  python3 scripts/crawl-docs.py --base http://localhost:3000 [--jobs 8] [--out FILE] [--lang en]
"""
import argparse
import concurrent.futures as cf
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:3000")
ap.add_argument("--jobs", type=int, default=8)
ap.add_argument("--out", default="/tmp/wp12-crawl.json")
ap.add_argument("--lang")
ap.add_argument("--retries", type=int, default=2)
a = ap.parse_args()

pages = json.load(open(os.path.join(ROOT, "packages/docs-tooling/generated/pages.json")))["pages"]
if a.lang:
    pages = [p for p in pages if p["lang"] == a.lang]


def norm(s):
    s = html.unescape(s)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", s).strip().replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')


def check(p):
    url = a.base + p["url"]
    last = None
    for attempt in range(a.retries + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url), timeout=180) as r:
                body = r.read().decode("utf8", "replace")
                status = r.status
                final = r.geturl()
            break
        except urllib.error.HTTPError as e:
            status, body, final = e.code, e.read().decode("utf8", "replace"), url
            break
        except Exception as e:  # timeouts, resets: retry
            last = str(e)
            time.sleep(2)
    else:
        return {"url": p["url"], "ok": False, "status": None, "error": last}
    title = norm(p.get("title") or "")
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", body, re.S)
    t = re.search(r"<title[^>]*>(.*?)</title>", body, re.S)
    h1t = norm(h1.group(1)) if h1 else ""
    tt = norm(t.group(1)) if t else ""
    # Strict: the page itself (no redirect), its title as the H1 or <title>.
    has_title = bool(title) and (title in h1t or tt.startswith(title))
    notfound = "page not found" in tt.lower() or "404" == tt.strip()
    redirected = final.split("#")[0].rstrip("/") != url.rstrip("/")
    ok = status == 200 and has_title and not notfound and not redirected
    return {"url": p["url"], "ok": ok, "status": status, "redirectedTo": final if redirected else None, "title": title, "h1": h1t[:200], "htmlTitle": tt[:200], "notFound": notfound}


t0 = time.time()
results = []
with cf.ThreadPoolExecutor(a.jobs) as ex:
    for i, r in enumerate(ex.map(check, pages), 1):
        results.append(r)
        if not r["ok"]:
            print("FAIL", json.dumps(r, ensure_ascii=False), flush=True)
        if i % 500 == 0:
            print(f"progress {i}/{len(pages)} ({time.time() - t0:.0f}s)", flush=True)
fails = [r for r in results if not r["ok"]]
json.dump({"base": a.base, "total": len(results), "failures": fails, "results": results}, open(a.out, "w"), ensure_ascii=False, indent=1)
print(f"crawl: {len(results)} pages, {len(results) - len(fails)} ok, {len(fails)} failed, {time.time() - t0:.0f}s -> {a.out}", flush=True)
sys.exit(1 if fails else 0)
