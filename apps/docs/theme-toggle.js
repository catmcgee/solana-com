/*
 * One-click light/dark toggle for the top bar (2026-10-16), like the old
 * solana.com docs: a click switches straight to the other mode; the label
 * names the mode it switches to ("Switch to dark mode").
 * Mintlify injects every .js file in the project root on every page.
 *
 * Luma's #theme-preference-menu-trigger opens a System/Light/Dark menu.
 * To keep Mintlify's own theme state (next-themes, localStorage "isDarkMode",
 * html[data-theme-preference]) in sync, this script does not set the theme
 * itself: whenever that menu opens (click, Enter or Space), it picks the item
 * for the opposite of the current mode (html.dark), which also closes the
 * menu. styles/theme.css hides the menu while html[data-sol-theme-toggle] is
 * set. The icon stays Luma's (the current preference: system, sun or moon),
 * so the header's first paint is already final. The default stays "system"
 * until the first click. Without JavaScript the button is unchanged.
 * FRAGILE: relies on Mintlify's ids #theme-preference-menu-trigger,
 * #theme-preference-menu-content and #theme-preference-menu-item-{light,dark}.
 */
(function () {
  if (window.__solThemeToggle) return;
  window.__solThemeToggle = true;

  var html = document.documentElement;

  function isDark() {
    return html.classList.contains("dark");
  }

  function sync() {
    var label = isDark() ? "Switch to light mode" : "Switch to dark mode";
    var t = document.getElementById("theme-preference-menu-trigger");
    if (t && t.getAttribute("aria-label") !== label) {
      t.setAttribute("aria-label", label);
      t.setAttribute("title", label);
    }
  }

  var picking = false;
  function pick() {
    var menu = document.getElementById("theme-preference-menu-content");
    if (!menu || picking || !menu.hasAttribute("data-open")) return;
    var item = document.getElementById(
      "theme-preference-menu-item-" + (isDark() ? "light" : "dark"),
    );
    if (!item) return;
    picking = true;
    item.click();
    // The menu closes (and Mintlify re-renders) on the next frames.
    setTimeout(function () {
      picking = false;
      var t = document.getElementById("theme-preference-menu-trigger");
      if (
        t &&
        document.activeElement !== t &&
        !t.contains(document.activeElement)
      )
        t.focus({ preventScroll: true });
      sync();
    }, 150);
  }

  function start() {
    html.setAttribute("data-sol-theme-toggle", "");
    sync();
    // Survives client-side navigation: the observer is on <html>, and it
    // re-applies the label whenever Mintlify re-renders the trigger.
    new MutationObserver(function () {
      pick();
      sync();
    }).observe(html, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "aria-label", "data-open"],
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
