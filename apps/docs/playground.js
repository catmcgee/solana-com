/*
 * "Open in Playground" control on every code block (styles/playground.css).
 *
 * Mintlify injects this file on every page. It adds one small control to the
 * toolbar of every Mintlify code block (plain and titled fences, CodeGroup
 * panels, Tabs panels, the code above demo terminals, RPC request/response
 * examples), right before Mintlify's own copy button:
 *
 * - ENABLED (a link, new tab) when the block's code comes from a real file in
 *   packages/docs-examples that Solana Playground can import. The generated
 *   example snippets (packages/docs-tooling src/examples/render.ts) put a
 *   hidden marker before each fence, one per tab, in tab order:
 *     <div class="sol-pg" data-pg-src="packages/docs-examples/…/kit.ts"
 *          data-pg-open="packages/docs-examples/…/kit.ts" data-pg-kind="ts">
 *   The link is <origin>/github.com/<SOURCE>/<data-pg-open>; the playground
 *   then reads the files through the GitHub contents API (unauthenticated:
 *   60 requests per hour per reader IP, one request per imported folder).
 * - DISABLED (greyed, aria-disabled, tooltip "Open in Playground: not
 *   available for this snippet yet") for everything else: inline page code,
 *   RPC request/response examples (cURL generated from the Surfpool schema,
 *   no source file), and markers whose kind the playground cannot import
 *   yet (today: all of packages/docs-examples). Recorded outputs of Run
 *   blocks get no control at all. A disabled control never has an href, so there are no dead
 *   links.
 *
 * Why most blocks are disabled today: the playground's GitHub import only
 * accepts Solana *programs* (Anchor: lib.rs with #[program]; Native: a .rs
 * with entrypoint!; Seahorse) and fails with "Could not identify framework"
 * on client code (TS/JS, Rust binaries, Python), which is what
 * packages/docs-examples holds. CONFIG.enabledKinds lists the kinds that import;
 * add "ts", "js", "rust" or "py" here once the playground supports them (no
 * snippet regeneration needed). Kinds are computed by
 * packages/docs-tooling src/examples/playground.ts.
 *
 * Without JavaScript nothing changes: the markers are empty and hidden, and
 * the code blocks are Mintlify's own.
 */
