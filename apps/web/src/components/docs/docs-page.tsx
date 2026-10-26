import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { TOCItemType } from "fumadocs-core/toc";
import { DocsHeader } from "@/app/(docs)/[locale]/developers/docs-header";
import { DocsFooter } from "@/app/(docs)/[locale]/developers/docs-footer";
import { DocsThemePrepaint } from "@/app/(docs)/[locale]/developers/theme-prepaint";
import type { DocsTab, DocsTabIcon } from "@/data/developers/docs-nav";
import {
  breadcrumbs,
  frontmatter,
  markdownPath,
  neighbours,
  resolveDocsPage,
  type ResolvedDocsPage,
} from "@/lib/docs/page-data";
import { getDocsUiStrings } from "@/lib/docs/ui-strings";
import { docsPageMetadata } from "@/lib/docs/metadata";
import { DOCS_LANGUAGE_NAMES, languagePaths } from "@/lib/docs/language-paths";
import { DocsSidebar, SidebarItems, SidebarNav } from "./docs-sidebar";
import { DocsToc } from "./docs-toc.client";
import { smartPunctuation, smartQuotes } from "@/lib/docs/smart-quotes.mjs";
import { PageActions } from "./page-actions.client";
import { DocsLink } from "./docs-link";
import { ApiExamplesWrapper, docsComponents } from "./docs-components";
import { ChevronIcon, TocIcon } from "./docs-ui-icons";
import { DocsRunFlag, DocsScripts } from "./docs-scripts";
import "./docs-styles";

/**
 * A docs page, under the docs chrome: the shared header (one row), the
 * current tab's sidebar, the page header (breadcrumb eyebrow, title,
 * description, page actions), the MDX body, previous/next cards, "On this
 * page" (or, on RPC method pages, the request/response examples) and the
 * shared footer. Ported from the docs app on origin/main (docs-layout.tsx,
 * docs-page.tsx, docs-footer.tsx), with the layout the docs have now.
 */

interface LoadedBody {
  body: (props: { components?: Record<string, unknown> }) => ReactNode;
  toc: TOCItemType[];
  /** Every export of the page module (remark-docs-compat adds apiExamples). */
  _exports?: { apiExamples?: boolean };
}

function headerTabs(resolved: ResolvedDocsPage): {
  tabs: DocsTab[];
  active?: string;
} {
  const visible = resolved.nav.tabs.filter((t) => !t.hidden);
  const current = resolved.tab;
  const list = [...visible];
  if (current?.hidden) list.push(current);
  return {
    tabs: list.map((t) => ({
      key: t.key,
      label: t.title,
      href: t.url,
      icon: (t.icon ?? "book") as DocsTabIcon,
      alignEnd: t.alignEnd && !current?.hidden,
    })),
    active: current?.key,
  };
}

function Pagination({
  previous,
  next,
}: {
  previous?: { name: ReactNode; url: string };
  next?: { name: ReactNode; url: string };
}) {
  if (!previous && !next) return null;
  return (
    // "Previous" / "Next" labels: apps/docs/styles/theme.css (::before).
    <nav id="pagination">
      {previous ? (
        <DocsLink
          href={previous.url}
          rel="prev"
          data-component-part="pagination-prev"
          className="pagination-link"
        >
          <div
            data-component-part="pagination-title"
            className="pagination-title"
          >
            {previous.name}
          </div>
        </DocsLink>
      ) : null}
      {next ? (
        <DocsLink
          href={next.url}
          rel="next"
          data-component-part="pagination-next"
          className="pagination-link"
        >
          <div
            data-component-part="pagination-title"
            className="pagination-title"
          >
            {next.name}
          </div>
        </DocsLink>
      ) : null}
    </nav>
  );
}

