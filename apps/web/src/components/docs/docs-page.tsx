import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { TOCItemType } from "fumadocs-core/toc";
import { DocsHeader } from "@/app/[locale]/developers/docs-header";
import { DocsFooter } from "@/app/[locale]/developers/docs-footer";
import { DocsThemePrepaint } from "@/app/[locale]/developers/theme-prepaint";
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
import { languagePaths } from "@/lib/docs/language-paths";
import { DocsSidebar, SidebarNav } from "./docs-sidebar";
import { DocsToc } from "./docs-toc.client";
import { PageActions } from "./page-actions.client";
import { DocsSearch } from "./docs-search.client";
import { DocsLink } from "./docs-link";
import { ApiExamplesWrapper, docsComponents } from "./docs-components";
import { ChevronIcon, TocIcon } from "./docs-ui-icons";
import { DocsScripts } from "./docs-scripts";
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
  resolved,
  previous,
  next,
}: {
  resolved: ResolvedDocsPage;
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
          <div data-component-part="pagination-title" className="pagination-title">
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
          <div data-component-part="pagination-title" className="pagination-title">
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
  const examples = api ? (
    <MDX components={{ ...docsComponents, wrapper: ApiExamplesWrapper }} />
  ) : null;

  return (
    <>
      <DocsThemePrepaint />
      {/* For agents reading the HTML: where the Markdown index is. */}
      <blockquote className="sr-only" data-agent-docs-index="true" aria-hidden="true">
        <h2>Documentation Index</h2>
        <p>
          Fetch the complete documentation index at:{" "}
          <a href="/llms.txt" tabIndex={-1}>
            /llms.txt
          </a>
        </p>
        <p>
          Use this file to discover all available pages before exploring
          further.
        </p>
      </blockquote>
      <div data-docs="" data-dev-landing="docs" data-mode={wide ? "wide" : undefined} lang={contentLocale === locale ? undefined : contentLocale}>
        <DocsHeader
          locale={contentLocale}
          tabs={tabs}
          activeTab={active}
          inPageSearch
          languagePaths={languagePaths(resolved)}
          menu={
            tab ? (
              <div id="mobile-nav">
                <SidebarNav tab={tab} current={current} id="" />
              </div>
            ) : null
          }
        />
        <div id="docs-body" className="docs-body">
          {tab ? (
            <DocsSidebar tab={tab} current={current} label="Pages" />
          ) : null}
          <main id="content-container">
            <div className="content-row">
              {wide ? null : (
                <div
                  id="content-side-layout"
                  data-api-example={api ? "" : undefined}
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
              <div id="content-area">
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
                                <ChevronIcon className="breadcrumb-sep" />
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
                      <p>{fm.description}</p>
                    </div>
                  ) : null}
                  <PageActions
                    markdownUrl={markdownPath(page.url)}
                    strings={strings}
                  />
                </header>
                {api ? (
                  <div className="api-examples-inline">{examples}</div>
                ) : null}
                <div
                  id="content"
                  className="mdx-content prose"
                  data-page-title={fm.title}
                  data-page-href={page.url}
                >
                  <MDX components={docsComponents} />
                </div>
                <Pagination
                  resolved={resolved}
                  previous={previous}
                  next={next}
                />
              </div>
            </div>
          </main>
        </div>
        <DocsFooter locale={contentLocale} />
        <DocsSearch locale={contentLocale} />
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
