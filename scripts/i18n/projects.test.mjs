import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getTargetPath, loadProjects, repoRoot } from "./projects.mjs";
import { rekey } from "./rekey-lock.mjs";

const docsGroup = { pattern: "docs/**/*.mdx", targetPath: "[locale]/[path]" };

test("derives target paths like the Lingo CLI", () => {
  assert.equal(
    getTargetPath(docsGroup, "docs/core/accounts/index.mdx", "ja", "en"),
    "ja/docs/core/accounts/index.mdx",
  );
  assert.equal(
    getTargetPath(
      {
        pattern: "x",
        targetPath: "apps/docs/[locale]/[path]",
        sourceRoot: "apps/docs",
      },
      "apps/docs/learn/what-is-solana.mdx",
      "pt",
      "en",
    ),
    "apps/docs/pt/learn/what-is-solana.mdx",
  );
  assert.equal(
    getTargetPath(
      { pattern: "x" },
      "packages/i18n/messages/web/en/common.json",
      "zh",
      "en",
    ),
    "packages/i18n/messages/web/zh/common.json",
  );
  assert.equal(
    getTargetPath({ pattern: "x" }, "navigation/labels/en.json", "ko", "en"),
    "navigation/labels/ko.json",
  );
});

test("re-keys legacy lock entries to the apps/docs layout", () => {
  assert.deepEqual(rekey("apps/docs/content/docs/en/core/fees.mdx"), {
    key: "docs/core/fees.mdx",
  });
  assert.deepEqual(rekey("apps/docs/content/docs/ja/core/fees.mdx"), {
    key: "ja/docs/core/fees.mdx",
  });
  assert.deepEqual(
    rekey("apps/docs/content/developers-learn/fr/foundations/index.mdx"),
    {
      key: "fr/developers/bootcamp/foundations/index.mdx",
    },
  );
  assert.deepEqual(rekey("apps/docs/content/learn/en/what-is-solana.mdx"), {
    key: "learn/what-is-solana.mdx",
  });
  assert.deepEqual(rekey("apps/docs/content/docs/el/index.mdx"), {
    drop: "dropped-locale",
  });
  assert.deepEqual(rekey("apps/docs/content/docs/de/meta.json"), {
    drop: "meta-json",
  });
});

test("committed Lingo projects: docs drops Greek, UI keeps it, lock keys resolve", () => {
  const [ui, docs] = loadProjects();
  assert.ok(ui.config.targetLocales.includes("el"));
  assert.ok(!docs.config.targetLocales.includes("el"));
  assert.ok(
    ui.config.files.every((f) => f.pattern.startsWith("packages/i18n/")),
  );
  assert.ok(Object.keys(ui.lock.files).every((k) => k.startsWith("packages/")));
  const docsKeys = Object.keys(docs.lock.files);
  assert.ok(docsKeys.length > 0);
  assert.ok(
    docsKeys.every((k) => !k.startsWith("apps/") && !k.startsWith("el/")),
  );
  // Every docs lock key names a file in the apps/docs layout (allow files that
  // other work packages delete later, but not a majority).
  const missing = docsKeys.filter(
    (k) => !fs.existsSync(path.join(repoRoot, "apps/docs", k)),
  );
  assert.ok(
    missing.length < docsKeys.length / 100,
    `missing: ${missing.slice(0, 5)}`,
  );
});
