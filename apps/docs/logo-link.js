/*
 * The Solana logo in the top bar links to /developers on the same site
 * (docs.json logo.href). Mintlify treats that relative href as a docs route
 * and navigates client-side, so it never reaches the /developers page that
 * apps/web serves on the same domain. This forces a full page load for logo
 * clicks. Modified clicks (new tab, etc.) keep the browser default. Without
 * JavaScript the link is a plain anchor and already does a full load.
 * FRAGILE: finds the logo as the link wrapping img.nav-logo in #navbar.
 */
(function () {
  if (window.__solLogoLink) return;
  window.__solLogoLink = true;

  document.addEventListener(
    "click",
    function (e) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest && e.target.closest("a");
      if (!a || !a.querySelector("img.nav-logo")) return;
      if (!a.closest("#navbar, #mobile-nav, #sidebar")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      window.location.assign(a.getAttribute("href") || "/developers");
    },
    true,
  );
})();
