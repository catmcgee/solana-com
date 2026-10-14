/**
 * Fumadocs `<Tabs items groupId>` / `<Tab value>` -> Mintlify `<Tabs>` /
 * `<Tab title>` (spec §3.1).
 *
 *   <Tabs items={['pnpm', 'npm']} groupId="package-manager">
 *   <Tab value="pnpm">…</Tab>
 *   <Tab value="npm">…</Tab>
 *   </Tabs>
 *
 * becomes
 *
 *   <Tabs>
 *   <Tab title="pnpm">…</Tab>
 *   <Tab title="npm">…</Tab>
 *   </Tabs>
 *
 * - `value` becomes `title`. A `<Tab>` without `value` takes the matching
 *   `items` entry by position (Fumadocs' fallback).
 * - `items`, `groupId`, `persist` and `updateAnchor` are dropped. Mintlify
 *   syncs tabs with the same title on a page by default, which replaces
 *   `groupId`; cross-page persistence is lost (accepted in decisions.md).
 * - `defaultIndex={n}` becomes `defaultTabIndex={n}`.
 * - Only `<Tab>` elements whose parent is a `<Tabs>` with Fumadocs
 *   attributes or `value` props are rewritten, so Mintlify output is a no-op.
 *
 * No-JS: Mintlify server-renders every panel (inactive ones get the
 * `hidden` class); migration/setup-nojs-fallback.css (to be shipped in
 * apps/docs/styles by WP11) un-hides them when JavaScript is off.
 */
import type { Transform } from "../../types.ts";
import {
  attr,
  exprAttr,
  exprAttrSource,
  findAttr,
  isJsx,
  parseStringArray,
  strAttr,
  unknownAttrs,
  walk,
} from "./_wp2.ts";

const DROPPED = ["items", "groupId", "persist", "updateAnchor", "id"];

export const transform: Transform = {
  name: "tabs",
  order: 230,
  owner: "WP2",
  appliesTo: (source) => source.includes("<Tab"),
  run(tree, _file, ctx) {
    walk(tree, (n) => {
      if (!isJsx(n, "Tabs")) return;
      const itemsSrc = exprAttrSource(n, "items");
      const items = itemsSrc ? parseStringArray(itemsSrc) : undefined;
      if (itemsSrc && !items)
        ctx.warn(`<Tabs items={${itemsSrc}}> is not a string array`);
      const tabs = n.children.filter((c) => isJsx(c, "Tab"));
      const unknown = unknownAttrs(n, [...DROPPED, "defaultIndex", "sync"]);
      if (unknown.length)
        ctx.warn(`<Tabs> attributes dropped: ${unknown.join(", ")}`);
      const defaultIndex = exprAttrSource(n, "defaultIndex");
      const fumadocs =
        n.attributes.some(
          (a) => a.type === "mdxJsxAttribute" && a.name !== "sync",
        ) || tabs.some((t) => isJsx(t) && findAttr(t, "value"));
      if (!fumadocs) return;
      n.attributes = [
        ...(defaultIndex ? [exprAttr("defaultTabIndex", defaultIndex)] : []),
        ...n.attributes.filter(
          (a) => a.type === "mdxJsxAttribute" && a.name === "sync",
        ),
      ];
      tabs.forEach((t, i) => {
        if (!isJsx(t)) return;
        const value = strAttr(t, "value") ?? strAttr(t, "title") ?? items?.[i];
        if (value === undefined) {
          ctx.warn(`<Tab> #${i + 1} has no value and no matching items entry`);
          return;
        }
        if (items && !items.includes(value))
          ctx.warn(`<Tab value="${value}"> is not in items`);
        const rest = t.attributes.filter(
          (a) =>
            a.type === "mdxJsxAttribute" &&
            a.name !== "value" &&
            a.name !== "title" &&
            a.name !== "id",
        );
        t.attributes = [attr("title", value), ...rest];
      });
      const stray = n.children.filter(
        (c) => isJsx(c) && c.name !== "Tab",
      ).length;
      if (stray) ctx.warn(`<Tabs> has ${stray} non-<Tab> JSX children`);
    });
  },
};