(function () {
  if (window.__solPlayground) return;
  window.__solPlayground = true;

  var CONFIG = {
    origin: "https://solana-playground-two.vercel.app",
    // THE one value for owner/repo/ref the playground imports from. Switch to
    // "solana-foundation/solana-com/tree/main" once mintlify-migration is
    // merged. The ref may not contain "/" (the playground's URL parser stops
    // there). Never prefix "https://": the playground's router collapses
    // "//" and then rejects the URL ("URL path not found").
    source: "catmcgee/solana-com/tree/mintlify-migration",
    enabledKinds: ["anchor", "native"],
  };
  var LABEL = "Open in Playground";
  var UNAVAILABLE = "Not available for this snippet yet";
  // Shown on hover/focus of a disabled control. It names the action too, so
  // icon-only controls still say "Open in Playground" to sighted readers.
  var UNAVAILABLE_TIP = LABEL + ": " + UNAVAILABLE.toLowerCase();
  var SAFE_PATH = /^[\w\-/.]+$/;

  var ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2.25"></rect>' +
    '<path d="M6.5 5.75v4.5L10.25 8z"></path></svg>';

  function markersFor(box) {
    // Markers sit right before the code block (or before the first-child
    // wrapper Mintlify puts around it).
    var el = box;
    for (var depth = 0; el && depth < 4; depth++) {
      var list = [];
      var prev = el.previousElementSibling;
      while (prev && prev.classList.contains("sol-pg")) {
        list.unshift(prev);
        prev = prev.previousElementSibling;
      }
      if (list.length) return list;
      if (el.previousElementSibling || !el.parentElement) break;
      el = el.parentElement;
    }
    return [];
  }

  function activeIndex(box) {
    var tabs = box.querySelectorAll("[role=tablist] [role=tab]");
    if (!tabs.length) return { index: 0, count: 1 };
    for (var i = 0; i < tabs.length; i++)
      if (tabs[i].getAttribute("aria-selected") === "true")
        return { index: i, count: tabs.length };
    return { index: 0, count: tabs.length };
  }

  /** The playground URL for a marker, or "" when it cannot open. */
  function hrefOf(m) {
    if (!m) return "";
    var open = m.getAttribute("data-pg-open") || "";
    var kind = m.getAttribute("data-pg-kind") || "";
    if (!open || !SAFE_PATH.test(open) || open.indexOf("..") !== -1) return "";
    if (CONFIG.enabledKinds.indexOf(kind) === -1) return "";
    return CONFIG.origin + "/github.com/" + CONFIG.source + "/" + open;
  }

  /** The playground URL for a code block, or "" when it cannot open. */
  function hrefFor(box) {
    var markers = markersFor(box);
    if (!markers.length) return "";
    var active = activeIndex(box);
    // A count mismatch means we cannot tell which file a tab shows.
    if (markers.length !== active.count) return "";
    return hrefOf(markers[active.index]);
  }

  /** A demo terminal has one marker (its example folder) right before it. */
  function termHref(term) {
    var markers = markersFor(term);
    return markers.length === 1 ? hrefOf(markers[0]) : "";
  }

  function makeControl() {
    var a = document.createElement("a");
    a.className = "sol-pg-btn";
    a.innerHTML = ICON + '<span class="sol-pg-label">' + LABEL + "</span>";
    return a;
  }

  function setAttr(el, name, value) {
    if (value === null) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  function apply(ctl, href) {
    if (href) {
      setAttr(ctl, "href", href);
      setAttr(ctl, "target", "_blank");
      setAttr(ctl, "rel", "noopener noreferrer");
      setAttr(ctl, "role", null);
      setAttr(ctl, "tabindex", null);
      setAttr(ctl, "aria-disabled", null);
      setAttr(ctl, "data-tip", LABEL);
      setAttr(ctl, "aria-label", LABEL + " (opens in a new tab)");
    } else {
      setAttr(ctl, "href", null);
      setAttr(ctl, "target", null);
      setAttr(ctl, "rel", null);
      setAttr(ctl, "role", "link");
      setAttr(ctl, "tabindex", "0");
      setAttr(ctl, "aria-disabled", "true");
      setAttr(ctl, "data-tip", UNAVAILABLE_TIP);
      setAttr(ctl, "aria-label", UNAVAILABLE_TIP);
    }
  }

  function boxOf(el) {
    return el.closest(".code-group") || el.closest(".code-block");
  }

  /*
   * Demo terminals (.sol-term, generated by docs-tooling gen:paths) show the
   * code they run as command lines, sometimes on pages with no code block
   * (e.g. /docs/payments/checkout/try-it). Their header gets the control too,
   * before the terminal's own Copy button. gen:paths puts one marker before
   * each terminal: the example folder its steps run from (kind "ts" etc.,
   * so disabled until the playground imports client code).
   */
  function scanTerminals() {
    var heads = document.querySelectorAll(".sol-term > .sol-term-head");
    for (var i = 0; i < heads.length; i++) {
      var head = heads[i];
      if (!head.parentElement.querySelector(".sol-term-cmd")) continue;
      var ctl = head.querySelector(":scope > .sol-pg-btn");
      if (!ctl) {
        ctl = makeControl();
        head.insertBefore(ctl, head.querySelector(":scope > .sol-term-copy"));
        head.classList.add("sol-term-head-pg");
      }
      apply(ctl, termHref(head.parentElement));
    }
  }

  function scan() {
    var copies = document.querySelectorAll(".code-block-copy-button");
    for (var i = 0; i < copies.length; i++) {
      var copy = copies[i];
      var bar = copy.parentElement;
      var box = boxOf(copy);
      if (!bar || !box) continue;
      // Recorded output of a Run block is not code to open.
      if (box.closest(".sol-run-out")) continue;
      var ctl = null;
      for (var c = bar.firstElementChild; c; c = c.nextElementSibling)
        if (c.classList.contains("sol-pg-btn")) ctl = c;
      if (!ctl) {
        ctl = makeControl();
        bar.insertBefore(ctl, copy);
      }
      apply(ctl, hrefFor(box));
    }
    scanTerminals();
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      scan();
    }, 60);
  }

  if (typeof MutationObserver === "function") {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-selected"],
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", schedule);
  else schedule();

  function onActivate(event) {
    var ctl = event.target.closest && event.target.closest(".sol-pg-btn");
    if (!ctl) return;
    var box = boxOf(ctl);
    // Re-resolve at click time so a just-switched tab is never stale.
    if (box) apply(ctl, hrefFor(box));
    else if (ctl.closest(".sol-term"))
      apply(ctl, termHref(ctl.closest(".sol-term")));
    if (ctl.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      ctl.focus();
    }
  }
  document.addEventListener("click", onActivate, true);
  document.addEventListener(
    "keydown",
    function (event) {
      if (event.key !== " " && event.key !== "Enter") return;
      var ctl = event.target.closest && event.target.closest(".sol-pg-btn");
      // Disabled: swallow; enabled links already follow Enter natively.
      if (ctl && ctl.getAttribute("aria-disabled") === "true")
        event.preventDefault();
    },
    true,
  );

  // For tests and for checking a kind before enabling it for everyone.
  window.solPlayground = { config: CONFIG, refresh: scan };
})();
