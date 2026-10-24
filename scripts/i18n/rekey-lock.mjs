#!/usr/bin/env node
/* global console */
/**
 * One-time: move the docs entries of `.lingo/lock.json` to the docs Lingo
 * project (`apps/docs/.lingo/lock.json`) and re-key them to the apps/docs
 * layout (see projects.mjs and packages/docs-tooling/src/move/rules.ts):
 *
 *   apps/docs/content/docs/en/X               -> docs/X
 *   apps/docs/content/docs/<loc>/X            -> <loc>/docs/X
 *   apps/docs/content/learn/<en|loc>/X        -> learn/X | <loc>/learn/X
 *   apps/docs/content/developers-learn/<..>/X -> developers/bootcamp/X | <loc>/developers/bootcamp/X
 *
 * Dropped: Greek (decisions.md), meta.json (navigation now comes from
 * apps/docs/navigation; labels are a new Lingo bucket), and entries whose
 * file no longer exists (R8 stale locale files removed by the move).
 *
 * The move was a pure `git mv`, so the recorded sha256 values stay valid.
 * `--rehash` refreshes the docs lock hashes from the files on disk; run it
 * once after the convert codemod rewrites the locale files (otherwise every
 * converted target reads as "diverged from Lingo lock").
 *
 * `--source-changed <file>` (with or without `--rehash`): for each English
 * page listed in <file> (one `apps/docs/...` or docs-project path per line,
 * `#` comments allowed), the lock keeps the hash of that page at
 * `--ref <git ref>` (default HEAD, the pre-conversion content), so pages whose
 * English text really changed during the migration still read as changed
 * and get retranslated by the next Lingo run.
 * `packages/docs-tooling/data/lingo-source-changed.txt` is that list.
 *
 * Idempotent: a second run finds no `apps/docs/content/` keys and only
 * reports (or rehashes).
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { repoRoot } from "./projects.mjs";

const DROPPED_LOCALES = new Set(["el"]);
const COLLECTIONS = {
  docs: "docs",
  learn: "learn",
  "developers-learn": "developers/bootcamp",
};

/** Legacy lock key -> docs-project key, or { drop: reason }. */
export function rekey(oldKey) {
  const m =
    /^apps\/docs\/content\/(docs|learn|developers-learn)\/([^/]+)\/(.+)$/.exec(
      oldKey,
    );
  if (!m) return { drop: "not-a-docs-content-key" };
  const [, coll, loc, rel] = m;
  if (DROPPED_LOCALES.has(loc)) return { drop: "dropped-locale" };
  if (rel.endsWith("meta.json")) return { drop: "meta-json" };
  const base = COLLECTIONS[coll];
  return { key: loc === "en" ? `${base}/${rel}` : `${loc}/${base}/${rel}` };
}

const sha = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const sortFiles = (files) =>
  Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );

export function rekeyLocks({
  root = repoRoot,
  rehash = false,
  dryRun = false,
  sourceChanged = [],
  ref = "HEAD",
} = {}) {
  const uiLockPath = path.join(root, ".lingo/lock.json");
  const docsRoot = path.join(root, "apps/docs");
  const docsLockPath = path.join(docsRoot, ".lingo/lock.json");
  const uiLock = JSON.parse(fs.readFileSync(uiLockPath, "utf8"));
  const docsLock = fs.existsSync(docsLockPath)
    ? JSON.parse(fs.readFileSync(docsLockPath, "utf8"))
    : { version: 1, files: {} };

  const stats = {
    moved: 0,
    hashMismatch: 0,
    rehashed: 0,
    keptChanged: 0,
    dropped: {},
  };
  const keepUi = {};
  for (const [key, entry] of Object.entries(uiLock.files)) {
    if (!key.startsWith("apps/docs/")) {
      keepUi[key] = entry;
      continue;
    }
    const r = rekey(key);
    if (r.drop) {
      stats.dropped[r.drop] = (stats.dropped[r.drop] ?? 0) + 1;
      continue;
    }
    const file = path.join(docsRoot, r.key);
    if (!fs.existsSync(file)) {
      stats.dropped["file-gone"] = (stats.dropped["file-gone"] ?? 0) + 1;
      continue;
    }
    if (sha(file) !== entry.sha256) stats.hashMismatch++;
    docsLock.files[r.key] = entry;
    stats.moved++;
  }
  if (rehash) {
    for (const [key, entry] of Object.entries(docsLock.files)) {
      const file = path.join(docsRoot, key);
      if (!fs.existsSync(file)) {
        delete docsLock.files[key];
        continue;
      }
      const h = sha(file);
      if (h !== entry.sha256) {
        docsLock.files[key] = { ...entry, sha256: h };
        stats.rehashed++;
      }
    }
  }
  for (const listed of sourceChanged) {
    const key = listed.replace(/^apps\/docs\//, "");
    const entry = docsLock.files[key];
    if (!entry) continue;
    let before;
    try {
      before = execFileSync("git", ["show", `${ref}:apps/docs/${key}`], {
        cwd: root,
        maxBuffer: 1 << 26,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      continue; // not in `ref`: a new page, nothing to keep
    }
    const h = crypto.createHash("sha256").update(before).digest("hex");
    if (h !== entry.sha256) docsLock.files[key] = { ...entry, sha256: h };
    stats.keptChanged++;
  }
  if (!dryRun) {
    fs.writeFileSync(
      uiLockPath,
      `${JSON.stringify({ ...uiLock, files: sortFiles(keepUi) }, null, 2)}\n`,
    );
    fs.mkdirSync(path.dirname(docsLockPath), { recursive: true });
    fs.writeFileSync(
      docsLockPath,
      `${JSON.stringify({ version: docsLock.version ?? 1, files: sortFiles(docsLock.files) }, null, 2)}\n`,
    );
  }
  return {
    ...stats,
    uiEntries: Object.keys(keepUi).length,
    docsEntries: Object.keys(docsLock.files).length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argAfter = (flag) => {
    const i = process.argv.indexOf(flag);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const listFile = argAfter("--source-changed");
  const sourceChanged = listFile
    ? fs
        .readFileSync(path.resolve(listFile), "utf8")
        .split("\n")
        .map((l) => l.replace(/#.*/, "").trim())
        .filter(Boolean)
    : [];
  const r = rekeyLocks({
    rehash: process.argv.includes("--rehash"),
    dryRun: process.argv.includes("--dry-run"),
    sourceChanged,
    ref: argAfter("--ref") ?? "HEAD",
  });
  console.log(
    `Lingo lock re-key: moved ${r.moved} docs entries (${r.hashMismatch} already differ from the file on disk), rehashed ${r.rehashed}, kept ${r.keptChanged} changed English sources; dropped ${JSON.stringify(r.dropped)}; ui lock ${r.uiEntries} entries, docs lock ${r.docsEntries} entries.`,
  );
}
