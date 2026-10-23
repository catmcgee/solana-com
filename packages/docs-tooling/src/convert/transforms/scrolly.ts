/**
 * ScrollyCoding -> `<Steps>` + `<Step title>` with each step's own code
 * (spec §3.1 `scrolly.ts`; decisions.md "scrolly -> Steps + code").
 *
 *   <ScrollyCoding>
 *   ## !!steps Generate Keypair
 *   Prose…
 *   <CodePlaceholder title="Create Nonce Account" />
 *   ```ts !! title="Create Nonce Account"
 *   …
 *   ```
 *   </ScrollyCoding>
 *
 * becomes
 *
 *   <Steps>
 *     <Step title="Generate Keypair">
 *       Prose…
 *
 *       ```ts !! title="Create Nonce Account"
 *       …
 *       ```
 *     </Step>
 *   </Steps>
 *
 * Rules:
 * - Every `## !!steps T` heading starts a step titled T. Content before the
 *   first step stays before `<Steps>`.
 * - `<CodePlaceholder title="X" />` is replaced by that step's fence titled
 *   X (Code Hike `!!` slots first, then any fence titled X); the fence moves
 *   from its own position to the placeholder. Placeholder children (prose)
 *   are kept just before the fence, as Code Hike rendered them. When no
 *   fence has the title but exactly one slot fence is still unplaced, that
 *   fence is used (titles drift in stale locale forks). Otherwise the
 *   placeholder is dropped with a warning. Steps without a title (`## !!steps`
 *   alone, 2 pages per locale) become `<Step>` with no title.
 * - Fences that no placeholder claims stay where they are, which is the end
 *   of the step in practice (Code Hike's sticky column).
 * - Slot fences with more than 40 code lines (annotation comments not
 *   counted) get the docs `expandable` flag.
 * - Fence meta and annotations (`!!`, `!focus`, `!mark`, …) are untouched:
 *   fences.ts converts them (`!focus(a:b)` -> `focus={a-b}` etc.), before
 *   or after this transform.
 * - The output Step has a `title`, so steps.ts must not lift an H3
 *   from it.
 */
import type { AstNode, ConvertContext, Transform } from "../../types.ts";
import {
  type Code,
  attr,
  contentLines,
  fenceTitle,
  flow,
  getAttr,
  isCode,
  isCodeHikeSlot,
  isJsx,
  markerHeading,
  replaceJsx,
  walk,
} from "./_wp3.ts";

export const EXPANDABLE_LINES = 40;

/**
 * Sets a Code Hike fence's title (`title="X"` meta) to `title`, replacing a
 * quoted title or adding one. Titles holding both quote kinds are left alone.
 */
export function withFenceTitle(
  meta: string | null | undefined,
  title: string,
): string {
  const q = !title.includes('"') ? '"' : !title.includes("'") ? "'" : null;
  const current = meta ?? "";
  if (!q) return current;
  const next = `title=${q}${title}${q}`;
  const quoted = /(^|\s)title=(?:"[^"]*"|'[^']*')/;
  if (quoted.test(current))
    return current.replace(quoted, (_m, pre: string) => `${pre}${next}`);
  return current ? `${current} ${next}` : next;
}

interface StepDraft {
  title: string;
  body: AstNode[];
}

function placeCode(
  step: StepDraft,
  ctx: Pick<ConvertContext, "warn">,
  locale: string,
) {
  const fences = step.body.filter(isCode) as Code[];
  const slots = fences.filter((f) => isCodeHikeSlot(f.meta));
  const used = new Set<Code>();
  const out: AstNode[] = [];
  const placed = new Map<AstNode, Code | null>();

  // Resolve placeholders in order first, so a fence claimed by a later
  // placeholder is removed from its original position.
  for (const n of step.body) {
    if (!isJsx(n, "CodePlaceholder")) continue;
    const title = getAttr(n, "title");
    const pick = (pool: Code[]) =>
      pool.find((f) => !used.has(f) && fenceTitle(f.meta) === title);
    let fence = pick(slots) ?? pick(fences);
    if (!fence) {
      const free = slots.filter((f) => !used.has(f));
      if (free.length === 1) {
        fence = free[0]!;
        // Locale forks translate placeholder titles but not fence titles
        // (or the reverse); that is expected, so only English warns.
        if (locale === "en")
          ctx.warn(
            `ScrollyCoding step "${step.title}": CodePlaceholder "${title}" matched the only unplaced fence ("${fenceTitle(fence.meta) ?? ""}")`,
          );
        // The placeholder title is what readers saw above the code (the
        // translated one in locale forks), so it wins over the fence title.
        if (title) fence.meta = withFenceTitle(fence.meta, title);
      }
    }
    if (fence) used.add(fence);
    else
      ctx.warn(
        `ScrollyCoding step "${step.title}": no fence for CodePlaceholder "${title}"; dropped`,
      );
    placed.set(n, fence ?? null);
  }

  for (const n of step.body) {
    if (isJsx(n, "CodePlaceholder")) {
      out.push(...(n.children ?? []));
      const fence = placed.get(n);
      if (fence) out.push(fence);
      continue;
    }
    if (isCode(n) && used.has(n)) continue;
    out.push(n);
  }

  for (const f of slots) {
    if (contentLines(f.value).length > EXPANDABLE_LINES) {
      const meta = f.meta ?? "";
      if (!/(?:^|\s)expandable(?:\s|$)/.test(meta))
        f.meta = meta ? `${meta} expandable` : "expandable";
    }
  }
  step.body = out;
}

export function convertScrolly(
  el: AstNode,
  ctx: Pick<ConvertContext, "warn">,
  locale = "en",
): AstNode[] {
  const before: AstNode[] = [];
  const steps: StepDraft[] = [];
  for (const c of el.children ?? []) {
    const m = markerHeading(c, 2);
    if (m && m.bang === "!!" && /^steps\b/.test(m.rest)) {
      steps.push({ title: m.rest.replace(/^steps\s*/, ""), body: [] });
      continue;
    }
    (steps.length ? steps[steps.length - 1]!.body : before).push(c);
  }
  if (!steps.length) {
    ctx.warn("ScrollyCoding without `## !!steps` headings: unwrapped");
    return before.filter((n) => !isJsx(n, "CodePlaceholder"));
  }
  for (const s of steps) placeCode(s, ctx, locale);
  const stepEls = steps.map((s) =>
    flow("Step", s.title ? [attr("title", s.title)] : [], s.body),
  );
  return [...before, flow("Steps", [], stepEls)];
}

export const transform: Transform = {
  name: "scrolly",
  order: 83,
  owner: "WP3",
  appliesTo: (source) => source.includes("<ScrollyCoding"),
  run(tree, file, ctx) {
    replaceJsx(tree, "ScrollyCoding", (el) =>
      convertScrolly(el, ctx, file.locale),
    );
    walk(tree, (n) => {
      if (isJsx(n, "ScrollyCoding") || isJsx(n, "CodePlaceholder"))
        ctx.error(`${String(n.name)} left unconverted`);
    });
  },
};
