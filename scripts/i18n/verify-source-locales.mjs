import path from "node:path";
import process from "node:process";
import { loadProjects, repoRoot } from "./projects.mjs";

// Locales the docs never target (decisions.md: Mintlify has no Greek). The UI
// bundles keep translating them.
const DOCS_DROPPED_LOCALES = ["el"];

let hasError = false;
const projects = loadProjects();

for (const { name, configPath, config } of projects) {
  const shown = path.relative(repoRoot, configPath);
  const { sourceLocale, targetLocales } = config;

  if (!sourceLocale || !Array.isArray(targetLocales)) {
    console.error(`${shown}: missing sourceLocale or targetLocales`);
    hasError = true;
    continue;
  }

  if (targetLocales.includes(sourceLocale)) {
    console.error(
      `${shown}: source locale "${sourceLocale}" must not be listed in targetLocales`,
    );
    hasError = true;
  }

  if (name === "docs") {
    for (const locale of DOCS_DROPPED_LOCALES) {
      if (targetLocales.includes(locale)) {
        console.error(
          `${shown}: "${locale}" is dropped from the docs (decisions.md) and must not be a target`,
        );
        hasError = true;
      }
    }
  }
}

const [ui, docs] = projects;
if (ui && docs) {
  if (ui.config.sourceLocale !== docs.config.sourceLocale) {
    console.error("The ui and docs Lingo projects must share a source locale");
    hasError = true;
  }
  const extra = docs.config.targetLocales.filter(
    (l) => !ui.config.targetLocales.includes(l),
  );
  if (extra.length) {
    console.error(
      `Docs target locales missing from the UI project: ${extra.join(", ")}`,
    );
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
}

console.log("i18n source locale guard passed");
