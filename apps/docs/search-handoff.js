/*
 * Search hand-off from solana.com/developers (2026-10-16). The search field
 * in the /developers header (apps/web, developers/docs-header.tsx) cannot
 * search the docs itself, so it navigates here with
 *   /developers/docs?q=<typed text>   or   /developers/docs?search=1   (nothing typed yet)
 * and this script opens Mintlify's search, types the query into it, and
 * removes the parameters from the URL (history.replaceState), so a reload or
 * a shared link does not reopen the search.
 * Mintlify itself also opens the search for ?search=<text> and types <text>,
 * so for ?search=1 it would type "1": the script clears that (and keeps
 * re-applying the query for a second while Mintlify settles, unless the
 * reader has started typing). Mintlify injects every .js file in
 * the project root on every page.
 * Without JavaScript nothing happens and the docs page loads as usual.
 * FRAGILE: relies on Mintlify's #search-bar-entry / #search-bar-entry-mobile
 * buttons and the #search-input combobox in the search dialog.
 */
(function () {
  if (window.__solSearchHandoff) return;
  window.__solSearchHandoff = true;

  var params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (e) {
    return;
  }
  if (!params.has("q") && !params.has("search")) return;
  var query = (params.get("q") || "").trim().slice(0, 200);
  var nativeValue = params.get("search");

  function cleanUrl() {
    params.delete("q");
    params.delete("search");
    var rest = params.toString();
    try {
      history.replaceState(
        history.state,
        "",
        location.pathname + (rest ? "?" + rest : "") + location.hash,
      );
    } catch (e) {}
  }

  function visible(el) {
    return !!(el && el.getClientRects().length);
  }

  function entry() {
    var a = document.getElementById("search-bar-entry");
    var m = document.getElementById("search-bar-entry-mobile");
    if (visible(a)) return a;
    if (visible(m)) return m;
    return null;
  }

  function input() {
    var i = document.getElementById("search-input");
    if (i) return i;
    var dialog = document.querySelector(
      '[data-component-part="search-modal"], [role="dialog"]',
    );
    return dialog ? dialog.querySelector("input:not([type=hidden])") : null;
  }

  function type(el) {
    if (el.value === query) return;
    var setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, query);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    try {
      el.setSelectionRange(query.length, query.length);
    } catch (e) {}
  }

  // Mintlify hydrates after load; poll for the entry button, then for the
  // dialog's input. Give up quietly after about 10 s.
  var tries = 0;
  var clicked = false;
  function step() {
    tries += 1;
    if (tries > 100) return cleanUrl();
    if (!clicked) {
      var e = entry();
      if (e) {
        e.click();
        clicked = true;
      }
      return setTimeout(step, 100);
    }
    var i = input();
    if (!i) {
      // The click may have landed before React attached its handlers.
      if (tries % 10 === 0) clicked = false;
      return setTimeout(step, 100);
    }
    i.focus();
    type(i);
    cleanUrl();
    var typed = false;
    i.addEventListener(
      "keydown",
      function () {
        typed = true;
      },
      { once: true },
    );
    var checks = 0;
    (function settle() {
      checks += 1;
      if (typed || checks > 10) return;
      var cur = input();
      if (cur && (cur.value === "" || cur.value === nativeValue)) type(cur);
      setTimeout(settle, 100);
    })();
  }

  if (document.readyState === "complete") step();
  else window.addEventListener("load", step);
})();
