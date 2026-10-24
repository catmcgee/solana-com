#!/usr/bin/env node
/* global console */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadProject } from "./projects.mjs";

// Docs Lingo project (projects.mjs): config, lock keys and paths are relative
// to apps/docs; translated pages live under apps/docs/<locale>/.
const docs = loadProject("docs");
const contentDir = docs.rootDir;
const lockPath = docs.lockPath;
const lock = docs.lock;
const targetLocalePattern = new RegExp(
  `^(${docs.config.targetLocales.join("|")})/(?:docs|learn|developers/bootcamp)/`,
);

let changedFiles = 0;
let removedBackticks = 0;
let changedLockEntries = 0;

function isTranslatedDocsFile(filePath) {
  return targetLocalePattern.test(
    path.relative(contentDir, filePath).replaceAll(path.sep, "/"),
  );
}

function sanitizeFile(filePath) {
  if (!isTranslatedDocsFile(filePath)) return;

  const source = fs.readFileSync(filePath, "utf8");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  if (lines[0] !== "---") return;

  const closingDelimiter = lines.indexOf("---", 1);
  if (closingDelimiter === -1) return;

  let changed = false;

  for (let index = 1; index < closingDelimiter; index++) {
    if (!lines[index].includes("`")) continue;

    const count = lines[index].match(/`/g)?.length ?? 0;
    lines[index] = lines[index].replaceAll("`", "");
    removedBackticks += count;
    changed = true;
  }

  if (!changed) return;

  const sanitized = lines.join(newline);
  fs.writeFileSync(filePath, sanitized);
  changedFiles++;

  const relativePath = path
    .relative(contentDir, filePath)
    .replaceAll(path.sep, "/");
  const lockEntry = lock?.files?.[relativePath];
  if (!lockEntry) return;

  lockEntry.sha256 = crypto
    .createHash("sha256")
    .update(sanitized)
    .digest("hex");
  changedLockEntries++;
}

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      visit(filePath);
      continue;
    }

    if (entry.isFile() && path.extname(entry.name) === ".mdx") {
      sanitizeFile(filePath);
    }
  }
}

for (const locale of docs.config.targetLocales) {
  const localeDir = path.join(contentDir, locale);
  if (fs.existsSync(localeDir)) visit(localeDir);
}

if (changedLockEntries > 0) {
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

if (changedFiles === 0) {
  console.log("No translated docs frontmatter needed normalization");
} else {
  console.log(
    `Normalized translated docs frontmatter in ${changedFiles} file(s) (${removedBackticks} backtick(s) removed, ${changedLockEntries} lock entr${changedLockEntries === 1 ? "y" : "ies"} refreshed).`,
  );
}
