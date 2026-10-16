/*
 * "Set up Solana in one paste" banner on Start here
 * (developers/docs/index.mdx, styles/agent-banner.css).
 *
 * The server-rendered line is plain, selectable text that points at
 * https://solana.com/developers/docs/intro/agent-setup.md. With JavaScript
 * this script:
 * - swaps the https://solana.com prefix for the current origin, so the line
 *   works on previews (not on localhost: `mint dev` serves no `.md` pages);
 * - adds a purple Copy button to the box's title bar that copies the line
 *   exactly as shown (the ">" prompt is CSS, so it is not copied).
 * Without JavaScript the line keeps the solana.com URL and stays selectable.
 */
(function () {
  if (window.__solAgentBanner) return;
  window.__solAgentBanner = true;

  var PROD = "https://solana.com";

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext)
      return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      area.remove();
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }

  var COPY_ICON =
    '<rect x="5" y="5" width="9" height="9" rx="2"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/>';
  var DONE_ICON = '<path d="M3 8.5 6.5 12 13 4.5"/>';

  function setLabel(btn, text, done) {
    btn.innerHTML =
      '<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">' +
      (done ? DONE_ICON : COPY_ICON) +
      "</svg>";
    btn.appendChild(document.createTextNode(text));
  }

  // Idempotent: React may re-render the server markup after hydration, so
  // every scan re-applies the origin swap and re-adds a missing button.
  function enhance(line) {
    var origin = window.location.origin;
    if (
      origin &&
      origin !== PROD &&
      /^https?:\/\//.test(origin) &&
      !/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin) &&
      line.textContent.indexOf(PROD + "/") !== -1
    ) {
      var url = line.querySelector(".sol-agent-banner-url") || line;
      url.textContent = url.textContent.split(PROD + "/").join(origin + "/");
    }

    // Let a long URL wrap only after a slash, never mid-word. <wbr> adds no
    // text, so Copy still copies the plain line.
    var span = line.querySelector(".sol-agent-banner-url");
    if (span && !span.querySelector("wbr")) {
      var parts = span.textContent.split("/");
      span.textContent = "";
      parts.forEach(function (part, i) {
        if (i) {
          span.appendChild(document.createTextNode("/"));
          span.appendChild(document.createElement("wbr"));
        }
        span.appendChild(document.createTextNode(part));
      });
    }

    var term = line.closest(".sol-agent-banner-term");
    var box =
      (term && term.querySelector(".sol-agent-banner-head")) ||
      line.parentElement;
    if (!box || box.querySelector(".sol-agent-banner-btn")) return;
    var label = line.getAttribute("data-copy") || "Copy";
    var done = line.getAttribute("data-copied") || "Copied";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sol-agent-banner-btn";
    setLabel(btn, label, false);
    btn.setAttribute("aria-label", label + ": " + line.textContent);
    var timer;
    btn.addEventListener("click", function () {
      copy(line.textContent).then(
        function () {
          setLabel(btn, done, true);
          btn.setAttribute("data-copied", "true");
          clearTimeout(timer);
          timer = setTimeout(function () {
            setLabel(btn, label, false);
            btn.removeAttribute("data-copied");
          }, 2000);
        },
        function () {},
      );
    });
    box.appendChild(btn);
  }

  function scan() {
    var lines = document.querySelectorAll(".sol-agent-banner-line");
    for (var i = 0; i < lines.length; i++) enhance(lines[i]);
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

  if (typeof MutationObserver === "function")
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", schedule);
  else schedule();
})();
