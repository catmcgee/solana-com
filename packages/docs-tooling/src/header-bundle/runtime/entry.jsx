/**
 * Entry of the solana.com header bundle (apps/docs/header.js).
 *
 * Renders the real, unmodified packages/ui-chrome Header with React into
 * every Mintlify page, inside the same providers apps/web gives it
 * (app/[locale]/layout.tsx: NextIntlClientProvider > ThemeProvider >
 * Header). `showDevelopersNav={false}`: the docs tab row below is
 * Mintlify's.
 *
 * Bundle-only pieces (see build.ts for the module map):
 * - shims/next-*: next/link, next/navigation, next/compat/router and
 *   next/dynamic for a page without Next.js (window.location, plain <a>).
 * - shims/radix-portal.jsx: Radix portals render inside #sol-hdr.
 * - adapter.js: search, language and theme go through Mintlify.
 * - Messages: packages/i18n `loadMergedMessages({ app: "web", locale })`
 *   (English fallback merged in, as on solana.com) for the docs locales,
 *   pruned at build time to the keys ui-chrome uses ("sol-header:messages").
 *
 * Mount: #sol-hdr is the first child of <body> (styles/header.css places it
 * over Mintlify's top row and hides that row while html[data-sol-header] is
 * set). Without JavaScript nothing mounts and Mintlify's header stays.
 */
import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { Header } from "sol-ui-chrome/header";
import { ThemeProvider } from "sol-ui-chrome/theme-provider";
import { EN, OVERRIDES } from "sol-header:messages";
import { getPathname, localeOf, subscribe } from "./location.js";
import { PORTAL_HOST_ID } from "./portal-host.js";
import { connectMintlify } from "./adapter.js";

const ROOT_ID = "sol-hdr";
const cache = new Map();

/** English messages with the locale's translated strings applied. */
function messagesFor(locale) {
  if (cache.has(locale)) return cache.get(locale);
  const merged = structuredClone(EN);
  for (const [key, value] of Object.entries(OVERRIDES[locale] ?? {})) {
    const parts = key.split(".");
    let node = merged;
    for (const p of parts.slice(0, -1)) node = node[p];
    node[parts.at(-1)] = value;
  }
  cache.set(locale, merged);
  return merged;
}

function rootDirection(locale) {
  // apps/web: <html dir={getLangDir(locale)}>.
  return locale === "ar" ? "rtl" : "ltr";
}

let current = { locale: "en", messages: EN };

/**
 * header.tsx's bar is <nav id="navbar">, which is also Mintlify's header id:
 * Mintlify's scripts and theme.css's `#navbar ...` rules would find this one.
 * Inside #sol-hdr it becomes data-sol-navbar (the only attribute changed).
 * This is a DOM edit after React commits, not a prop: React never re-applies
 * an unchanged `id`, and the subtree observer in mount() renames any
 * nav#navbar React creates later (re-keyed or re-mounted), before paint.
 */
function renameNavbar(root) {
  for (const nav of root.querySelectorAll("nav#navbar")) {
    nav.removeAttribute("id");
    nav.setAttribute("data-sol-navbar", "");
  }
}

function App({ root }) {
  const pathname = useSyncExternalStore(subscribe, getPathname, getPathname);
  const locale = localeOf(pathname);
  const messages = useMemo(() => messagesFor(locale), [locale]);
  current = { locale, messages };
  useLayoutEffect(() => {
    root.setAttribute("dir", rootDirection(locale));
    root.setAttribute("lang", locale);
    renameNavbar(root);
  });
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThemeProvider>
        <Header showDevelopersNav={false} />
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}

function mount() {
  if (document.getElementById(ROOT_ID)) return;
  if (!document.getElementById("navbar")) return; // not a Mintlify page

  const root = document.createElement("div");
  root.id = ROOT_ID;
  const app = document.createElement("div");
  app.setAttribute("data-sol-hdr-app", "");
  const portals = document.createElement("div");
  portals.id = PORTAL_HOST_ID;
  root.append(app, portals);
  document.body.insertBefore(root, document.body.firstChild);

  connectMintlify(root, () => ({
    search: current.messages.commands.search,
    toggle: current.messages.commands.toggle,
  }));
  createRoot(app).render(<App root={root} />);
  document.documentElement.setAttribute("data-sol-header", "");

  // Any nav#navbar React adds or re-ids later is renamed too.
  new MutationObserver(() => renameNavbar(root)).observe(root, {
    childList: true,
    subtree: true,
    attributeFilter: ["id"],
  });

  // Mintlify can replace <body>'s children (or <body> itself); put the same
  // root back (the React tree lives on in the detached node). Only direct
  // children are watched, so page content updates do not wake this.
  const reattach = () => {
    if (!root.isConnected)
      document.body.insertBefore(root, document.body.firstChild);
  };
  const bodyObserver = new MutationObserver(reattach);
  let body = document.body;
  bodyObserver.observe(body, { childList: true });
  new MutationObserver(() => {
    if (document.body && document.body !== body) {
      body = document.body;
      bodyObserver.disconnect();
      bodyObserver.observe(body, { childList: true });
    }
    if (document.body) reattach();
  }).observe(document.documentElement, { childList: true });
}

if (!window.__solHeader) {
  window.__solHeader = true;
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
}
