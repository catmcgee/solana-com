/*
 * OS tabs (.sol-os-tabs around a <Tabs> group with macOS / Linux / Windows
 * tabs, e.g. the Quickstart's "Follow along manually" install steps): moves
 * the reader's operating system to the first position and selects it. The
 * tab order in the content stays macOS, Linux, Windows for anyone without
 * JavaScript or on another OS.
 */
(function () {
  if (window.__solOsTabs) return;
  window.__solOsTabs = true;

  function detectOs() {
    var ua = navigator.userAgent || "";
    var p =
      (navigator.userAgentData && navigator.userAgentData.platform) ||
      navigator.platform ||
      ua;
    if (/win/i.test(p)) return "Windows";
    if (/mac|iphone|ipad|ipod/i.test(p)) return "macOS";
    if (/linux|x11|cros|android/i.test(p)) return "Linux";
    return null;
  }

  var os = detectOs();

  function apply() {
    if (!os) return;
    var boxes = document.querySelectorAll(".sol-os-tabs");
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (box.getAttribute("data-os-applied") === os) continue;
      var tabs = box.querySelectorAll('[role="tab"]');
      for (var j = 0; j < tabs.length; j++) {
        var tab = tabs[j];
        if ((tab.textContent || "").trim().indexOf(os) !== 0) continue;
        box.setAttribute("data-os-applied", os);
        tab.style.order = "-1";
        if (tab.getAttribute("aria-selected") !== "true") tab.click();
        break;
      }
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      apply();
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
