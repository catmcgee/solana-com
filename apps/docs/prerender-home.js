/*
 * Prerender /developers when the reader hovers (or presses on) the Solana
 * logo in the top bar, so going back to the developer hub (apps/web, same
 * origin) is close to instant. The reverse of the Speculation Rules on
 * /developers (apps/web developers/speculation-rules.tsx). logo-link.js still
 * turns the click into a full page load (location.assign), and the browser
 * activates the prerendered page for it. The header stays put through the
 * cross-document view transition (styles/theme.css section 18).
 * Mintlify injects every .js file in the project root on every page.
 * Browsers without Speculation Rules skip this and navigate as usual.
 * FRAGILE: finds the logo as the link wrapping img.nav-logo, like
 * logo-link.js.
 */
(function () {
  if (window.__solPrerenderHome) return;
  window.__solPrerenderHome = true;

  if (
    !window.HTMLScriptElement ||
    !HTMLScriptElement.supports ||
    !HTMLScriptElement.supports("speculationrules")
  )
    return;

  var script = document.createElement("script");
  script.type = "speculationrules";
  script.textContent = JSON.stringify({
    prerender: [
      {
        source: "document",
        where: {
          selector_matches: [
            "#navbar a:has(img.nav-logo)",
            "#mobile-nav a:has(img.nav-logo)",
            "#sidebar a:has(img.nav-logo)",
          ].join(", "),
        },
        eagerness: "moderate",
      },
    ],
  });
  (document.head || document.documentElement).appendChild(script);
})();
