/*
 * "Set up your coding agent for Solana" banner on Start here
 * (developers/docs/index.mdx, styles/agent-banner.css).
 *
 * The server-rendered line is plain, selectable text that points at
 * https://solana.com/developers/docs/intro/agent-setup.md. With JavaScript
 * this script:
 * - swaps the https://solana.com prefix for the current origin, so the line
 *   works on previews (not on localhost: `mint dev` serves no `.md` pages);
 * - adds a Copy button that copies the line exactly as shown.
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
    )
      line.textContent = line.textContent.split(PROD + "/").join(origin + "/");
    // The line is truncated to one row (agent-banner.css); show it in full on hover.
    line.title = line.textContent;

    var box = line.parentElement;
    if (!box || box.querySelector(".sol-agent-banner-btn")) return;
    var label = line.getAttribute("data-copy") || "Copy";
    var done = line.getAttribute("data-copied") || "Copied";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sol-agent-banner-btn";
    btn.textContent = label;
    btn.setAttribute("aria-label", label + ": " + line.textContent);
    var timer;
    btn.addEventListener("click", function () {
      copy(line.textContent).then(
        function () {
          btn.textContent = done;
          btn.setAttribute("data-copied", "true");
          clearTimeout(timer);
          timer = setTimeout(function () {
            btn.textContent = label;
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
