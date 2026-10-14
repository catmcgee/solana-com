/**
 * gen:paths (WP8b, spec §3.4 item 2 and 6).
 *
 *   tsx src/generators/paths.ts [--check] [--sync] [--init]
 *
 * Source: apps/docs/paths/paths.en.json (+ paths.<loc>.json from Lingo).
 *
 * ```jsonc
 * {
 *   "_ui": { "step": "Step", … },            // optional UI strings (Lingo translates)
 *   "checkout": {
 *     "tab": "payments", "label": "Payments", "job": "Accept dollar payments",
 *     "name": "Build a checkout", "time": "~30 min", "summary": "…",
 *     "intro": "/docs/payments/checkout",
 *     "first": 0,                             // 0-based step that is the "first win"
 *     "steps": [["/docs/payments/checkout/try-it", "Pay as a customer", "optional summary"], …],
 *     "after": { "href": "/docs/payments", "title": "…", "summary": "…" },   // optional
 *     "demo": {                              // optional client-side extra
 *       "component": "checkout",             // checkout | paywall | asset
 *       "title": "Demo Sticker Shop",
 *       "success": "…",
 *       "steps": [{ "label": "…", "description": "…", "status": "402",
 *                   "output": "paths/payments/checkout/pay.output.txt" }]
 *     }
 *   }
 * }
 * ```
 *
 * Output, per language with a source file, under snippets/paths/<lang>/<key>/:
 * - `stepper-<n>.mdx`, n = 0 (intro page, nothing current) … N (step N
 *   current). A `<div role="navigation">` with an `<ol>`; the current step's
 *   link carries `aria-current="step"`. Raw `<nav>` is dropped by Mintlify.
 * - `next-<n>.mdx`: a horizontal `<Card>` to step n+1 (n = 0 … N-1), and
 *   `next-<N>.mdx` to `after` when it is set.
 * - `card.mdx`: the path card for job pickers and hubs.
 * - `demo.mdx` (when `demo` is set): the client-only `snippets/demos/*.jsx`
 *   component with the recorded outputs inlined as props, followed by the
 *   same steps as static `<Steps>` with each recorded output in a visible
 *   `text` fence. The static part is the content; the component is an
 *   optional extra that only renders with JavaScript. A step whose recorded
 *   output is missing (WP5 has not recorded it yet) is generated without
 *   output and without the interactive component, and is reported (like a
 *   code block without recorded output gets no Run button).
 *
 * `--sync` only re-points `/snippets/paths/<lang>/` imports in locale pages;
 * `--check` runs that in memory and fails when a page would change.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "../lib/paths.ts";
import { DEFAULT_LOCALE } from "../lib/locales.ts";
import {
  applyOutputs,
  checkInlineMarkdown,
  emptyResult,
  fence,
  finish,
  header,
  isMain,
  isRecord,
  attr,
  localizeHref,
  mdInline,
  mdText,
  pageFileFor,
  parseFlags,
  printResult,
  readJson,
  resolveDocsRoot,
  sourceLanguages,
  syncPages,
  syncSnippetImports,
  uiStrings,
  type GeneratorOptions,
  type GeneratorResult,
  type Problem,
} from "./_lib.ts";

export const PATH_UI = {
  step: "Step",
  firstWin: "First win",
  done: "Done",
  next: "Next",
  start: "Start the path",
  steps: "steps",
  demoStatic: "What happens, step by step",
  demoRecorded: "Recorded on a local Surfpool network",
  demoBadge: "Replay of a recorded run · test money",
  demoRun: "Run step",
  demoRunning: "Running…",
  demoReset: "Start over",
  demoFinished: "Finished",
  demoRequest: "Request",
  demoResponse: "Response",
  demoItem: "Holographic sticker",
  demoNotPaid: "Not paid yet",
  demoChecking: "Paid, checking…",
  demoConfirmed: "Paid and confirmed",
  demoSettled: "Settled",
  demoRejected: "Rejected by the network",
  demoNotSent: "Not sent",
};
export type PathUi = typeof PATH_UI;

export const DEMO_COMPONENTS = {
  checkout: "CheckoutDemo",
  paywall: "PaywallDemo",
  asset: "AssetDemo",
} as const;
export type DemoKind = keyof typeof DEMO_COMPONENTS;

export interface PathStep {
  href: string;
  title: string;
  summary?: string;
}
export interface DemoStep {
  label: string;
  description?: string;
  status?: string;
  /** Path of the recorded output, relative to packages/docs-examples. */
  output: string;
}
export interface PathDef {
  key: string;
  tab: string;
  label: string;
  job: string;
  name: string;
  time: string;
  summary?: string;
  intro: string;
  first?: number;
  steps: PathStep[];
  after?: PathStep;
  demo?: {
    component: DemoKind;
    title: string;
    success?: string;
    steps: DemoStep[];
  };
}
export interface PathsSource {
  lang: string;
  ui: PathUi;
  paths: PathDef[];
}

