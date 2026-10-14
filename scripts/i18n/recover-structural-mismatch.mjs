import fs from "node:fs";
import path from "node:path";

export function failedStructuralTargets(output, config, rootDir) {
  // Lingo colors the final error on interactive and CI runners.
  const ansiColor = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  const plainOutput = output
    .replace(ansiColor, "")
    .replace(/\^\[\[[0-9;]*m/g, "");
  const summary = plainOutput.match(
    /(?:^|\n)\s*(\d+) target\(s\) failed:\s*\n/,
  );
  const finalError = plainOutput.match(
    /Error: (\d+) target\(s\) failed during run /,
  );

  if (!summary || !finalError || summary[1] !== finalError[1]) {
    return [];
  }

  const failureLines = plainOutput
    .slice(summary.index + summary[0].length)
    .split("\n")
    .filter((line) => /^\s+\S+\.mdx: /.test(line));

  if (failureLines.length !== Number(summary[1])) {
    return [];
  }

  // Paths are relative to the Lingo project root. The docs project
  // (apps/docs, projects.mjs) maps docs/X.mdx -> <locale>/docs/X.mdx; the
  // legacy layout swapped an /en/ segment.
  const targets = [];
  for (const line of failureLines) {
    const match = line.match(
      /^\s+([a-zA-Z0-9/_.-]+\.mdx): Failed to plan ([a-zA-Z0-9/_.-]+\.mdx): Cannot safely update .* because the source and target document structures are not aligned \(unit .*\)\. Force a full retranslation of this file to reset it\.$/,
    );
    if (!match) return [];

    const [, target, source] = match;
    const locale = config.targetLocales.find(
      (l) =>
        target === `${l}/${source}` ||
        (source.includes("/en/") &&
          target === source.replace("/en/", `/${l}/`)),
    );
    if (
      !locale ||
      target.includes("..") ||
      source.includes("..") ||
      !fs.existsSync(path.join(rootDir, target)) ||
      !fs.existsSync(path.join(rootDir, source))
    ) {
      return [];
    }
    targets.push(target);
  }

  return [...new Set(targets)];
}

export function removeFailedTargets(targets, rootDir) {
  for (const target of targets) {
    fs.unlinkSync(path.join(rootDir, target));
  }
}
