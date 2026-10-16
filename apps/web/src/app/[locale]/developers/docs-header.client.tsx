"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DOCS_THEME_STORAGE_KEY } from "./theme-prepaint";

/*
 * Client islands for the docs header on /developers (docs-header.tsx). The
 * header is server-rendered and works without JavaScript: the tabs and
 * language links are plain anchors, the menus are <details>, and the search
 * field is a GET form to the docs. These add the theme toggle, the docs
 * search hand-off on click and ⌘K/Ctrl+K, and closing the menus on Escape or
 * an outside click.
 */

type Theme = "light" | "dark";
type Preference = Theme | "system";

function readPreference(): Preference {
  let value: string | null = null;
  try {
    value = window.localStorage.getItem(DOCS_THEME_STORAGE_KEY);
  } catch {
    value = null;
  }
  if (value === "true") return "dark";
  if (value === "false") return "light";
  return value === "light" || value === "dark" ? value : "system";
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Same rule as DOCS_THEME_PREPAINT_SCRIPT and Mintlify (next-themes). */
function applyPreference(preference: Preference) {
  const theme = preference === "system" ? systemTheme() : preference;
  const html = document.documentElement;
  html.classList.remove("dark", "tw-dark", "light", "tw-light");
  html.classList.add(theme, `tw-${theme}`);
  html.setAttribute("data-theme-preference", preference);
  html.setAttribute("data-dh-js", "");
  html.style.colorScheme = theme;
}

function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * One-click light/dark switch, like the docs (apps/docs/theme-toggle.js): the
 * icon is the mode a click switches to (moon in light mode, sun in dark), and
 * the choice is stored in localStorage "isDarkMode", which Mintlify reads on
 * /docs, so it carries over both ways. Until the first click the theme
 * follows the system. Hidden without JavaScript (developers.css).
 */
export function ThemeToggle({
  toDark,
  toLight,
  className = "dh-theme",
  children,
}: {
  toDark: string;
  toLight: string;
  className?: string;
  /** Optional visible text (mobile menu). */
  children?: (theme: Theme | null) => ReactNode;
}) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Inline scripts do not run on client-side navigation, so apply the
    // stored preference here too (a no-op after the pre-paint script).
    applyPreference(readPreference());
    setTheme(currentTheme());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (readPreference() === "system") applyPreference("system");
    };
    // Another tab (the docs, say) changed the choice.
    const onStorage = (event: StorageEvent) => {
      if (event.key === DOCS_THEME_STORAGE_KEY || event.key === null)
        applyPreference(readPreference());
    };
    // Keep every toggle instance (header, mobile menu) in sync.
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    media.addEventListener("change", onSystem);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystem);
      window.removeEventListener("storage", onStorage);
      observer.disconnect();
      // Leaving /developers: the rest of the site manages its own scheme.
      document.documentElement.style.colorScheme = "";
    };
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = theme === "dark" ? toLight : toDark;

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      data-theme-toggle=""
      onClick={() => {
        try {
          window.localStorage.setItem(DOCS_THEME_STORAGE_KEY, next);
        } catch {
          // Storage blocked: the switch still applies to this page view.
        }
        applyPreference(next);
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className="dh-icon dh-icon-moon"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className="dh-icon dh-icon-sun"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
      {children?.(theme)}
    </button>
  );
}

function searchUrl(base: string, query: string) {
  const q = query.trim();
  return q ? `${base}?q=${encodeURIComponent(q)}` : `${base}?search=1`;
}

/**
 * The docs search field. It cannot search from here, so it hands off to the
 * docs: clicking it, or ⌘K / Ctrl+K anywhere on the page, goes to
 * `<docs>?search=1` (or `?q=<text>` once something is typed), where
 * apps/docs/search-handoff.js opens Mintlify's search with the text.
 * Keyboard focus alone does not navigate (WCAG 3.2.1 On Focus): keyboard
 * users can type and press Enter. Without JavaScript the form submits to
 * `<docs>?q=<text>`.
 */
export function DocsSearchField({
  action,
  prompt,
}: {
  /** Localized docs root, e.g. "/docs" or "/ja/docs". */
  action: string;
  prompt: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [mac, setMac] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        window.location.assign(searchUrl(action, input.current?.value ?? ""));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action]);

  return (
    <form
      role="search"
      action={action}
      method="get"
      className="dh-search"
      data-ready={ready ? "" : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        window.location.assign(searchUrl(action, input.current?.value ?? ""));
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className="dh-icon"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        ref={input}
        type="search"
        name="q"
        aria-label={prompt}
        placeholder={prompt}
        autoComplete="off"
        enterKeyHint="search"
        onClick={(event) =>
          window.location.assign(searchUrl(action, event.currentTarget.value))
        }
      />
      <kbd aria-hidden="true">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </form>
  );
}

/**
 * Closes the header's <details> menus (language, mobile menu) on Escape, on
 * a click outside, and when another one opens. Renders nothing.
 */
export function HeaderMenus({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const menus = () =>
      Array.from(root.querySelectorAll<HTMLDetailsElement>("details[open]"));
    const onClick = (event: MouseEvent) => {
      for (const menu of menus())
        if (!menu.contains(event.target as Node)) menu.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const open = menus();
      if (!open.length) return;
      const last = open[open.length - 1]!;
      last.open = false;
      last.querySelector("summary")?.focus();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [rootId]);
  return null;
}
