import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadProjects, repoRoot } from "./projects.mjs";

// English sources each Lingo project must cover (project-relative globs).
// Docs: the apps/docs layout (apps/docs/{docs,learn,developers/bootcamp}) and
// the navigation label bucket. The cookbook (developers/cookbook) is
// English-only by design and has no Lingo bucket.
const expectedSourcePatterns = {
  ui: ["packages/i18n/messages/*/en/*.json"],
  docs: [
    "docs/**/*.mdx",
    "learn/**/*.mdx",
    "developers/bootcamp/**/*.mdx",
    "navigation/labels/en.json",
  ],
};

let failed = false;
const summary = [];

for (const project of loadProjects()) {
  const glob = (pattern) => fs.globSync(pattern, { cwd: project.rootDir });
  const excludedSources = new Set(
    project.config.files.flatMap((fileGroup) =>
      (fileGroup.exclude ?? []).flatMap(glob),
    ),
  );
  const configuredSources = new Set(
    project.config.files
      .flatMap((fileGroup) =>
        (fileGroup.include ?? [fileGroup.pattern]).flatMap(glob),
      )
      .filter((filePath) => !excludedSources.has(filePath)),
  );
  const expectedSources = [
    ...new Set((expectedSourcePatterns[project.name] ?? []).flatMap(glob)),
  ];
  const uncoveredSources = expectedSources.filter(
    (filePath) =>
      !configuredSources.has(filePath) && !excludedSources.has(filePath),
  );

  if (uncoveredSources.length > 0) {
    failed = true;
    console.error(
      `English sources are missing from ${path.relative(repoRoot, project.configPath)}:`,
    );
    for (const filePath of uncoveredSources) {
      console.error(`- ${filePath}`);
    }
  }
  summary.push(
    `${project.name}: ${configuredSources.size} sources, ${excludedSources.size} intentional exclusions`,
  );
}

if (failed) process.exit(1);

console.log(`Lingo config coverage guard passed (${summary.join("; ")}).`);
