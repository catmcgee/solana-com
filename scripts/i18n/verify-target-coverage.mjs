/* global console */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  getTargetPath,
  isPatternInScope,
  loadProject,
  projectsForScope,
  repoRoot,
  sourceFilesByGroup,
} from "./projects.mjs";

const requestedScope = process.argv[2] ?? "all";
const missingOnly = process.argv.includes("--missing-only");
const staleSourcesOnly = process.argv.includes("--stale-json-sources");

// Each project (projects.mjs) is checked against its own config, lockfile and
// root. Paths below are project-relative; reports prefix the project root.
const projects = projectsForScope(requestedScope).map((name) =>
  loadProject(name),
);

const sources = [];
for (const project of projects) {
  const groups = project.config.files.filter((fileGroup) =>
    (fileGroup.include ?? [fileGroup.pattern]).some((pattern) =>
      isPatternInScope(project.name, pattern, requestedScope),
    ),
  );
  for (const s of sourceFilesByGroup(project, groups)) {
    sources.push({ project, ...s });
  }
}

if (sources.length === 0 && !staleSourcesOnly) {
  console.error(`No Lingo source files match the "${requestedScope}" scope.`);
  process.exit(1);
}

const targetOf = ({ project, fileGroup, sourcePath }, targetLocale) =>
  getTargetPath(
    fileGroup,
    sourcePath,
    targetLocale,
    project.config.sourceLocale,
  );
const shown = (project, p) =>
  path.relative(repoRoot, path.join(project.rootDir, p));

const missingTargets = sources.flatMap((s) =>
  s.project.config.targetLocales
    .map((targetLocale) => targetOf(s, targetLocale))
    .filter((t) => !fs.existsSync(path.join(s.project.rootDir, t)))
    .map((t) => shown(s.project, t)),
);
const targetCount = sources.reduce(
  (n, s) => n + s.project.config.targetLocales.length,
  0,
);

function reportMissingTargets() {
  for (const targetPath of missingTargets.slice(0, 20)) {
    console.error(`- missing file: ${targetPath}`);
  }

  if (missingTargets.length > 20) {
    console.error(`- …and ${missingTargets.length - 20} more missing files`);
  }
}

if (missingOnly) {
  if (missingTargets.length > 0) {
    console.error("Lingo target files are missing.");
    reportMissingTargets();
    process.exit(1);
  }

  console.log(
    `Lingo target file guard passed for the "${requestedScope}" scope (${targetCount} existing targets).`,
  );
  process.exit(0);
}

function getLeafKeys(value, prefix = "") {
  if (value === null || typeof value !== "object") {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    getLeafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

const incompleteJsonTargets = [];
const divergentLockedTargets = [];

for (const s of sources.filter(({ sourcePath }) =>
  sourcePath.endsWith(".json"),
)) {
  const source = JSON.parse(
    fs.readFileSync(path.join(s.project.rootDir, s.sourcePath), "utf8"),
  );
  const sourceKeys = getLeafKeys(source);

  for (const targetLocale of s.project.config.targetLocales) {
    const targetPath = targetOf(s, targetLocale);
    const absoluteTargetPath = path.join(s.project.rootDir, targetPath);

    if (!fs.existsSync(absoluteTargetPath)) {
      continue;
    }

    const target = JSON.parse(fs.readFileSync(absoluteTargetPath, "utf8"));
    const targetKeys = new Set(getLeafKeys(target));
    const missingKeys = sourceKeys.filter((key) => !targetKeys.has(key));

    if (missingKeys.length > 0) {
      incompleteJsonTargets.push({
        project: s.project.name,
        sourcePath: s.sourcePath,
        targetPath: shown(s.project, targetPath),
        missingKeys,
      });
    }
  }
}

// The Lingo server can report a JSON target as cached while the committed
// copy still lacks source keys. Print those sources (per project, relative to
// the project root) so the runner can force a scoped retranslation.
if (staleSourcesOnly) {
  const seen = new Set();
  const staleSources = [];
  for (const { project, sourcePath } of incompleteJsonTargets) {
    const key = `${project}\0${sourcePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    staleSources.push({ project, source: sourcePath });
  }
  console.log(JSON.stringify(staleSources));
  process.exit(0);
}

for (const s of sources) {
  const lock = s.project.lock;
  if (!lock) continue;
  for (const targetLocale of s.project.config.targetLocales) {
    const targetPath = targetOf(s, targetLocale);
    const absoluteTargetPath = path.join(s.project.rootDir, targetPath);
    const lockedHash = lock.files[targetPath]?.sha256;

    if (!lockedHash || !fs.existsSync(absoluteTargetPath)) {
      continue;
    }

    const localHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(absoluteTargetPath))
      .digest("hex");

    if (localHash !== lockedHash) {
      divergentLockedTargets.push(shown(s.project, targetPath));
    }
  }
}

if (
  missingTargets.length > 0 ||
  incompleteJsonTargets.length > 0 ||
  divergentLockedTargets.length > 0
) {
  console.error("Lingo target coverage is incomplete.");
  reportMissingTargets();

  for (const { targetPath, missingKeys } of incompleteJsonTargets.slice(
    0,
    20,
  )) {
    console.error(
      `- incomplete JSON: ${targetPath} (${missingKeys.length} missing keys)`,
    );
  }

  if (incompleteJsonTargets.length > 20) {
    console.error(
      `- …and ${incompleteJsonTargets.length - 20} more incomplete JSON files`,
    );
  }

  for (const targetPath of divergentLockedTargets.slice(0, 20)) {
    console.error(`- diverged from Lingo lock: ${targetPath}`);
  }

  if (divergentLockedTargets.length > 20) {
    console.error(
      `- …and ${divergentLockedTargets.length - 20} more lock divergences`,
    );
  }

  process.exit(1);
}

console.log(
  `Lingo target coverage guard passed for the "${requestedScope}" scope (${sources.length} sources, ${targetCount} existing targets).`,
);
