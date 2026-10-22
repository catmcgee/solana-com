/**
 * Copies the docs' static files from apps/docs into public/ before `next dev`
 * and `next build` (the content keeps referencing them by these URLs):
 * - apps/docs/docs-assets/** -> public/docs-assets/** (content images,
 *   diagrams, brand files);
 * - apps/docs/fonts/*.woff2  -> public/fonts/ (ABC Diatype, Favorit Mono,
 *   Monument Extended, used by the docs and the /developers landing);
 * - the docs' behaviour scripts -> public/docs-scripts/ (loaded by
 *   components/docs/docs-scripts.tsx until they are React components).
 * The copies are build outputs (.gitignore). Unchanged files are skipped.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.resolve(web, "../docs");
const pub = path.join(web, "public");

const SCRIPTS = [
  "ask-ai.js",
  "rpc-try-it.js",
  "run-examples.js",
  "playground.js",
  "video-chapters.js",
  "agent-banner.js",
];

let copied = 0;
function copy(from, to) {
  const src = statSync(from);
  if (existsSync(to)) {
    const dst = statSync(to);
    if (dst.size === src.size && dst.mtimeMs >= src.mtimeMs) return;
  }
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied++;
}
function copyDir(from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else if (entry.isFile()) copy(a, b);
  }
}

copyDir(path.join(docs, "docs-assets"), path.join(pub, "docs-assets"));
for (const f of readdirSync(path.join(docs, "fonts")))
  if (f.endsWith(".woff2"))
    copy(path.join(docs, "fonts", f), path.join(pub, "fonts", f));
for (const f of SCRIPTS)
  copy(path.join(docs, f), path.join(pub, "docs-scripts", f));
console.log(`[docs-static] ${copied} file(s) copied`);
