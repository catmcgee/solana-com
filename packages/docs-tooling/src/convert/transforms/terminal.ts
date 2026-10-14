/**
 * ```` ```terminal ```` fences -> plain Mintlify code blocks (spec §3.2,
 * "terminal fences").
 *
 * Code Hike's Terminal treated `$ ` lines as commands (the only copied
 * text; a trailing `\` continues a command) and hid everything else behind
 * a "[show output]" button. Static output, readable without JavaScript:
 *
 * - Standalone fence: consecutive command lines become a `bash Terminal`
 *   fence with the `$ ` prompt removed (so Copy yields runnable commands);
 *   consecutive output lines become a following `text Output` fence. Runs
 *   alternate in source order.
 * - A fence inside a tab group (`<CodeTabs>`/`<CodeGroup>` child,
 *   or a `!!` slot) must stay ONE fence, or the group would gain a tab. The
 *   same applies to a fence with its own meta (a title):
 *   meta kept; all commands -> `bash` with the prompts stripped; commands
 *   mixed with output -> `console` (Shiki shell-session highlighting) with
 *   the `$ ` prompts kept, so commands stay distinguishable from output
 *   (the same output fences.ts gives a terminal inside tabs).
 *
 * Owner: this module (WP12 integration decision). fences.ts (order 900)
 * still has a terminal branch, but every corpus terminal fence is
 * converted here first; that branch only serves fences created later.
 * - A standalone fence with only output lines becomes one `text Output`
 *   fence (`text` keeping its meta when grouped or titled).
 */
import type { AstNode, Transform } from "../../types.ts";
import { type Code, isCode, isCodeHikeSlot, isJsx } from "./_wp3.ts";

const GROUPS = new Set([
  "CodeTabs",
  "CodeGroup",
  "RequestExample",
  "ResponseExample",
]);

type Run = { kind: "cmd" | "out"; lines: string[] };

export function splitTerminal(value: string): Run[] {
  const runs: Run[] = [];
  let continuing = false;
  for (const line of value.split("\n")) {
    let kind: Run["kind"];
    let text = line;
    if (line.startsWith("$ ") || line === "$") {
      kind = "cmd";
      text = line.replace(/^\$ ?/, "");
    } else if (continuing) {
      kind = "cmd";
    } else {
      kind = "out";
    }
    continuing = kind === "cmd" && /\\\s*$/.test(line);
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.lines.push(text);
    else runs.push({ kind, lines: [text] });
  }
  // Blank lines between runs belong to neither side.
  for (const r of runs) {
    while (r.lines.length && r.lines[0]!.trim() === "") r.lines.shift();
    while (r.lines.length && r.lines[r.lines.length - 1]!.trim() === "")
      r.lines.pop();
  }
  return runs.filter((r) => r.lines.length);
}

function fence(lang: string, meta: string | null, value: string): Code {
  return { type: "code", lang, meta, value };
}

function convertGrouped(n: Code) {
  const runs = splitTerminal(n.value);
  n.lang = "bash";
  if (runs.length && runs.every((r) => r.kind === "cmd")) {
    n.value = runs.flatMap((r) => r.lines).join("\n");
  } else if (runs.length && runs.every((r) => r.kind === "out")) {
    n.lang = "text";
  } else if (runs.length) {
    n.lang = "console";
  }
}

function convertStandalone(n: Code): AstNode[] {
  const runs = splitTerminal(n.value);
  if (!runs.length) {
    n.lang = "bash";
    return [n];
  }
  return runs.map((r) =>
    r.kind === "cmd"
      ? fence("bash", "Terminal", r.lines.join("\n"))
      : fence("text", "Output", r.lines.join("\n")),
  );
}

export const transform: Transform = {
  name: "terminal",
  order: 88,
  owner: "WP3",
  appliesTo: (source) => /`{3,}terminal\b/.test(source),
  run(tree) {
    const visit = (parent: AstNode) => {
      const kids = parent.children;
      if (!kids) return;
      const grouped = isJsx(parent) && GROUPS.has(String(parent.name));
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i]!;
        if (isCode(c) && c.lang === "terminal") {
          if (grouped || isCodeHikeSlot(c.meta) || c.meta) {
            convertGrouped(c);
          } else {
            const out = convertStandalone(c);
            kids.splice(i, 1, ...out);
            i += out.length - 1;
          }
          continue;
        }
        visit(c);
      }
    };
    visit(tree);
  },
};