const KEY_RE = /^[a-z][a-z0-9-]*$/;
const PATH_FIELDS = new Set([
  "tab",
  "label",
  "job",
  "name",
  "time",
  "summary",
  "intro",
  "first",
  "steps",
  "after",
  "demo",
]);

export function pathsDir(docsRoot: string) {
  return path.join(docsRoot, "paths");
}
export const examplesRoot = path.join(repoRoot, "packages", "docs-examples");

function str(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Validate one paths.<lang>.json. Locale files are merged over English:
 * translatable strings come from the locale, hrefs, keys, order, `first`,
 * demo components and outputs always come from English (Lingo locks them).
 */
export function parsePaths(
  raw: unknown,
  file: string,
  problems: Problem[],
  english?: PathsSource,
): PathsSource {
  const err = (message: string) =>
    problems.push({ level: "error", file, message });
  const out: PathsSource = {
    lang: DEFAULT_LOCALE,
    ui: { ...PATH_UI },
    paths: [],
  };
  if (!isRecord(raw)) {
    err("must be a JSON object of path definitions");
    return out;
  }
  out.ui = uiStrings(PATH_UI, english?.ui, raw._ui);
  if (english) {
    out.paths = english.paths.map((en) =>
      mergePath(en, raw[en.key], file, problems),
    );
    for (const k of Object.keys(raw))
      if (
        k !== "_ui" &&
        k !== "$schema" &&
        !english.paths.some((p) => p.key === k)
      )
        problems.push({
          level: "warn",
          file,
          message: `"${k}" is not in paths.en.json; ignored`,
        });
    return out;
  }
  for (const [key, v] of Object.entries(raw)) {
    if (key === "_ui" || key === "$schema") continue;
    const at = (m: string) => err(`${key}: ${m}`);
    if (!KEY_RE.test(key)) at("key must be kebab-case ([a-z][a-z0-9-]*)");
    if (!isRecord(v)) {
      at("must be an object");
      continue;
    }
    for (const f of Object.keys(v))
      if (!PATH_FIELDS.has(f)) at(`unknown field "${f}"`);
    for (const f of ["tab", "job", "name", "time", "intro"] as const)
      if (!str(v[f])) at(`"${f}" must be a non-empty string`);
    if (str(v.intro) && !v.intro.startsWith("/"))
      at(`"intro" must be a root-relative href`);
    const steps = parseSteps(v.steps, at);
    if (!steps.length) at(`"steps" must list at least one [href, title]`);
    const first = v.first;
    if (
      first !== undefined &&
      (!Number.isInteger(first) ||
        (first as number) < 0 ||
        (first as number) >= steps.length)
    )
      at(`"first" must be a step index (0-${steps.length - 1})`);
    let after: PathStep | undefined;
    if (v.after !== undefined) {
      const a = v.after;
      if (!isRecord(a) || !str(a.href) || !str(a.title))
        at(`"after" must be { href, title, summary? }`);
      else
        after = {
          href: a.href,
          title: a.title,
          summary: str(a.summary) ? a.summary : undefined,
        };
    }
    if (typeof v.summary === "string") {
      const bad = checkInlineMarkdown(v.summary);
      if (bad) at(`"summary" ${bad}`);
    }
    out.paths.push({
      key,
      tab: String(v.tab ?? ""),
      label: str(v.label) ? v.label : String(v.name ?? key),
      job: String(v.job ?? ""),
      name: String(v.name ?? ""),
      time: String(v.time ?? ""),
      summary: str(v.summary) ? v.summary : undefined,
      intro: String(v.intro ?? ""),
      first: typeof first === "number" ? first : undefined,
      steps,
      after,
      demo: parseDemo(v.demo, at),
    });
  }
  return out;
}

function parseSteps(v: unknown, at: (m: string) => void): PathStep[] {
  if (!Array.isArray(v)) return [];
  const out: PathStep[] = [];
  v.forEach((s, i) => {
    if (
      !Array.isArray(s) ||
      s.length < 2 ||
      s.length > 3 ||
      !s.every((x) => typeof x === "string")
    ) {
      at(`steps[${i}] must be [href, title] or [href, title, summary]`);
      return;
    }
    const [href, title, summary] = s as string[];
    if (!href!.startsWith("/")) at(`steps[${i}] href must be root-relative`);
    if (summary) {
      const bad = checkInlineMarkdown(summary);
      if (bad) at(`steps[${i}] summary ${bad}`);
    }
    out.push({ href: href!, title: title!, summary: summary || undefined });
  });
  return out;
}

function parseDemo(v: unknown, at: (m: string) => void): PathDef["demo"] {
  if (v === undefined) return undefined;
  if (!isRecord(v)) {
    at(`"demo" must be an object`);
    return undefined;
  }
  const kind = v.component;
  if (typeof kind !== "string" || !(kind in DEMO_COMPONENTS)) {
    at(
      `demo.component must be one of ${Object.keys(DEMO_COMPONENTS).join(", ")}`,
    );
    return undefined;
  }
  if (!str(v.title)) at(`demo.title must be a non-empty string`);
  const steps: DemoStep[] = [];
  if (!Array.isArray(v.steps) || !v.steps.length)
    at(`demo.steps must be a non-empty array`);
  else
    v.steps.forEach((s, i) => {
      if (!isRecord(s) || !str(s.label) || !str(s.output)) {
        at(`demo.steps[${i}] must be { label, output, description?, status? }`);
        return;
      }
      if (path.isAbsolute(s.output) || s.output.split("/").includes(".."))
        at(
          `demo.steps[${i}].output must be relative to packages/docs-examples`,
        );
      if (typeof s.description === "string") {
        const bad = checkInlineMarkdown(s.description);
        if (bad) at(`demo.steps[${i}].description ${bad}`);
      }
      steps.push({
        label: s.label,
        output: s.output,
        description: str(s.description) ? s.description : undefined,
        status: str(s.status) ? s.status : undefined,
      });
    });
  return {
    component: kind as DemoKind,
    title: String(v.title ?? ""),
    success: str(v.success) ? v.success : undefined,
    steps,
  };
}

function mergePath(
  en: PathDef,
  raw: unknown,
  file: string,
  problems: Problem[],
): PathDef {
  if (raw === undefined) return en;
  if (!isRecord(raw)) {
    problems.push({
      level: "error",
      file,
      message: `${en.key}: must be an object`,
    });
    return en;
  }
  const s = (v: unknown, fallback: string) => (str(v) ? v : fallback);
  const so = (v: unknown, fallback?: string) => (str(v) ? v : fallback);
  const steps = en.steps.map((st, i) => {
    const t = Array.isArray(raw.steps) ? raw.steps[i] : undefined;
    return Array.isArray(t)
      ? {
          href: st.href,
          title: s(t[1], st.title),
          summary: so(t[2], st.summary),
        }
      : st;
  });
  const ra = isRecord(raw.after) ? raw.after : {};
  const rd = isRecord(raw.demo) ? raw.demo : {};
  const rds = Array.isArray(rd.steps) ? rd.steps : [];
  return {
    ...en,
    label: s(raw.label, en.label),
    job: s(raw.job, en.job),
    name: s(raw.name, en.name),
    time: s(raw.time, en.time),
    summary: so(raw.summary, en.summary),
    steps,
    after: en.after && {
      href: en.after.href,
      title: s(ra.title, en.after.title),
      summary: so(ra.summary, en.after.summary),
    },
    demo: en.demo && {
      ...en.demo,
      title: s(rd.title, en.demo.title),
      success: so(rd.success, en.demo.success),
      steps: en.demo.steps.map((d, i) => {
        const t = isRecord(rds[i]) ? (rds[i] as Record<string, unknown>) : {};
        return {
          ...d,
          label: s(t.label, d.label),
          description: so(t.description, d.description),
        };
      }),
    },
  };
}

/** All path sources (EN first), validated. */
export function loadPaths(
  docsRoot: string,
  problems: Problem[],
): PathsSource[] {
  const dir = pathsDir(docsRoot);
  const enFile = path.join(dir, "paths.en.json");
  if (!existsSync(enFile)) {
    problems.push({
      level: "error",
      file: "paths/paths.en.json",
      message:
        "missing (WP8a owns it; `--init` writes the seed from src/generators/seed/)",
    });
    return [];
  }
  const en = parsePaths(readJson(enFile), "paths/paths.en.json", problems);
  const out = [en];
  for (const lang of sourceLanguages(dir, "paths").slice(1)) {
    const rel = `paths/paths.${lang}.json`;
    const loc = parsePaths(
      readJson(path.join(dir, `paths.${lang}.json`)),
      rel,
      problems,
      en,
    );
    loc.lang = lang;
    out.push(loc);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const GEN = "paths.ts";
const hdr = (lang: string) =>
  header(GEN, [`paths/paths.${lang}.json`], "gen:paths");

/** Pages of a path in order: intro (index 0), then steps 1..N. */
export function pathPages(p: PathDef) {
  return [p.intro, ...p.steps.map((s) => s.href)];
}

export function renderStepper(
  docsRoot: string,
  src: PathsSource,
  p: PathDef,
  current: number,
): string {
  const { ui, lang } = src;
  const label = `${p.name} · ${p.time}`;
  const items = p.steps.map((s, i) => {
    const n = i + 1;
    const state = n < current ? "done" : n === current ? "current" : "todo";
    const href = localizeHref(docsRoot, s.href, lang);
    const marks: string[] = [];
    if (state === "done")
      marks.push(
        `<span className="sol-stepper-done">${mdText(ui.done)}</span>`,
      );
    if (p.first === i)
      marks.push(
        `<span className="sol-stepper-first">${mdText(ui.firstWin)}</span>`,
      );
    const aria = state === "current" ? ` aria-current="step"` : "";
    // Visually hidden separators so the accessible name reads
    // "Step 1, Done: Title" rather than "Step 1DoneTitle".
    const sep = (t: string) => `<span className="sol-vh">${t}</span>`;
    return `<li data-state="${state}"><a href="${href}"${aria}><span className="sol-stepper-n">${mdText(`${ui.step} ${n}`)}${marks.map((m) => sep(", ") + m).join("")}${sep(": ")}</span><span className="sol-stepper-t">${mdText(s.title)}</span></a></li>`;
  });
  return `${hdr(lang)}
<div className="sol-stepper not-prose" role="navigation" ${attr("aria-label", label)} data-path="${p.key}">
<ol>
${items.join("\n")}
</ol>
</div>
`;
}

function nextCard(docsRoot: string, src: PathsSource, p: PathDef, n: number) {
  const { ui, lang } = src;
  const target = n < p.steps.length ? p.steps[n]! : p.after!;
  const body =
    target.summary !== undefined
      ? mdInline(target.summary)
      : n < p.steps.length
        ? mdText(`${p.name} · ${ui.step} ${n + 1}/${p.steps.length}`)
        : "";
  return `${hdr(lang)}
<Card ${attr("title", `${ui.next}: ${target.title}`)} href="${localizeHref(docsRoot, target.href, lang)}" icon="arrow-right" horizontal>
${body}
</Card>
`;
}

export function renderCard(docsRoot: string, src: PathsSource, p: PathDef) {
  const { ui, lang } = src;
  const intro = localizeHref(docsRoot, p.intro, lang);
  const steps = p.steps
    .map(
      (s, i) =>
        `<li${p.first === i ? ` data-first="true"` : ""}>[${mdText(s.title)}](${localizeHref(docsRoot, s.href, lang)})</li>`,
    )
    .join("");
  return `${hdr(lang)}
<div className="sol-pcard not-prose" data-path="${p.key}">
<p className="sol-pcard-k">${mdText(p.job)}</p>
<p className="sol-pcard-title">[${mdText(p.name)}](${intro})</p>
${p.summary ? `<p className="sol-pcard-desc">${mdInline(p.summary)}</p>\n` : ""}<p className="sol-pcard-meta">${mdText(`${p.time} · ${p.steps.length} ${ui.steps}`)}</p>
<ol className="sol-pcard-steps">${steps}</ol>
<p className="sol-pcard-cta">[${mdText(`${ui.start} →`)}](${intro})</p>
</div>
`;
}

export function readDemoOutput(rel: string, root = examplesRoot) {
  const abs = path.join(root, rel);
  return existsSync(abs)
    ? readFileSync(abs, "utf8").replace(/\s+$/, "")
    : undefined;
}

export function renderDemo(
  src: PathsSource,
  p: PathDef,
  problems: Problem[],
  outputsRoot = examplesRoot,
) {
  const d = p.demo!;
  const { ui, lang } = src;
  const outputs = d.steps.map((s) => readDemoOutput(s.output, outputsRoot));
  const missing = d.steps.filter((_, i) => outputs[i] === undefined);
  for (const s of missing)
    problems.push({
      level: "warn",
      file: `snippets/paths/${lang}/${p.key}/demo.mdx`,
      message: `no recorded output at packages/docs-examples/${s.output} (WP5); demo generated without it and without the interactive replay`,
    });
  const component = DEMO_COMPONENTS[d.component];
  const props = d.steps.map((s, i) => ({
    label: s.label,
    ...(s.status ? { status: s.status } : {}),
    output: outputs[i] ?? "",
  }));
  const interactive = missing.length === 0;
  const lines: string[] = [hdr(lang).trimEnd()];
  if (interactive) {
    lines.push(
      `import { ${component} } from "/snippets/demos/${d.component}-demo.jsx";`,
      "",
    );
    const uiProp = {
      run: ui.demoRun,
      running: ui.demoRunning,
      reset: ui.demoReset,
      finished: ui.demoFinished,
      badge: ui.demoBadge,
      request: ui.demoRequest,
      response: ui.demoResponse,
      item: ui.demoItem,
      notPaid: ui.demoNotPaid,
      checking: ui.demoChecking,
      confirmed: ui.demoConfirmed,
      settled: ui.demoSettled,
      rejected: ui.demoRejected,
      notSent: ui.demoNotSent,
    };
    lines.push(
      `<${component} ${attr("title", d.title)}${d.success ? ` ${attr("success", d.success)}` : ""} ui={${JSON.stringify(uiProp)}} steps={${JSON.stringify(props)}} />`,
    );
  }
  lines.push(
    "",
    `<div className="sol-demo-static" data-demo="${d.component}">`,
    `<p className="sol-demo-static-head"><strong>${mdText(d.title)}</strong> <span className="sol-demo-static-note">${mdText(`${ui.demoStatic} · ${ui.demoRecorded}`)}</span></p>`,
    "",
    "<Steps>",
  );
  d.steps.forEach((s, i) => {
    lines.push(
      `<Step ${attr("title", s.status ? `${s.label} (${s.status})` : s.label)}>`,
    );
    if (s.description) lines.push(mdInline(s.description), "");
    const out = outputs[i];
    if (out !== undefined) lines.push(fence("text", out));
    lines.push("</Step>");
  });
  lines.push("</Steps>");
  if (d.success) lines.push("", `<Check>${mdInline(d.success)}</Check>`);
  lines.push("</div>", "");
  return lines.join("\n");
}

/** Every generated file for every language. */
export function buildPathOutputs(
  docsRoot: string,
  sources: PathsSource[],
  problems: Problem[],
  outputsRoot = examplesRoot,
) {
  const files = new Map<string, string>();
  for (const src of sources) {
    for (const p of src.paths) {
      const dir = path.join(docsRoot, "snippets", "paths", src.lang, p.key);
      for (let n = 0; n <= p.steps.length; n++)
        files.set(
          path.join(dir, `stepper-${n}.mdx`),
          renderStepper(docsRoot, src, p, n),
        );
      for (let n = 0; n < p.steps.length; n++)
        files.set(
          path.join(dir, `next-${n}.mdx`),
          nextCard(docsRoot, src, p, n),
        );
      if (p.after)
        files.set(
          path.join(dir, `next-${p.steps.length}.mdx`),
          nextCard(docsRoot, src, p, p.steps.length),
        );
      files.set(path.join(dir, "card.mdx"), renderCard(docsRoot, src, p));
      if (p.demo) {
        if (
          !existsSync(
            path.join(
              docsRoot,
              "snippets",
              "demos",
              `${p.demo.component}-demo.jsx`,
            ),
          )
        )
          problems.push({
            level: "error",
            file: `snippets/demos/${p.demo.component}-demo.jsx`,
            message: `missing demo component for path "${p.key}"`,
          });
        files.set(
          path.join(dir, "demo.mdx"),
          renderDemo(src, p, problems, outputsRoot),
        );
      }
    }
  }
  return files;
}

/** Warn about path pages that do not exist yet (WP8a writes them). */
function checkPages(docsRoot: string, en: PathsSource, problems: Problem[]) {
  for (const p of en.paths)
    for (const href of [...pathPages(p), ...(p.after ? [p.after.href] : [])])
      if (!pageFileFor(docsRoot, href))
        problems.push({
          level: "warn",
          file: "paths/paths.en.json",
          message: `${p.key}: page ${href} does not exist yet`,
        });
}

export interface PathsOptions extends GeneratorOptions {
  /** Root for recorded demo outputs (defaults to packages/docs-examples). */
  outputsRoot?: string;
}

export function runPaths(opts: PathsOptions = {}): GeneratorResult {
  const docsRoot = resolveDocsRoot(opts);
  const check = Boolean(opts.check);
  const r = emptyResult();
  const sources = loadPaths(docsRoot, r.problems);
  if (!sources.length || r.problems.some((p) => p.level === "error"))
    return finish(r, check);
  checkPages(docsRoot, sources[0]!, r.problems);
  const files = buildPathOutputs(
    docsRoot,
    sources,
    r.problems,
    opts.outputsRoot,
  );
  applyOutputs(
    docsRoot,
    files,
    [path.join(docsRoot, "snippets", "paths")],
    check,
    r,
  );
  // `--check` always verifies imports in memory; only `--sync` writes.
  if (opts.sync || check)
    syncPages(
      docsRoot,
      (s) => s.includes("/snippets/paths/"),
      (tree, file) => syncSnippetImports(tree, "paths", file.lang, docsRoot),
      check,
      r,
    );
  return finish(r, check);
}

const SEED_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "seed",
);

/** Write the seed source when it does not exist (never overwrites). */
export function initPaths(docsRoot: string): string | undefined {
  const dest = path.join(pathsDir(docsRoot), "paths.en.json");
  if (existsSync(dest)) return undefined;
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    readFileSync(path.join(SEED_DIR, "paths.en.json"), "utf8"),
  );
  return dest;
}

if (isMain(import.meta.url)) {
  const f = parseFlags(process.argv.slice(2));
  if (f.init) {
    const w = initPaths(resolveDocsRoot({}));
    console.log(
      w ? `wrote seed ${w}` : "paths.en.json exists; not overwritten",
    );
  }
  const r = runPaths({ check: f.check, sync: f.sync });
  printResult("gen:paths", r, f.check);
  process.exit(r.ok ? 0 : 1);
}
