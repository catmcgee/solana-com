/**
 * Files / Folder / File -> docs `<Tree>` / `<Tree.Folder>` /
 * `<Tree.File>` (spec §3.1 `files.ts`).
 *
 * Every folder is emitted with `defaultOpen`: the renderer at conversion time
 * only server-rendered the contents of open folders (SSR probe), so a closed folder would hide
 * its files from readers without JavaScript. The corpus only has open
 * folders today, so this changes nothing for JS readers.
 */
import type { AstNode, ConvertContext, Transform } from "../../types.ts";
import { attr, getAttr, isJsx, type Jsx, walk } from "./_codehike.ts";

function convertNode(n: AstNode, ctx: Pick<ConvertContext, "warn">): void {
  for (const c of n.children ?? []) convertNode(c, ctx);
  if (!isJsx(n)) return;
  if (n.name === "Folder") {
    const name = getAttr(n, "name") ?? "";
    n.name = "Tree.Folder";
    n.attributes = [attr("name", name), attr("defaultOpen", true)];
    n.children = (n.children ?? []).filter((c) => isJsx(c) || !isBlank(c));
  } else if (n.name === "File") {
    const name = getAttr(n, "name") ?? "";
    n.name = "Tree.File";
    n.attributes = [attr("name", name)];
    if ((n.children ?? []).length) {
      ctx.warn(`File "${name}" had children; dropped`);
      n.children = [];
    }
  }
}

function isBlank(n: AstNode) {
  return n.type === "text" && String(n.value ?? "").trim() === "";
}

export const transform: Transform = {
  name: "files",
  order: 84,
  appliesTo: (source) => source.includes("<Files"),
  run(tree, _file, ctx) {
    walk(tree, (n) => {
      if (!isJsx(n, "Files")) return;
      for (const c of n.children ?? []) convertNode(c, ctx);
      (n as Jsx).name = "Tree";
      (n as Jsx).attributes = [];
      return "skip";
    });
    walk(tree, (n) => {
      if (isJsx(n, "Files") || isJsx(n, "Folder") || isJsx(n, "File"))
        ctx.error(`<${String(n.name)}> left unconverted`);
    });
  },
};
