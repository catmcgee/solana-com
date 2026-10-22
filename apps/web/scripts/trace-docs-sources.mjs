/**
 * Adds the translated docs sources to the trace files of the routes that
 * read them at request time. Next applies outputFileTracingIncludes only to
 * routes it does not treat as prerendered, so the docs page (English is
 * prerendered) shipped without them and every translated page failed with
 * ENOENT on Vercel. Runs after `next build`, before Vercel packages the
 * functions from the .nft.json files.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "node:fs/promises";
import {
  DOCS_SOURCE_GLOBS,
  DOCS_SOURCE_ROUTES,
} from "../docs-trace-includes.mjs";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(webDir, ".next/server/app");

const sources = [];
for (const pattern of DOCS_SOURCE_GLOBS) {
  for await (const file of glob(pattern, { cwd: webDir })) {
    sources.push(path.join(webDir, file));
  }
}
if (sources.length === 0)
  throw new Error("trace-docs-sources: no docs sources found");

let patched = 0;
for (const route of DOCS_SOURCE_ROUTES) {
  for (const kind of ["page", "route"]) {
    const traceFile = path.join(appDir, `${route}/${kind}.js.nft.json`);
    if (!existsSync(traceFile)) continue;
    const trace = JSON.parse(readFileSync(traceFile, "utf8"));
    const dir = path.dirname(traceFile);
    const files = new Set(trace.files);
    for (const source of sources)
      files.add(path.relative(dir, source).split(path.sep).join("/"));
    trace.files = [...files];
    writeFileSync(traceFile, JSON.stringify(trace));
    patched++;
  }
}
console.log(
  `trace-docs-sources: ${sources.length} sources added to ${patched} routes`,
);
