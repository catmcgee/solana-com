/*
 * In-page video playback for the video tutorials (2026-10-16), restoring what
 * the old docs did with VideoWithChapters and VideoModalTrigger. Mintlify
 * injects every .js file in the project root on every page.
 *
 * The markup is written by the video-guides convert transform
 * (packages/docs-tooling/src/convert/transforms/video-guides.ts):
 * - `.sol-chapters[data-video=<id>]` around a list of `youtu.be/<id>?t=<s>`
 *   links: a click seeks the embedded YouTube player for <id> on the same
 *   page (its iframe `src` is swapped to `?start=<s>&autoplay=1`), scrolls it
 *   into view and marks the chapter as current.
 * - `.sol-video-modal` around cards that link to YouTube: a click opens the
 *   video in an autoplaying <dialog>. Closing it (button, Escape, backdrop)
 *   removes the iframe, which stops playback.
 * Without JavaScript, or with a modifier key / middle click, every link is a
 * plain YouTube link that opens at the same timestamp. Styles:
 * styles/video.css.
 */
(function () {
  if (window.__solVideoChapters) return;
  window.__solVideoChapters = true;

  var EMBED = "https://www.youtube-nocookie.com/embed/";
  var HOSTS =
    /^(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/;
  var ID = /^[\w-]{11}$/;

  /** { id, start } for a single-video YouTube URL, else null. */
  function parse(href) {
    var url;
    try {
      url = new URL(href, location.href);
    } catch {
      return null;
    }
    if (!HOSTS.test(url.hostname)) return null;
    var parts = url.pathname.split("/").filter(Boolean);
    var id =
      url.hostname === "youtu.be"
        ? parts[0]
        : parts[0] === "watch"
          ? url.searchParams.get("v")
          : parts[0] === "embed" || parts[0] === "shorts"
            ? parts[1]
            : null;
    if (!id || !ID.test(id)) return null;
    var t = url.searchParams.get("t") || url.searchParams.get("start") || "";
    var start = 0;
    if (/^\d+$/.test(t)) start = Number(t);
    else if (t) {
      var unit = function (u) {
        var m = t.match(new RegExp("(\\d+)" + u));
        return m ? Number(m[1]) : 0;
      };
      start = unit("h") * 3600 + unit("m") * 60 + unit("s");
    }
    return { id: id, start: start };
  }

  function src(id, start) {
    return (
      EMBED +
      id +
      "?autoplay=1&rel=0&modestbranding=1" +
      (start ? "&start=" + start : "")
    );
  }

  function playerFor(id) {
    var frames = document.querySelectorAll("iframe[src]");
    for (var i = 0; i < frames.length; i++) {
      var v = parse(frames[i].getAttribute("src"));
      if (v && v.id === id) return frames[i];
    }
    return null;
  }

  function seek(list, link, video) {
    var frame = playerFor(list.getAttribute("data-video") || video.id);
    if (!frame) return false; // player not rendered: let the link open YouTube
    var allow = frame.getAttribute("allow") || "";
    if (!/\bautoplay\b/.test(allow))
      frame.setAttribute("allow", (allow ? allow + "; " : "") + "autoplay");
    frame.setAttribute("src", src(video.id, video.start));
    var current = list.querySelectorAll('a[aria-current="true"]');
    for (var i = 0; i < current.length; i++)
      current[i].removeAttribute("aria-current");
    link.setAttribute("aria-current", "true");
    var r = frame.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight)
      frame.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }

  var dialog;
  var opener;
  function close() {
    if (dialog && dialog.open) dialog.close();
  }
  function ensureDialog() {
    if (dialog && document.body.contains(dialog)) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "sol-video-dialog";
    dialog.setAttribute("aria-label", "Video player");
    var button = document.createElement("button");
    button.type = "button";
    button.className = "sol-video-dialog-close";
    button.setAttribute("aria-label", "Close video");
    button.textContent = "×";
    button.addEventListener("click", close);
    var frame = document.createElement("div");
    frame.className = "sol-video-dialog-frame";
    dialog.appendChild(button);
    dialog.appendChild(frame);
    // A click on the backdrop (the dialog box itself, outside the player)
    // closes it.
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) close();
    });
    dialog.addEventListener("close", function () {
      frame.textContent = ""; // removes the iframe: playback stops
      if (opener && document.body.contains(opener))
        opener.focus({ preventScroll: true });
      opener = null;
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function openModal(link, video) {
    if (typeof HTMLDialogElement !== "function") return false;
    var d = ensureDialog();
    var title =
      (link.querySelector("h2, h3, [class*='title']") || link).textContent ||
      "Video";
    title = title.trim().split("\n")[0];
    var iframe = document.createElement("iframe");
    iframe.src = src(video.id, video.start);
    iframe.title = title;
    iframe.allow =
      "autoplay; encrypted-media; picture-in-picture; fullscreen; web-share";
    iframe.setAttribute("allowfullscreen", "");
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    var box = d.querySelector(".sol-video-dialog-frame");
    box.textContent = "";
    box.appendChild(iframe);
    d.setAttribute("aria-label", title);
    opener = link;
    d.showModal();
    return true;
  }

  document.addEventListener(
    "click",
    function (e) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      var link = e.target.closest && e.target.closest("a[href]");
      if (!link) return;
      var list = link.closest(".sol-chapters");
      var grid = list ? null : link.closest(".sol-video-modal");
      if (!list && !grid) return;
      var video = parse(link.getAttribute("href"));
      if (!video) return;
      var handled = list ? seek(list, link, video) : openModal(link, video);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
})();
