/**
 * WithNotes -> code + a static notes callout (spec §3.1 `notes.ts`, as
 * simplified by decisions.md: "notes -> callouts/footnotes").
 *
 * Code Hike source:
 *
 *   <WithNotes>
 *   ```rust
 *   // !tooltip[/pub mod constants/] constantsMod
 *   pub mod constants;
 *   ```
 *   ### !constantsMod
 *   Body…
 *   </WithNotes>
 *
 * Output (every word readable without JavaScript; no tooltips in code):
 *
 *   ```rust
 *   pub mod constants;
 *   ```
 *
 *   <Note>
 *     **`pub mod constants`**
 *
 *     Body…
 *   </Note>
 *
 * Rules:
 * - Each `### !name` section (up to the next heading of depth <= 3) is a
 *   note. Everything else inside WithNotes is kept in place, in order.
 * - The note title is the token the tooltip regex matches in the code
 *   (searched from the line after the comment to the end of that block);
 *   several tooltips with the same name give a comma-separated title.
 * - Notes whose name no tooltip uses (e.g. translated ids) are paired with
 *   the unused tooltip names in source order. Notes that still have no
 *   tooltip keep their body with no title (Code Hike never displayed them;
 *   the text is still useful prose).
 * - The callout goes right after the last top-level child that carried a
 *   tooltip (usually the fence), else at the end of the kept content.
 * - `!tooltip` comment lines are removed from every fence in the file
 *   (outside WithNotes Code Hike showed only the note id, so nothing is
 *   lost).
 *
 * Must run before fences.ts (which deletes `!tooltip` lines): order 80.
 */
import type { AstNode, ConvertContext, Transform } from "../../types.ts";
import {
  flow,
  isCode,
  isJsx,
  markerHeading,
  replaceJsx,
  stripAnnotations,
  walk,
} from "./_wp3.ts";

const TOOLTIP = new Set(["tooltip"]);

interface Tip {
  name: string;
  token: string;
}

interface NoteSection {
  name: string;
  body: AstNode[];
}

function tokenFor(
  originalLines: string[],
  index: number,
  source: string,
  flags: string,
): string {
  let re: RegExp;
  try {
    re = new RegExp(source, flags.replace("g", ""));
  } catch {
    return unescapeRegex(source);
  }
  for (let i = index + 1; i < originalLines.length; i++) {
    const m = re.exec(originalLines[i]!);
    if (m && m[0]) return m[0];
  }
  return unescapeRegex(source);
}

function unescapeRegex(source: string): string {
  return source.replace(/\\(.)/g, "$1");
}

function collectTips(nodes: AstNode[]): {
  tips: Tip[];
  carriers: Set<AstNode>;
} {
  const tips: Tip[] = [];
  const carriers = new Set<AstNode>();
  for (const top of nodes) {
    walk(top, (n) => {
      if (!isCode(n)) return;
      const original = n.value.split("\n");
      const removed = stripAnnotations(n, TOOLTIP);
      if (!removed.length) return;
      carriers.add(top);
      for (const { index, annotation } of removed) {
        const name = annotation.query.split(/\s+/)[0] ?? "";
        if (!name) continue;
        const token = annotation.regex
          ? tokenFor(
              original,
              index,
              annotation.regex.source,
              annotation.regex.flags,
            )
          : name;
        tips.push({ name, token });
      }
    });
  }
  return { tips, carriers };
}

function splitNotes(children: AstNode[]): {
  content: AstNode[];
  notes: NoteSection[];
} {
  const content: AstNode[] = [];
  const notes: NoteSection[] = [];
  let current: NoteSection | null = null;
  for (const c of children) {
    const marker = markerHeading(c, 3);
    if (marker && marker.bang === "!") {
      current = { name: marker.rest, body: [] };
      notes.push(current);
      continue;
    }
    if (current && c.type === "heading" && (c.depth as number) <= 3) {
      current = null;
    }
    (current ? current.body : content).push(c);
  }
  return { content, notes };
}

function titleNode(tokens: string[]): AstNode {
  const kids: AstNode[] = [];
  tokens.forEach((t, i) => {
    if (i > 0) kids.push({ type: "text", value: ", " });
    kids.push({ type: "inlineCode", value: t });
  });
  return {
    type: "paragraph",
    children: [{ type: "strong", children: kids }],
  };
}

export function convertWithNotes(
  el: AstNode,
  ctx: Pick<ConvertContext, "warn">,
  locale = "en",
): AstNode[] {
  const { content, notes } = splitNotes(el.children ?? []);
  const { tips, carriers } = collectTips(content);
  if (!notes.length) {
    ctx.warn("WithNotes without `### !name` notes: unwrapped");
    return content;
  }

  // name -> unique tokens, in order of appearance.
  const byName = new Map<string, string[]>();
  for (const t of tips) {
    const list = byName.get(t.name) ?? [];
    if (!list.includes(t.token)) list.push(t.token);
    byName.set(t.name, list);
  }
  const noteNames = new Set(notes.map((n) => n.name));
  const unusedTips = [...byName.keys()].filter((k) => !noteNames.has(k));
  const pending = [...unusedTips];
  const items: AstNode[] = [];
  for (const note of notes) {
    let tokens = byName.get(note.name);
    if (!tokens && pending.length) {
      const paired = pending.shift()!;
      tokens = byName.get(paired);
      ctx.warn(
        `WithNotes: note "!${note.name}" has no tooltip; paired by order with tooltip "${paired}"`,
      );
    }
    if (!note.body.length) continue;
    if (!tokens?.length && locale === "en")
      ctx.warn(
        `WithNotes: note "!${note.name}" is used by no tooltip; kept without a title`,
      );
    if (tokens?.length) items.push(titleNode(tokens));
    items.push(...note.body);
  }
  for (const name of pending) {
    ctx.warn(`WithNotes: tooltip "${name}" has no matching note`);
  }
  if (!items.length) return content;

  const callout = flow("Note", [], items);
  let at = -1;
  content.forEach((c, i) => {
    if (carriers.has(c)) at = i;
  });
  const out = [...content];
  out.splice(at >= 0 ? at + 1 : out.length, 0, callout);
  return out;
}

export const transform: Transform = {
  name: "notes",
  order: 80,
  owner: "WP3",
  appliesTo: (source) =>
    source.includes("<WithNotes") || source.includes("!tooltip"),
  run(tree, file, ctx) {
    replaceJsx(tree, "WithNotes", (el) =>
      convertWithNotes(el, ctx, file.locale),
    );
    // Stray tooltips (stale locale forks without WithNotes): Code Hike
    // showed only the note id there, so the line is dropped.
    walk(tree, (n) => {
      if (isCode(n)) stripAnnotations(n, TOOLTIP);
    });
    walk(tree, (n) => {
      if (isJsx(n, "WithNotes")) ctx.error("WithNotes left unconverted");
    });
  },
};
