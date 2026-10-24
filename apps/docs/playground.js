/*
 * "Open tutorial in Playground" (styles/playground.css).
 *
 * apps/web loads this script on every docs page
 * (components/docs/docs-scripts.tsx). Each tutorial has exactly one
 * Playground entry point: a block at the top of its intro page (or, for a
 * single-page tutorial, at the top of the page). Code blocks, demo
 * terminals, and step pages have none.
 *
 * - Job tutorials: docs-tooling gen:paths renders the block as
 *   snippets/paths/<lang>/<key>/playground.mdx, imported once on the
 *   tutorial's intro page. Single-page tutorials (e.g.
 *   /developers/docs/programs/build-first-program) write the same markup by
 *   hand.
 * - The button is `<a class="sol-pg-tut" data-pg-open="packages/docs-
 *   examples/…" data-pg-kind="…" data-pg-label="…" data-pg-off="…">`,
 *   server-rendered DISABLED (no href, greyed, aria-disabled, tooltip).
 *   data-pg-open is the folder to import, data-pg-kind its kind (computed by
 *   packages/docs-tooling src/examples/playground.ts).
 * - This script turns it into a link (new tab) to
 *   <origin>/github.com/<SOURCE>/<data-pg-open> when the kind is in
 *   CONFIG.enabledKinds; otherwise it stays disabled with the data-pg-off
 *   tooltip. The playground then reads the files through the GitHub
 *   contents API (unauthenticated: 60 requests per hour per reader IP, one
 *   request per imported folder).
 *
 * Why the job tutorials are disabled today: the playground's GitHub import
 * only accepts Solana *programs* (Anchor: lib.rs with #[program]; Native: a
 * .rs with entrypoint!; Seahorse) and fails with "Could not identify
 * framework" on client code (TS/JS, Rust binaries, Python), which is what
 * their example folders hold. Add "ts", "js", "rust" or "py" to
 * CONFIG.enabledKinds once the playground supports them (no regeneration
 * needed).
 *
 * Without JavaScript the buttons stay disabled (no href, greyed, tooltip),
 * so there are no dead links.
 */
(function () {
  if (window.__solPlayground) return;
  window.__solPlayground = true;

  var CONFIG = {
    origin: "https://solana-playground-two.vercel.app",
    // THE one value for owner/repo/ref the playground imports from. Switch to
    // solana-foundation/solana-com/tree/main once docs-redesign is merged.
    // The ref may not contain "/" (the playground's URL parser stops
    // there). Never prefix "https://": the playground's router collapses
    // "//" and then rejects the URL ("URL path not found").
    source: "catmcgee/solana-com/tree/docs-redesign",
    enabledKinds: ["anchor", "native"],
  };
  var LABEL = "Open tutorial in Playground";
  var SAFE_PATH = /^[\w\-/.]+$/;

  /** The playground URL for a button, or "" when it cannot open. */
  function hrefOf(btn) {
    var open = btn.getAttribute("data-pg-open") || "";
    var kind = btn.getAttribute("data-pg-kind") || "";
    if (!open || !SAFE_PATH.test(open) || open.indexOf("..") !== -1) return "";
    if (CONFIG.enabledKinds.indexOf(kind) === -1) return "";
    return CONFIG.origin + "/github.com/" + CONFIG.source + "/" + open;
  }

  function setAttr(el, name, value) {
    if (value === null) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  function apply(btn) {
    var href = hrefOf(btn);
    // The buttons carry their own (localized) wording.
    var label = btn.getAttribute("data-pg-label") || LABEL;
    var off = btn.getAttribute("data-pg-off") || label;
    if (href) {
      setAttr(btn, "href", href);
      setAttr(btn, "target", "_blank");
      setAttr(btn, "rel", "noopener noreferrer");
      setAttr(btn, "role", null);
      setAttr(btn, "tabindex", null);
      setAttr(btn, "aria-disabled", null);
      setAttr(btn, "data-tip", label);
      setAttr(btn, "aria-label", label + " (opens in a new tab)");
    } else {
      setAttr(btn, "href", null);
      setAttr(btn, "target", null);
      setAttr(btn, "rel", null);
      setAttr(btn, "role", "link");
      setAttr(btn, "tabindex", "0");
      setAttr(btn, "aria-disabled", "true");
      setAttr(btn, "data-tip", off);
      setAttr(btn, "aria-label", off);
    }
  }

  function scan() {
    var btns = document.querySelectorAll(".sol-pg-tut");
    for (var i = 0; i < btns.length; i++) apply(btns[i]);
  }

  // The docs navigate client-side, so new pages arrive as DOM mutations.
  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      scan();
    }, 60);
  }
  if (typeof MutationObserver === "function")
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", schedule);
  else schedule();

  function closestButton(event) {
    return event.target.closest && event.target.closest(".sol-pg-tut");
  }
  document.addEventListener(
    "click",
    function (event) {
      var btn = closestButton(event);
      if (!btn) return;
      apply(btn);
      if (btn.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
        btn.focus();
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    function (event) {
      if (event.key !== " " && event.key !== "Enter") return;
      var btn = closestButton(event);
      // Disabled: swallow; enabled links already follow Enter natively.
      if (btn && btn.getAttribute("aria-disabled") === "true")
        event.preventDefault();
    },
    true,
  );

  // For tests and for checking a kind before enabling it for everyone.
  window.solPlayground = { config: CONFIG, refresh: scan };
})();
