"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDocsSearch } from "fumadocs-core/search/client";
import { DOCS_SEARCH_OPEN_EVENT } from "@solana-com/ui-chrome/docs-search";
import "./docs-search.css";

/**
 * Docs search: Fumadocs' search client against /api/docs-search, for the
 * page's locale. Mounted once on every apps/web page ([locale]/layout.tsx),
 * so it opens in place: from the docs header's field and search icon
 * (docs-header.client.tsx), the solana.com header's search (ui-chrome
 * SearchBar), ⌘K / Ctrl+K and the Ask AI menu (`openDocsSearch`). It also
 * opens on arrival with `?q=<text>` or `?search=1` (the no-JS docs header
 * form, and the header search in apps/media and apps/templates), which it
 * then removes from the URL.
 */
export function DocsSearch({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { search, setSearch, query } = useDocsSearch({
    type: "fetch",
    api: "/api/docs-search",
    locale,
  });

  useEffect(() => {
    const onOpen = (event: Event) => {
      const q = (event as CustomEvent<{ query?: string }>).detail?.query;
      if (q) setSearch(q);
      setOpen(true);
    };
    window.addEventListener(DOCS_SEARCH_OPEN_EVENT, onOpen);
    // Hand-off from another app or the no-JS form.
    const params = new URLSearchParams(window.location.search);
    if (params.has("q") || params.get("search") === "1") {
      setSearch((params.get("q") ?? "").slice(0, 200));
      setOpen(true);
      params.delete("q");
      if (params.get("search") === "1") params.delete("search");
      const rest = params.toString();
      history.replaceState(
        history.state,
        "",
        location.pathname + (rest ? `?${rest}` : "") + location.hash,
      );
    }
    return () => window.removeEventListener(DOCS_SEARCH_OPEN_EVENT, onOpen);
  }, [setSearch]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      input.current?.focus();
    } else if (!open && el.open) el.close();
  }, [open]);

  const results = query.data === "empty" ? [] : (query.data ?? []);
  const pages = results.filter((r) => r.type === "page").slice(0, 20);

  return (
    <dialog
      ref={dialog}
      className="docs-search"
      aria-label="Search"
      onClose={() => setOpen(false)}
      onClick={(event) => {
        if (event.target === dialog.current) setOpen(false);
      }}
    >
      <div className="docs-search-box">
        <div className="docs-search-field">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={input}
            id="search-input"
            type="search"
            value={search}
            placeholder="Search Solana docs"
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              // A type="search" field takes the first Escape to clear
              // itself, so the dialog would need two; close it on the first.
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              } else if (event.key === "Enter" && pages[0]) {
                setOpen(false);
                router.push(pages[0].url);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        {search ? (
          <ul className="docs-search-results" role="listbox">
            {query.isLoading && !pages.length ? (
              <li className="docs-search-empty">…</li>
            ) : pages.length ? (
              pages.map((r) => (
                <li key={r.id} role="option" aria-selected="false">
                  <a
                    href={r.url}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey) return;
                      event.preventDefault();
                      setOpen(false);
                      router.push(r.url);
                    }}
                  >
                    {r.breadcrumbs?.length ? (
                      <span className="docs-search-crumbs">
                        {r.breadcrumbs.join(" › ")}
                      </span>
                    ) : null}
                    <span className="docs-search-title">{r.content}</span>
                  </a>
                </li>
              ))
            ) : (
              <li className="docs-search-empty">No results</li>
            )}
          </ul>
        ) : null}
      </div>
    </dialog>
  );
}
