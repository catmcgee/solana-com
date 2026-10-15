/**
 * Mintlify integration for the solana.com header (header bundle runtime).
 *
 * The header is the unmodified ui-chrome component. These document-level
 * listeners connect its controls to Mintlify, without touching its markup:
 *
 * - Search button (InkeepSearchBar): opens Mintlify's search, like Cmd/Ctrl K.
 * - Language menu items (LanguageSelector, desktop and mobile sheet): switch
 *   the docs language through Mintlify's own language menu, so Mintlify's page
 *   mapping applies; the link's href (`/<locale>/<path>`) is the fallback.
 * - Theme toggle (Header + ThemeProvider): ThemeProvider flips html.dark /
 *   html.light; the new theme is passed on to Mintlify's theme menu so
 *   Mintlify's state (and its storage) follows. Mintlify stays the owner of
 *   the page theme: ThemeProvider's other writes (it forces dark on routes
 *   that are not solana.com "theme routes", e.g. /learn/<slug>) are undone.
 * - Links to solana.com pages: on solana.com they are same-origin (Mintlify
 *   is served under solana.com). On any other host (mint dev, a
 *   *.mintlify.site preview) they open https://solana.com<path>.
 */
import {
  DEFAULT_LOCALE,
  DOCS_LOCALES,
  MINTLIFY_LANGUAGE_CODE,
} from "sol-header:config";
import { beforeLocationChange, getPathname, localeOf } from "./location.js";

const SITE = "https://solana.com";
/** ui-chrome url-config.ts APP_INTERNAL_ROUTES.docs: pages Mintlify serves. */
const DOCS_ROUTES =
  /^\/docs(?:\/|$)|^\/learn\/[^/]|^\/developers\/(?:cookbook|bootcamp)(?:\/|$)/;

const isPlainClick = (e) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function openSearch(root) {
  const wide = window.innerWidth >= 1024;
  const a = document.getElementById("search-bar-entry");
  const b = document.getElementById("search-bar-entry-mobile");
  const el = wide ? a || b : b || a;
  if (!el) return;
  el.click();
  // Move focus into Mintlify's search input (as Inkeep's modal does on
  // solana.com) if Mintlify's dialog does not.
  let tries = 0;
  (function focusInput() {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(
      (d) => d.getBoundingClientRect().height > 0 && !root.contains(d),
    );
    const input = dialog && dialog.querySelector("input");
    if (input) {
      if (!dialog.contains(document.activeElement))
        input.focus({ preventScroll: true });
      return;
    }
    if (++tries < 20) setTimeout(focusInput, 50);
  })();
}

// ---------------------------------------------------------------------------
// Mintlify menus (language, theme), driven off screen
// ---------------------------------------------------------------------------

function viaMintlifyMenu(triggerId, itemId, fallback) {
  const trigger = document.getElementById(triggerId);
  if (!trigger) return fallback();
  const html = document.documentElement;
  html.setAttribute("data-sol-proxy", "");
  const prev = document.activeElement;
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    // Mintlify's menu returns focus to its own (hidden) trigger.
    setTimeout(() => {
      html.removeAttribute("data-sol-proxy");
      if (
        prev &&
        prev !== document.body &&
        prev.isConnected &&
        document.activeElement !== prev
      )
        prev.focus({ preventScroll: true });
    }, 300);
    if (!ok) fallback();
  };
  trigger.click();
  let tries = 0;
  (function poll() {
    const item = document.getElementById(itemId);
    if (item) {
      item.click();
      return finish(true);
    }
    if (++tries > 40) return finish(false);
    setTimeout(poll, 25);
  })();
}

/** `/<locale>/rest` -> `/rest` (docs locales only). */
function stripLocale(href) {
  const first = href.split("/")[1] || "";
  return DOCS_LOCALES.includes(first)
    ? href.slice(first.length + 1) || "/"
    : href;
}

