/**
 * return-type: the `### !!result [Title]` sections of `<APIMethod>`
 * (spec §3.1, APIMethod row; "return types" of an RPC method).
 *
 * Input, inside `<APIMethod>` (always the last sections of the block):
 *
 *   ### !!result Healthy
 *   ```jsonc !response
 *   { "jsonrpc": "2.0", // !hover result
 *     "result": "ok", "id": 1 }
 *   ```
 *   !type string
 *   Returns `"ok"` when the node is healthy.
 *   #### !! context
 *   !type object
 *   ...
 *
 * Output, replacing those sections at the end of the same `<APIMethod>`:
 *
 *   <ResponseExample>            one fence per result, titled by the result
 *   ```json Healthy              title ("Response" when untitled), `!hover`
 *   ...                          lines removed, `!collapse … collapsed` ->
 *   ```                          `expandable`
 *   </ResponseExample>
 *   ## Result                    depth per `sectionDepth` (h2/h3)
 *   <ResponseField name="result" type="string" post={["Healthy"]}>
 *     Returns `"ok"` when the node is healthy.
 *     <Expandable title="properties"> nested <ResponseField>s </Expandable>
 *   </ResponseField>
 *
 * `post` (the variant label) is only set when a method has several results,
 * so readers without JavaScript, who see every response example stacked,
 * still see which result is which in the Result section.
 *
 * Runs before `api-method` (which unwraps `<APIMethod>` and moves the
 * `<ResponseExample>` next to the `<RequestExample>`), and before the WP2
 * fence transforms (order 100+), because it consumes Code Hike fence metas
 * (`!response`) and annotation lines those transforms would rewrite.
 */
import type { AstNode, Transform } from "../../types.ts";
import {
  findJsx,
  heading,
  isHikeHeading,
  jsx,
  parseHikeName,
  parseHikeSections,
  plainFence,
  renderField,
  sectionDepth,
  toText,
  type HikeSection,
} from "./_rpc.ts";

const isResultHeading = (n: AstNode) =>
  isHikeHeading(n) && parseHikeName(toText(n)).name === "result";

export const transform: Transform = {
  name: "return-type",
  order: 87,
  owner: "WP4",
  appliesTo: (src) => src.includes("<APIMethod") && src.includes("!!result"),
  run(tree, file, ctx) {
    const depth = sectionDepth(tree);
    for (const { node } of findJsx(tree, "APIMethod")) {
      const kids = node.children ?? [];
      const start = kids.findIndex(isResultHeading);
      if (start < 0) continue;
      const tail = kids.slice(start);
      const parsed = parseHikeSections(tail);
      const results: HikeSection[] = [];
      for (const s of parsed.children) {
        if (s.name === "result") results.push(s);
        else
          throw new Error(
            `APIMethod: section "!${s.name}" after the !!result sections`,
          );
      }
      if (parsed.content.length || parsed.code.length)
        throw new Error("APIMethod: unexpected content before !!result");

      const multiple = results.length > 1;
      const examples: AstNode[] = [];
      const fields: AstNode[] = [];
      results.forEach((r, i) => {
        const where = `${file.path} result ${r.title || i + 1}`;
        const responses = r.code.filter((c) => c.name === "response");
        for (const c of r.code)
          if (c.name !== "response")
            ctx.warn(`${where}: unexpected fence "!${c.name}" dropped`);
        if (responses.length > 1)
          ctx.warn(`${where}: ${responses.length} !response fences; kept all`);
        for (const c of responses)
          examples.push(
            plainFence(c, { title: r.title || "Response", ctx, where }),
          );
        if (!responses.length) ctx.warn(`${where}: no !response fence`);
        // The response fence is a slot, not field content.
        fields.push(
          renderField({ ...r, code: [] }, "response", ctx, where, {
            name: "result",
            post: multiple ? r.title || undefined : undefined,
          }),
        );
      });

      const out: AstNode[] = [];
      if (examples.length) out.push(jsx("ResponseExample", {}, examples));
      out.push(heading(depth, "Result"), ...fields);
      kids.splice(start, kids.length - start, ...out);
    }
  },
};
