/**
 * The two Lingo.dev projects in this repo.
 *
 * - `ui`   (repo root, `.lingo/config.json`): the next-intl message bundles in
 *   packages/i18n/messages. Targets every UI locale, including Greek.
 * - `docs` (`apps/docs/.lingo/config.json`): the developer docs content.
 *   Greek is not a target (decisions.md: no `el`).
 *
 * Lingo CLI 1.16 has one global `targetLocales` per config, so dropping `el`
 * from the docs only is possible with a second project. The CLI finds its
 * project by walking up from the working directory to the nearest
 * `.lingo/config.json`, so docs runs use `cwd: apps/docs`. Paths inside each
 * config and lockfile are relative to that project's root.
 *
 * The docs sources carry no locale in their path (`docs/core/x.mdx`), so the
 * docs file groups declare `targetPath: "[locale]/[path]"`
 * (`ja/docs/core/x.mdx`), the Lingo setting for locale-less source trees.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, "../..");

export const PROJECT_DIRS = { ui: ".", docs: "apps/docs" };

/** Load one project. `rootDir` is absolute. */
export function loadProject(name, root = repoRoot) {
  const rootDir = path.resolve(root, PROJECT_DIRS[name]);
  const configPath = path.join(rootDir, ".lingo/config.json");
  const lockPath = path.join(rootDir, ".lingo/lock.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const lock = fs.existsSync(lockPath)
    ? JSON.parse(fs.readFileSync(lockPath, "utf8"))
    : null;
  return { name, rootDir, configPath, lockPath, config, lock };
}

export function loadProjects(root = repoRoot) {
  return Object.keys(PROJECT_DIRS).map((name) => loadProject(name, root));
}

/** Projects a run scope touches: all | ui | docs | <app>. */
export function projectsForScope(scope) {
  if (scope === "all") return ["ui", "docs"];
  if (scope === "docs") return ["docs"];
  return ["ui"];
}

/** Does a file-group pattern belong to a scope (within its project)? */
export function isPatternInScope(projectName, pattern, scope) {
  if (scope === "all") return true;
  if (scope === "docs") return projectName === "docs";
  if (projectName !== "ui") return false;
  if (scope === "ui") return pattern.startsWith("packages/i18n/messages/");
  return pattern.startsWith(`packages/i18n/messages/${scope}/`);
}

function stripSourceRoot(sourcePath, sourceRoot) {
  if (!sourceRoot) return sourcePath;
  const root = sourceRoot.replace(/\/+$/, "");
  if (!root) return sourcePath;
  return sourcePath.startsWith(`${root}/`)
    ? sourcePath.slice(root.length + 1)
    : sourcePath;
}

/**
 * Target path of a source file, mirroring Lingo CLI 1.16
 * (deriveTargetPathDetailed): an explicit `targetPath` template wins;
 * otherwise the `/<sourceLocale>/` segment, then a `<sourceLocale>.<ext>`
 * file stem, then the legacy `-<sourceLocale>.` filename suffix.
 */
export function getTargetPath(
  fileGroup,
  sourcePath,
  targetLocale,
  sourceLocale,
) {
  if (fileGroup.targetPath) {
    const rel = stripSourceRoot(sourcePath, fileGroup.sourceRoot);
    return fileGroup.targetPath.replace(/\[(locale|path)\]/g, (_m, t) =>
      t === "locale" ? targetLocale : rel,
    );
  }
  const seg = new RegExp(`(^|/)${sourceLocale}(/)`);
  if (seg.test(sourcePath))
    return sourcePath.replace(seg, `$1${targetLocale}$2`);
  const stem = new RegExp(`(^|/)${sourceLocale}(\\.[^/]+)$`);
  if (stem.test(sourcePath))
    return sourcePath.replace(stem, `$1${targetLocale}$2`);
  const suffix = `-${sourceLocale}.`;
  if (sourcePath.includes(suffix))
    return sourcePath.replace(suffix, `-${targetLocale}.`);
  throw new Error(
    `Cannot map source locale to a target path for ${sourcePath}`,
  );
}

/** Source files of a project (relative to its root), per file group. */
export function sourceFilesByGroup(project, fileGroups = project.config.files) {
  const out = [];
  for (const fileGroup of fileGroups) {
    const excluded = new Set(
      (fileGroup.exclude ?? []).flatMap((p) =>
        fs.globSync(p, { cwd: project.rootDir }),
      ),
    );
    const files = (fileGroup.include ?? [fileGroup.pattern])
      .flatMap((p) => fs.globSync(p, { cwd: project.rootDir }))
      .filter((f) => !excluded.has(f));
    for (const f of new Set(files)) out.push({ fileGroup, sourcePath: f });
  }
  return out;
}
