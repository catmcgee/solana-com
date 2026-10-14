/**
 * code-reference (WP4): `<CodeReference>` + `## !reference` (spec §3.1; 30
 * blocks in 10 en files: `rpc/json-structures`, `rpc/websocket/*subscribe`).
 *
 *   <CodeReference>
 *   ```jsonc !!                    -> ```json   (`!hover` lines removed)
 *   ## !reference
 *   ### !! jsonrpc / !type string  -> <ResponseField name="jsonrpc" type="string">
 *   #### !! result                 ->   <Expandable title="properties"> <ResponseField …>
 *   </CodeReference>
 *
 * The old component linked hovered code lines to the matching field; that
 * hover link is dropped (spec). Fields render as static ResponseField trees,
 * nested fields inside `<Expandable>` (native `<details>`, readable without
 * JavaScript). Several `!!` fences in one block become a `<CodeGroup>`.
 *
 * Order 90: before the WP2 fence transforms (fences.ts, 900), see `api-method`.
 */
import type { AstNode, Transform } from "../../types.ts";
import {
  fieldChildren,
  findJsx,
  jsx,
  parseHikeSections,
  plainFence,
  renderField,
  replaceNode,
  reportValues,
} from "./_rpc.ts";

export const transform: Transform = {
  name: "code-reference",
  order: 90,
  owner: "WP4",
  appliesTo: (src) => src.includes("<CodeReference"),
  run(tree, file, ctx) {
    for (const { node, parent } of findJsx(tree, "CodeReference")) {
      const where = `${file.path} CodeReference`;
      const parsed = parseHikeSections(node.children ?? []);
      const out: AstNode[] = [];
      const fences = parsed.code.map((c) => {
        if (c.name !== "code")
          ctx.warn(`${where}: unexpected fence slot "!${c.name}" kept as code`);
        return plainFence(c, { ctx, where });
      });
      if (fences.length > 1) out.push(jsx("CodeGroup", {}, fences));
      else out.push(...fences);
      if (!fences.length) ctx.warn(`${where}: no code fence`);
      // Content outside the slots was not rendered by the old component.
      if (parsed.content.length) {
        ctx.warn(
          `${where}: ${parsed.content.length} node(s) outside CodeReference slots (hidden on the old site) kept`,
        );
        out.push(...parsed.content);
      }

      for (const s of parsed.children) {
        if (s.name !== "reference") {
          ctx.warn(`${where}: unexpected section "!${s.name}" dropped`);
          continue;
        }
        reportValues(s, ctx, `${where} reference`);
        out.push(...s.content);
        for (const f of fieldChildren(s, ctx, `${where} reference`))
          out.push(renderField(f, "response", ctx, `${where} reference`));
      }
      replaceNode(parent, node, out);
    }
  },
};