export async function DocsPageView({
  locale,
  slugs,
}: {
  locale: string;
  slugs: string[];
}) {
  const resolved = resolveDocsPage(locale, slugs);
  if (!resolved) notFound();
  // Nav-only pages (`url` frontmatter) send readers to the real page.
  const target = (resolved.page.data as { url?: string }).url;
  if (target) redirect(target);
  const { page, contentLocale } = resolved;
  const fm = frontmatter(page);
  const loaded = (await (
    page.data as unknown as { load: () => Promise<unknown> }
  ).load()) as LoadedBody;
  const MDX = loaded.body;
  const strings = getDocsUiStrings(contentLocale);
  const crumbs = breadcrumbs(resolved);
  const { previous, next } = fm.hideFooterPagination
    ? {}
    : neighbours(resolved);
  const wide = fm.mode === "wide";
  const api = !!loaded._exports?.apiExamples;
  const { tabs, active } = headerTabs(resolved);
  const tab = resolved.tab;
  const current = page.url;
  // One element for both copies of the nav (sidebar and header menu).
  const navItems = tab ? <SidebarItems tab={tab} current={current} /> : null;
  const examples = api ? (
    <MDX components={{ ...docsComponents, wrapper: ApiExamplesWrapper }} />
  ) : null;

  return (
    <>
      <DocsThemePrepaint />
      <DocsRunFlag />
      {/* For agents reading the HTML: where the Markdown index is. */}
      <blockquote
        className="sr-only"
        data-agent-docs-index="true"
        aria-hidden="true"
      >
        <h2>Documentation Index</h2>
        <p>
          Fetch the complete documentation index at:{" "}
          {/* eslint-disable-next-line next/no-html-link-for-pages -- a file */}
          <a href="/llms.txt" tabIndex={-1}>
            /llms.txt
          </a>
        </p>
        <p>
          Use this file to discover all available pages before exploring
          further.
        </p>
      </blockquote>
      {/* With Ask AI docked (html[data-ask=docked], ask/ask-panel.client.tsx)
          everything but the header makes room for the panel, and the side
          column (TOC or API examples) gives way when the text would get
          narrower than at 1280px: its examples then show inline. The
          header moves over only as far as its 92rem bar has room, so it
          lines up with the page without squeezing its tabs (2rem less:
          the panel's room replaces .docs-body's own end padding). Full
          screen (html[data-ask=fullscreen], set before paint for a
          full-screen link) hides the page under the dialog: on a load at
          once, as the first style runs no transition; on Expand once the
          dialog has faded in (150ms), so the page doesn't blink out first.
          It also stops the body's colour transition, which would
          otherwise fade from light to dark behind it as the theme loads. */}
      <div
        data-docs=""
        data-dev-landing="docs"
        data-mode={wide ? "wide" : undefined}
        lang={contentLocale === locale ? undefined : contentLocale}
        className="xl:[html[data-ask=docked]_&>.dh]:pe-[min(var(--ask-w)_-_2rem,max(0px,100%_-_92rem))] xl:[html[data-ask=docked]_&>:not(.dh)]:pe-[var(--ask-w)] [html[data-ask=fullscreen]_&]:invisible [html[data-ask=fullscreen]_&]:[transition:visibility_0s_150ms] motion-reduce:[html[data-ask=fullscreen]_&]:[transition:none] [html[data-ask=fullscreen]_body:has(&)]:transition-none"
      >
        <DocsHeader
          locale={contentLocale}
          tabs={tabs}
          activeTab={active}
          languagePaths={languagePaths(resolved)}
          languageNames={DOCS_LANGUAGE_NAMES}
          menu={
            tab ? (
              <div id="mobile-nav">
                <SidebarNav id="">{navItems}</SidebarNav>
              </div>
            ) : null
          }
        />
        <div id="docs-body" className="docs-body">
          {tab ? (
            <DocsSidebar items={navItems} current={current} label="Pages" />
          ) : null}
          <main id="content-container">
            <div className="content-row @container">
              {wide ? null : (
                <div
                  id="content-side-layout"
                  data-api-example={api ? "" : undefined}
                  className="[html[data-ask=docked]_&]:@max-[58rem]:!hidden"
                >
                  {api ? (
                    examples
                  ) : (
                    <DocsToc
                      toc={loaded.toc}
                      label={strings.onThisPage}
                      icon={<TocIcon className="toc-icon" />}
                    />
                  )}
                </div>
              )}
              {/* The article: selecting text in it offers "Ask AI about
                  this" (DOCS_ASK_SELECTION_ATTR). */}
              <div id="content-area" data-docs-ask-selection="">
                <header id="header">
                  <div className="page-heading">
                    {crumbs.length ? (
                      <nav aria-label="Breadcrumb" className="breadcrumbs">
                        <ol className="breadcrumb-list">
                          {crumbs.map((c, i) => (
                            <li
                              key={i}
                              className="breadcrumb-item"
                              data-breadcrumb-title={c}
                            >
                              {i > 0 ? (
                                <ChevronIcon
                                  className="breadcrumb-sep"
                                  strokeWidth={2.5}
                                />
                              ) : null}
                              <span>{c}</span>
                            </li>
                          ))}
                        </ol>
                      </nav>
                    ) : null}
                    <div className="page-title-row">
                      <h1 id="page-title">{fm.title}</h1>
                    </div>
                  </div>
                  {fm.description ? (
                    <div className="page-description prose">
                      <p>{smartQuotes(smartPunctuation(fm.description))}</p>
                    </div>
                  ) : null}
                  <PageActions
                    markdownUrl={markdownPath(page.url)}
                    strings={strings}
                  />
                </header>
                {api ? (
                  <div className="api-examples-inline [html[data-ask=docked]_&]:@max-[58rem]:!flex">
                    {examples}
                  </div>
                ) : null}
                <div
                  id="content"
                  className="mdx-content prose"
                  data-page-title={fm.title}
                  data-page-href={page.url}
                >
                  <MDX components={docsComponents} />
                </div>
                <Pagination previous={previous} next={next} />
              </div>
            </div>
          </main>
        </div>
        <DocsFooter locale={contentLocale} developers />
        <DocsScripts />
      </div>
    </>
  );
}

export async function docsMetadata(
  locale: string,
  slugs: string[],
): Promise<Metadata> {
  const resolved = resolveDocsPage(locale, slugs);
  if (!resolved) return {};
  return docsPageMetadata(resolved);
}
