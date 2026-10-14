#!/usr/bin/env python3
"""
Integration-only wrapper (WP12) around `docs-tooling convert` for runs made
while the WP8a writers are still editing pages.

A write run must never touch a page someone else is editing. This wrapper
excludes every page under apps/docs that is untracked or differs from HEAD,
UNLESS its current bytes are exactly what a previous run of this wrapper
wrote (recorded in a ledger), plus every page marked `stub: wp8a`.
Generated pages whose body is owned by a generator (the 18 tags pages) are
not excluded.

  python3 scripts/protected-convert.py [--ledger FILE] [convert flags...]

`--check` / `--dry-run` runs exclude nothing (reading is always allowed).
After a write run the ledger records the hash of every page convert wrote.
"""
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
TOOLING = os.path.join(ROOT, "packages", "docs-tooling")
args = sys.argv[1:]
ledger_path = "/tmp/wp12-convert-ledger.json"
if "--ledger" in args:
    i = args.index("--ledger")
    ledger_path = args[i + 1]
    del args[i : i + 2]
in_memory = "--check" in args or "--dry-run" in args


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


ledger = json.load(open(ledger_path)) if os.path.exists(ledger_path) else {}
GENERATED = re.compile(r"^apps/docs/(?:[a-z]{2}/)?docs/tags/index\.mdx$")

status = subprocess.check_output(
    ["git", "status", "--porcelain", "--untracked-files=all", "--", "apps/docs"],
    cwd=ROOT,
    text=True,
)
dirty = []
for line in status.splitlines():
    code, path = line[:2], line[3:]
    if code.strip() == "D" or not re.search(r"\.mdx?$", path):
        continue
    if path.startswith("apps/docs/snippets/") or GENERATED.match(path):
        continue
    dirty.append(path)

excluded = []
if not in_memory:
    for p in dirty:
        abs_p = os.path.join(ROOT, p)
        if ledger.get(p) == sha(abs_p):
            continue  # our own earlier output
        excluded.append(p)
    for dirpath, _, files in os.walk(os.path.join(ROOT, "apps/docs")):
        if "/snippets" in dirpath or "node_modules" in dirpath:
            continue
        for name in files:
            if not re.search(r"\.mdx?$", name):
                continue
            abs_p = os.path.join(dirpath, name)
            with open(abs_p, encoding="utf8") as f:
                head = f.read(4000)
            if re.search(r"^stub:\s*wp8a\s*$", head, re.M):
                rel = os.path.relpath(abs_p, ROOT)
                if rel not in excluded:
                    excluded.append(rel)

excluded.sort()
with open("/tmp/wp12-convert-excluded.txt", "w") as f:
    f.write("\n".join(excluded) + "\n")
print(f"protected-convert: excluding {len(excluded)} writer-owned pages (list: /tmp/wp12-convert-excluded.txt)", flush=True)

before = {}
if not in_memory:
    for dirpath, _, files in os.walk(os.path.join(ROOT, "apps/docs")):
        if "node_modules" in dirpath:
            continue
        for name in files:
            if re.search(r"\.mdx?$", name):
                abs_p = os.path.join(dirpath, name)
                before[os.path.relpath(abs_p, ROOT)] = sha(abs_p)

cmd = ["npx", "tsx", "src/cli.ts", "convert", *args]
if excluded:
    cmd += ["--exclude", ",".join(e[len("apps/docs/"):] for e in excluded)]
rc = subprocess.call(cmd, cwd=TOOLING)

if not in_memory:
    wrote = 0
    for rel, h in before.items():
        abs_p = os.path.join(ROOT, rel)
        if rel in excluded or not os.path.exists(abs_p):
            continue
        now = sha(abs_p)
        if now != h or rel in ledger:
            ledger[rel] = now
            wrote += now != h
    json.dump(ledger, open(ledger_path, "w"), indent=0, sort_keys=True)
    print(f"protected-convert: {wrote} pages written this run; ledger {len(ledger)} entries ({ledger_path})")
sys.exit(rc)
