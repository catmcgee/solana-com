#!/usr/bin/env node
// Thin launcher so `pnpm exec docs-tooling <command>` works from anywhere in
// the workspace. tsx is used (instead of Node's built-in type stripping)
// because `verify-redirects` imports apps/web/rewrites-redirects.ts, which uses
// extensionless TypeScript imports.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const result = spawnSync(
  process.execPath,
  [tsxCli, path.join(here, "..", "src", "cli.ts"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
