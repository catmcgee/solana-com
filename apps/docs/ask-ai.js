/*
 * Floating "Ask AI" pill, bottom right (redesign 2026-10-15), matching the
 * pill on solana.com/developers. Mintlify injects every .js file in the
 * project root on every page.
 *
 * - When Mintlify's assistant is available (paid plans render
 *   #assistant-entry, which styles/theme.css hides from the top bar), the
 *   pill opens it.
 * - Otherwise (Hobby), the pill opens a small menu: ask Claude or ChatGPT
 *   about the current page (the same links as the page's contextual menu),
 *   or open the docs search.
 * Styles: styles/ask-ai.css. Without JavaScript nothing is added, and the
 * page's own "Copy page" menu still offers the same options.
 */
(function () {
  if (window.__solAskAi) return;
  window.__solAskAi = true;

  var ICON =
    '<svg aria-hidden="true" width="16" height="14" viewBox="0 0 16 14" fill="none"><defs><linearGradient id="sol-ask-g" x1="1.35" y1="14.33" x2="14.16" y2="-0.43" gradientUnits="userSpaceOnUse"><stop offset="0.08" stop-color="#9945FF"/><stop offset="0.3" stop-color="#8752F3"/><stop offset="0.5" stop-color="#5497D5"/><stop offset="0.6" stop-color="#43B4CA"/><stop offset="0.72" stop-color="#28E0B9"/><stop offset="0.97" stop-color="#14F195"/></linearGradient></defs><path fill="url(#sol-ask-g)" d="M15.9162 11.0381L13.2749 13.809C13.2178 13.8692 13.1486 13.9172 13.0716 13.95C12.9947 13.9829 12.9117 13.9999 12.8277 14H0.306886C0.247168 14 0.188756 13.9829 0.138801 13.9509C0.0888472 13.9189 0.0495192 13.8733 0.0256329 13.8197C0.00174657 13.7662 -0.00566129 13.707 0.00431634 13.6494C0.014294 13.5918 0.0412241 13.5383 0.0818091 13.4954L2.72013 10.7246C2.77725 10.6644 2.84644 10.6164 2.92338 10.5835C3.00031 10.5507 3.08335 10.5336 3.1673 10.5336H15.6881C15.7484 10.5323 15.8077 10.5486 15.8585 10.5803C15.9094 10.6119 15.9495 10.6576 15.9739 10.7115C15.9983 10.7655 16.0058 10.8253 15.9955 10.8834C15.9853 10.9415 15.9577 10.9953 15.9162 11.0381ZM13.2749 5.45712C13.2175 5.39721 13.1483 5.34937 13.0714 5.31652C12.9945 5.28368 12.9116 5.26651 12.8277 5.26608H0.306886C0.247168 5.26611 0.188756 5.28318 0.138801 5.3152C0.0888472 5.34721 0.0495192 5.39279 0.0256329 5.44633C0.00174657 5.49988 -0.00566129 5.55908 0.00431634 5.61669C0.014294 5.67429 0.0412241 5.7278 0.0818091 5.77066L2.72013 8.54294C2.77747 8.60285 2.84671 8.65069 2.92359 8.68354C3.00048 8.71639 3.0834 8.73355 3.1673 8.73398H15.6881C15.7477 8.73367 15.8059 8.71639 15.8557 8.68427C15.9054 8.65214 15.9445 8.60655 15.9682 8.55306C15.9919 8.49957 15.9992 8.44049 15.9891 8.38302C15.9791 8.32554 15.9522 8.27217 15.9117 8.2294L13.2749 5.45712ZM0.306886 3.46651H12.8277C12.9117 3.46644 12.9947 3.44944 13.0716 3.41657C13.1486 3.3837 13.2178 3.33566 13.2749 3.27547L15.9162 0.504645C15.9471 0.472622 15.9705 0.434302 15.9846 0.392425C15.9986 0.350548 16.0031 0.306148 15.9975 0.262399C15.992 0.21865 15.9767 0.176632 15.9527 0.13935C15.9286 0.102067 15.8965 0.0704405 15.8585 0.0467307C15.8076 0.0150784 15.7484 -0.00115781 15.6881 6.42451e-05H3.1673C3.08335 0.000150701 3.00031 0.0171585 2.92338 0.0500271C2.84644 0.0828956 2.77725 0.13092 2.72013 0.191105L0.0818091 2.96193C0.0412241 3.00479 0.014294 3.05829 0.00431634 3.1159C-0.00566129 3.1735 0.00174657 3.2327 0.0256329 3.28625C0.0495192 3.3398 0.0888472 3.38537 0.138801 3.41739C0.188756 3.4494 0.247168 3.46647 0.306886 3.46651Z"/></svg>';

  function assistant() {
    var a = document.getElementById("assistant-entry");
    var m = document.getElementById("assistant-entry-mobile");
    return window.innerWidth >= 1024 ? a || m : m || a;
  }

  function pageMd() {
    var u = location.origin + location.pathname.replace(/\/$/, "");
    return u + ".md";
  }

  function prompt() {
    return "Read " + pageMd() + " so I can ask questions about it.";
  }

  function item(label, sub, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.className = "sol-ask-item";
    b.innerHTML = "<b></b><span></span>";
    b.firstChild.textContent = label;
    b.lastChild.textContent = sub;
    b.addEventListener("click", function () {
      close();
      onClick();
    });
    return b;
  }

  var root, btn, menu;

  function close() {
    if (!menu) return;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  function open() {
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    var first = menu.querySelector("button");
    if (first) first.focus();
  }

  function build() {
    if (document.getElementById("sol-ask-ai")) return;
    root = document.createElement("div");
    root.id = "sol-ask-ai";
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sol-ask-pill";
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = ICON + "<span>Ask AI</span>";
    menu = document.createElement("div");
    menu.className = "sol-ask-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Ask AI");
    menu.hidden = true;
    menu.appendChild(
      item("Ask Claude", "About this page, in claude.ai", function () {
        window.open(
          "https://claude.ai/new?q=" + encodeURIComponent(prompt()),
          "_blank",
          "noopener",
        );
      }),
    );
    menu.appendChild(
      item("Ask ChatGPT", "About this page, in chatgpt.com", function () {
        window.open(
          "https://chatgpt.com/?hints=search&prompt=" +
            encodeURIComponent(prompt()),
          "_blank",
          "noopener",
        );
      }),
    );
    menu.appendChild(
      item("Search the docs", "Ctrl K", function () {
        var s =
          document.getElementById("search-bar-entry") ||
          document.getElementById("search-bar-entry-mobile");
        if (s) s.click();
      }),
    );
    btn.addEventListener("click", function () {
      var a = assistant();
      if (a) {
        close();
        a.click();
        return;
      }
      if (menu.hidden) open();
      else close();
    });
    root.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        close();
        btn.focus();
      }
    });
    document.addEventListener("click", function (e) {
      if (root && !root.contains(e.target)) close();
    });
    root.appendChild(menu);
    root.appendChild(btn);
    document.body.appendChild(root);
    document.documentElement.setAttribute("data-sol-ask-ai", "");
  }

  function start() {
    build();
    // Client-side navigation can replace <body> children; put the pill back.
    setInterval(build, 2000);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
