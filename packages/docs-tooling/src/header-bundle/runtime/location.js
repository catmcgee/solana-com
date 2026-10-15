/**
 * The browser location as a React external store (header bundle runtime).
 *
 * The next/navigation shims read the page path from here. Mintlify is a
 * Next.js app and navigates with history.pushState, so the store wraps
 * pushState/replaceState and listens to popstate; subscribers are told after
 * the URL has changed (in a microtask, never inside Mintlify's own render).
 */
import { DOCS_LOCALES, DEFAULT_LOCALE } from "sol-header:config";

const listeners = new Set();
const before = new Set();
let scheduled = false;

function notify() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    before.forEach((fn) => fn());
    listeners.forEach((fn) => fn());
  });
}

if (typeof window !== "undefined" && !window.__solHeaderHistory) {
  window.__solHeaderHistory = true;
  for (const method of ["pushState", "replaceState"]) {
    const original = window.history[method];
    window.history[method] = function (...args) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
  }
  window.addEventListener("popstate", notify);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Runs before the React subscribers on every location change. */
export function beforeLocationChange(fn) {
  before.add(fn);
}

export const getPathname = () => window.location.pathname;
export const getSearch = () => window.location.search;

/** The docs locale of a path (its first segment when it is a docs locale). */
export function localeOf(pathname) {
  const first = pathname.split("/")[1] || "";
  return first !== DEFAULT_LOCALE && DOCS_LOCALES.includes(first)
    ? first
    : DEFAULT_LOCALE;
}