function setLanguage(code, href) {
  if (code === localeOf(getPathname())) return;
  // next-intl always prefixes a locale-changing link (/en/docs/...); the
  // docs' English pages have no prefix.
  const url = code === DEFAULT_LOCALE ? stripLocale(href) : href;
  const mint = MINTLIFY_LANGUAGE_CODE[code];
  if (!mint) {
    window.location.assign(url);
    return;
  }
  viaMintlifyMenu(
    "localization-select-trigger",
    `localization-select-item-${mint}`,
    () => window.location.assign(url),
  );
}

/** Mintlify's theme: data-theme-preference (system | light | dark). */
function mintlifyTheme() {
  const html = document.documentElement;
  const pref = html.getAttribute("data-theme-preference");
  if (pref === "light" || pref === "dark") return pref;
  if (pref === "system")
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  return html.classList.contains("light") ? "light" : "dark";
}

function htmlTheme() {
  return document.documentElement.classList.contains("light")
    ? "light"
    : "dark";
}

function setMintlifyTheme(theme) {
  viaMintlifyMenu(
    "theme-preference-menu-trigger",
    `theme-preference-menu-item-${theme}`,
    () => {
      try {
        localStorage.setItem("isDarkMode", theme);
      } catch {
        // Storage blocked: the page keeps the class ThemeProvider set.
      }
    },
  );
}

/** ThemeProvider reads localStorage "theme"; keep it equal to Mintlify's. */
function seedThemeStorage() {
  try {
    localStorage.setItem("theme", mintlifyTheme());
  } catch {
    // Storage blocked: ThemeProvider falls back to the system theme.
  }
}

function watchTheme(isToggle) {
  let toggled = false;
  document.addEventListener(
    "click",
    (e) => {
      if (isToggle(e.target)) toggled = true;
    },
    true,
  );
  new MutationObserver(() => {
    const now = htmlTheme();
    const mint = mintlifyTheme();
    if (toggled) {
      toggled = false;
      if (now !== mint) setMintlifyTheme(now);
      return;
    }
    if (now !== mint) {
      const cl = document.documentElement.classList;
      cl.remove("dark", "light", "tw-dark", "tw-light");
      cl.add(mint, `tw-${mint}`);
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/**
 * @param root     the #sol-hdr element (header + portal host)
 * @param strings  () => { search, toggle } labels in the page's language
 */
export function connectMintlify(root, strings) {
  seedThemeStorage();
  beforeLocationChange(seedThemeStorage);

  const inHeader = (el) => el instanceof Element && root.contains(el);
  const toggleButton = (el) =>
    inHeader(el) &&
    el.closest(`button[aria-label="${CSS.escape(strings().toggle)}"]`);
  watchTheme(toggleButton);

  // The link under the pointer, read in the capture phase: Radix may unmount
  // a menu item (closing its menu) before the click reaches the document.
  let pending = null;
  document.addEventListener(
    "click",
    (e) => {
      pending = null;
      if (!inHeader(e.target)) return;
      const a = e.target.closest("a[href]");
      if (a)
        pending = {
          href: a.getAttribute("href"),
          lang: a.getAttribute("hreflang"),
          inMenu: !!a.closest('[role="menu"]'),
        };
    },
    true,
  );

  // Bubble phase: after the component's own handlers (Radix, next-intl).
  document.addEventListener("click", (e) => {
    const link = pending;
    pending = null;
    if (inHeader(e.target)) {
      const search = e.target.closest(
        `button[aria-label="${CSS.escape(strings().search)}"]`,
      );
      if (search) {
        openSearch(root);
        return;
      }
    }
    if (!link || e.defaultPrevented || !isPlainClick(e)) return;
    const here = getPathname();
    const self = link.href === here || stripLocale(link.href) === here;
    if (link.inMenu && (link.lang || self)) {
      // A language item: another language, or this page's own (a no-op).
      e.preventDefault();
      if (link.lang) setLanguage(link.lang, link.href);
      return;
    }
    if (
      link.href.startsWith("/") &&
      !link.href.startsWith("//") &&
      !DOCS_ROUTES.test(stripLocale(link.href)) &&
      !/(^|\.)solana\.com$/.test(window.location.hostname)
    ) {
      e.preventDefault();
      window.location.assign(SITE + link.href);
    }
  });
}
